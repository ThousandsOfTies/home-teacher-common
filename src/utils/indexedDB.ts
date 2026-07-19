// IndexedDB管理ユーティリティ

// 共通ライブラリの既定値はTutoTutoのまま維持し、各アプリのビルド設定で分離する。
export const DB_NAME = import.meta.env.VITE_INDEXED_DB_NAME || 'TutoTutoDB';
const DB_VERSION = 12; // 採点履歴をBlob参照形式へ一本化
const STORE_NAME = 'pdfFiles';
const DRAWING_STORE_NAME = 'drawings';
const SNS_STORE_NAME = 'snsLinks';
const GRADING_HISTORY_STORE_NAME = 'gradingHistory';
const GRADING_IMAGE_STORE_NAME = 'gradingImages';
const SETTINGS_STORE_NAME = 'settings';
const SNS_USAGE_HISTORY_STORE_NAME = 'snsUsageHistory';


export interface PDFFileRecord {
  id: string; // ユニークID (ファイル名 + タイムスタンプ)
  fileName: string;
  thumbnail?: string; // 先頭ページのサムネイル画像（Base64）
  fileData?: Blob; // Blob形式のPDFデータ（v6から）
  lastOpened: number; // タイムスタンプ
  lastPageNumberA?: number; // 最後に開いていたページ番号 (A面)
  lastPageNumberB?: number; // 最後に開いていたページ番号 (B面)
  drawings: Record<number, string>; // ページ番号 -> JSON文字列のマップ
  textAnnotations?: Record<number, string>; // ページ番号 -> JSON文字列のマップ（テキストアノテーション）
  subjectId?: string; // 教科識別子 (math, japanese, etc)
}

interface DrawingRecord {
  id: string;
  pdfId: string;
  pageNumber: number;
  data: string;
  updatedAt: number;
}

interface GradingImageRecord {
  id: string;
  blob: Blob;
  createdAt: number;
}

export interface SNSLinkRecord {
  id: string; // ユニークID
  name: string; // SNS名（例: Twitter, Instagram）
  url: string; // リンク先URL
  icon: string; // 絵文字アイコン
  createdAt: number; // 作成日時
}

export interface GradingHistoryRecord {
  id: string; // ユニークID
  pdfId: string; // PDFファイルのID
  pdfFileName: string; // 問題集の名称
  pageNumber: number; // ページ番号
  problemNumber: string; // 問題番号
  studentAnswer: string; // 生徒の解答
  isCorrect: boolean; // 正解/不正解
  correctAnswer: string; // 正しい解答
  feedback: string; // フィードバック
  explanation: string; // 解説
  timestamp: number; // 実施時刻（タイムスタンプ）
  imageData?: string; // Blobから復元した画面表示用データ（保存しない）
  imageId?: string; // v11以降: gradingImagesストアへの参照
  teacherMode?: 'kind' | 'balanced' | 'strict'; // 採点時の先生レベル
  score?: number; // 作品評価（1〜5）
  overallComment?: string; // 作品全体の印象
  nextPoint?: string; // 次に直すポイント
  practiceAdvice?: string; // 次の一枚へのアドバイス
  matchingMetadata?: {
    method: 'exact' | 'ai' | 'context' | 'hybrid';
    confidence?: string;
    reasoning?: string;
    candidates?: string[];
    similarity?: number;
  }; // マッチング詳細データ（デバッグ用）
}

export interface AppSettings {
  id: 'app-settings'; // 固定ID
  snsTimeLimitMinutes: number; // SNS利用制限時間（分）
  notificationEnabled: boolean; // 通知の有効/無効
  defaultGradingModel?: string; // 採点時のデフォルトAIモデル
  isPremium?: boolean; // 有料プラン（ファミリー解除）フラグ
  enabledTeacherModes?: Array<'kind' | 'balanced' | 'strict'>; // 利用可能な先生レベル
  defaultTeacherMode?: 'kind' | 'balanced' | 'strict'; // 採点時の初期先生レベル
}

export interface SNSUsageHistoryRecord {
  id: string; // ユニークID
  snsId: string; // SNSのID
  snsName: string; // SNS名（例: YouTube, Twitter）
  snsUrl: string; // アクセスしたURL
  timeLimitMinutes: number; // 設定されていた制限時間（分）
  timestamp: number; // アクセス日時（タイムスタンプ）
}



// Cached DB instance for Singleton pattern
let dbInstance: IDBDatabase | null = null;

export function deleteAppDatabase(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('データベースの削除に失敗しました'));
    request.onblocked = () => reject(new Error('データベースが使用中のため削除できませんでした'));
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Return cached instance if active
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    console.log('🔓 IndexedDB開く:', {
      dbName: DB_NAME,
      version: DB_VERSION,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ IndexedDB開くエラー:', {
        error: request.error,
        dbName: DB_NAME,
        version: DB_VERSION
      });
      reject(new Error('IndexedDBを開けませんでした'));
    };

    request.onsuccess = () => {
      console.log('✅ IndexedDB開く成功:', {
        dbName: request.result.name,
        version: request.result.version,
        objectStoreNames: Array.from(request.result.objectStoreNames)
      });

      const db = request.result;
      dbInstance = db;

      // Handle connection closing (e.g. version change or manual close)
      db.onclose = () => {
        console.log('🔒 IndexedDB接続が閉じられました');
        dbInstance = null;
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // PDFファイル用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('lastOpened', 'lastOpened', { unique: false });
      }

      // 筆跡はPDF本体と分離し、1ストロークごとに大きなPDF Blobを
      // 再保存しない。ページ単位なので更新競合と書き込み量も抑えられる。
      if (!db.objectStoreNames.contains(DRAWING_STORE_NAME)) {
        const drawingStore = db.createObjectStore(DRAWING_STORE_NAME, { keyPath: 'id' });
        drawingStore.createIndex('pdfId', 'pdfId', { unique: false });
        drawingStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // SNSリンク用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(SNS_STORE_NAME)) {
        const snsStore = db.createObjectStore(SNS_STORE_NAME, { keyPath: 'id' });
        snsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 採点履歴用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(GRADING_HISTORY_STORE_NAME)) {
        const historyStore = db.createObjectStore(GRADING_HISTORY_STORE_NAME, { keyPath: 'id' });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        historyStore.createIndex('pdfId', 'pdfId', { unique: false });
        historyStore.createIndex('pageNumber', 'pageNumber', { unique: false });
      }
      const upgradeTransaction = (event.target as IDBOpenDBRequest).transaction!;
      const historyStore = upgradeTransaction.objectStore(GRADING_HISTORY_STORE_NAME);
      if (!historyStore.indexNames.contains('imageId')) {
        historyStore.createIndex('imageId', 'imageId', { unique: false });
      }

      if (!db.objectStoreNames.contains(GRADING_IMAGE_STORE_NAME)) {
        const imageStore = db.createObjectStore(GRADING_IMAGE_STORE_NAME, { keyPath: 'id' });
        imageStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 正式利用前のため、Base64画像を内包する旧形式の採点履歴は移行しない。
      if (oldVersion > 0 && oldVersion < 12) {
        historyStore.clear();
        upgradeTransaction.objectStore(GRADING_IMAGE_STORE_NAME).clear();
      }

      // 設定用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
        db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'id' });
      }

      // SNS利用履歴用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(SNS_USAGE_HISTORY_STORE_NAME)) {
        const snsUsageStore = db.createObjectStore(SNS_USAGE_HISTORY_STORE_NAME, { keyPath: 'id' });
        snsUsageStore.createIndex('timestamp', 'timestamp', { unique: false });
        snsUsageStore.createIndex('snsId', 'snsId', { unique: false });
      }

      // v10: PDFレコード内の筆跡をページ別ストアへ移行する。
      if (oldVersion > 0 && oldVersion < 10 && db.objectStoreNames.contains(STORE_NAME)) {
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const pdfStore = transaction.objectStore(STORE_NAME);
        const drawingStore = transaction.objectStore(DRAWING_STORE_NAME);
        const cursorRequest = pdfStore.openCursor();

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const record = cursor.value as PDFFileRecord & { fileData?: string | Blob };
          const drawings = record.drawings || {};
          let recordChanged = false;

          // v6以前から直接v10へ上がる場合も同じカーソル内で変換し、
          // 複数の移行処理が同じPDFレコードを上書きし合わないようにする。
          if (record.fileData && typeof record.fileData === 'string') {
            try {
              const binaryString = atob(record.fileData);
              const bytes = new Uint8Array(binaryString.length);
              for (let index = 0; index < binaryString.length; index += 1) {
                bytes[index] = binaryString.charCodeAt(index);
              }
              record.fileData = new Blob([bytes], { type: 'application/pdf' });
              recordChanged = true;
            } catch (error) {
              console.error(`❌ ${record.fileName} のBase64→Blob変換失敗:`, error);
            }
          }
          for (const [pageNumber, data] of Object.entries(drawings)) {
            const page = Number(pageNumber);
            if (!Number.isFinite(page) || typeof data !== 'string') continue;
            const drawingRecord: DrawingRecord = {
              id: `${record.id}:${page}`,
              pdfId: record.id,
              pageNumber: page,
              data,
              updatedAt: record.lastOpened || Date.now()
            };
            drawingStore.put(drawingRecord);
          }
          if (Object.keys(drawings).length > 0) {
            record.drawings = {};
            recordChanged = true;
          }
          if (recordChanged) cursor.update(record);
          cursor.continue();
        };
      }
    };
  });
}

// すべてのPDFファイルレコードを取得
export async function getAllPDFRecords(): Promise<PDFFileRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('lastOpened');
    const request = index.openCursor(null, 'prev'); // 最近開いた順

    const records: PDFFileRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (!cursor) {
        console.log(`✅ 全PDFレコード取得完了: ${records.length}件`);
        resolve(records);
        return;
      }

      const record = cursor.value;
      console.log('📄 PDFレコード取得:', {
        id: record.id,
        fileName: record.fileName,
        hasFileData: !!record.fileData,
        fileDataType: record.fileData ? (record.fileData instanceof Blob ? 'Blob' : typeof record.fileData) : 'null',
        fileDataSize: record.fileData instanceof Blob ? record.fileData.size : 'N/A'
      });
      records.push(record);
      cursor.continue();
    };

    request.onerror = () => {
      console.error('❌ PDFレコード取得エラー:', request.error);
      reject(new Error('レコードの取得に失敗しました'));
    };
  });
}

// PDFファイルレコードを追加または更新
export async function savePDFRecord(record: PDFFileRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('レコードの保存に失敗しました'));
    };
  });
}

// PDFファイルレコードの一部を更新
export async function updatePDFRecord(id: string, updates: Partial<PDFFileRecord>): Promise<void> {
  const record = await getPDFRecord(id);
  if (!record) {
    throw new Error(`PDF record not found: ${id}`);
  }
  const updatedRecord = { ...record, ...updates };
  await savePDFRecord(updatedRecord);
}

// 特定のPDFファイルレコードを取得
export async function getPDFRecord(id: string): Promise<PDFFileRecord | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('レコードの取得に失敗しました'));
    };
  });
}

// PDFファイルレコードを削除
export async function deletePDFRecord(id: string): Promise<void> {
  cancelScheduledDrawingSaves(id);
  await waitForDrawingSaves(id);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, DRAWING_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    const drawingStore = transaction.objectStore(DRAWING_STORE_NAME);
    drawingStore.index('pdfId').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursor | null>).result;
      if (!cursor) return;
      drawingStore.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('レコードの削除に失敗しました'));
    transaction.onabort = () => reject(new Error('レコードの削除に失敗しました'));
  });
}

// ペン跡を保存
const drawingSaveQueues = new Map<string, Promise<void>>();
const scheduledDrawingSaves = new Map<string, {
  id: string;
  pageNumber: number;
  drawingData: string;
  timer: ReturnType<typeof setTimeout>;
}>();
const DRAWING_SAVE_DEBOUNCE_MS = 400;

export function saveDrawing(id: string, pageNumber: number, drawingData: string): Promise<void> {
  const key = `${id}:${pageNumber}`;
  const previous = drawingSaveQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([DRAWING_STORE_NAME], 'readwrite');
      const record: DrawingRecord = {
        id: key,
        pdfId: id,
        pageNumber,
        data: drawingData,
        updatedAt: Date.now()
      };
      transaction.objectStore(DRAWING_STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('ペン跡の保存に失敗しました'));
      transaction.onabort = () => reject(new Error('ペン跡の保存に失敗しました'));
    });
  });
  drawingSaveQueues.set(key, next);
  void next.catch(error => console.error('ペン跡の保存に失敗しました:', error));
  void next.then(() => {
    if (drawingSaveQueues.get(key) === next) drawingSaveQueues.delete(key);
  }, () => {
    if (drawingSaveQueues.get(key) === next) drawingSaveQueues.delete(key);
  });
  return next;
}

/** 連続描画中のIndexedDB書き込みをまとめ、最後の状態だけを保存する。 */
export function scheduleDrawingSave(id: string, pageNumber: number, drawingData: string): void {
  const key = `${id}:${pageNumber}`;
  const previous = scheduledDrawingSaves.get(key);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    scheduledDrawingSaves.delete(key);
    void saveDrawing(id, pageNumber, drawingData);
  }, DRAWING_SAVE_DEBOUNCE_MS);
  scheduledDrawingSaves.set(key, { id, pageNumber, drawingData, timer });
}

/** ページ遷移・終了前に保留中の状態を確実に永続化する。 */
export async function flushDrawingSaves(id: string, pageNumber?: number): Promise<void> {
  const prefix = `${id}:`;
  const pending = [...scheduledDrawingSaves.entries()].filter(([key, entry]) => (
    key.startsWith(prefix) && (pageNumber === undefined || entry.pageNumber === pageNumber)
  ));
  pending.forEach(([key, entry]) => {
    clearTimeout(entry.timer);
    scheduledDrawingSaves.delete(key);
  });
  await Promise.all(pending.map(([, entry]) => saveDrawing(entry.id, entry.pageNumber, entry.drawingData)));
  await waitForDrawingSaves(id, pageNumber);
}

function cancelScheduledDrawingSaves(id: string): void {
  const prefix = `${id}:`;
  for (const [key, entry] of scheduledDrawingSaves) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(entry.timer);
    scheduledDrawingSaves.delete(key);
  }
}

async function waitForDrawingSaves(id: string, pageNumber?: number): Promise<void> {
  const exactKey = pageNumber === undefined ? null : `${id}:${pageNumber}`;
  await Promise.all(
    [...drawingSaveQueues.entries()]
      .filter(([key]) => exactKey ? key === exactKey : key.startsWith(`${id}:`))
      .map(([, pending]) => pending.catch(() => undefined))
  );
}

// ペン跡を取得
export async function getDrawing(id: string, pageNumber: number): Promise<string | null> {
  await flushDrawingSaves(id, pageNumber);
  const db = await openDB();
  const stored = await new Promise<DrawingRecord | null>((resolve, reject) => {
    const request = db.transaction([DRAWING_STORE_NAME], 'readonly')
      .objectStore(DRAWING_STORE_NAME)
      .get(`${id}:${pageNumber}`);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('ペン跡の取得に失敗しました'));
  });
  if (stored) return stored.data;

  // v10移行前データに対する安全なフォールバック。
  const record = await getPDFRecord(id);
  return record?.drawings?.[pageNumber] || null;
}

export async function getAllDrawings(id: string): Promise<Record<number, string>> {
  await flushDrawingSaves(id);
  const db = await openDB();
  const stored = await new Promise<DrawingRecord[]>((resolve, reject) => {
    const request = db.transaction([DRAWING_STORE_NAME], 'readonly')
      .objectStore(DRAWING_STORE_NAME)
      .index('pdfId')
      .getAll(IDBKeyRange.only(id));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('ペン跡の取得に失敗しました'));
  });
  const result: Record<number, string> = {};
  for (const drawing of stored) result[drawing.pageNumber] = drawing.data;
  if (stored.length === 0) {
    const legacyRecord = await getPDFRecord(id);
    Object.assign(result, legacyRecord?.drawings || {});
  }
  return result;
}

export async function deleteAllDrawings(id: string): Promise<void> {
  cancelScheduledDrawingSaves(id);
  await waitForDrawingSaves(id);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([DRAWING_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(DRAWING_STORE_NAME);
    store.index('pdfId').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursor | null>).result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('ペン跡の削除に失敗しました'));
    transaction.onabort = () => reject(new Error('ペン跡の削除に失敗しました'));
  });
}

// テキストアノテーションを保存
export async function saveTextAnnotation(id: string, pageNumber: number, textData: string): Promise<void> {
  const record = await getPDFRecord(id);
  if (!record) {
    throw new Error('PDFレコードが見つかりません');
  }

  if (!record.textAnnotations) {
    record.textAnnotations = {};
  }
  record.textAnnotations[pageNumber] = textData;
  record.lastOpened = Date.now();

  await savePDFRecord(record);
}

// テキストアノテーションを取得
export async function getTextAnnotation(id: string, pageNumber: number): Promise<string | null> {
  const record = await getPDFRecord(id);
  if (!record) {
    return null;
  }

  return record.textAnnotations?.[pageNumber] || null;
}

// IDを生成（ファイル名とタイムスタンプから）
export function generatePDFId(fileName: string): string {
  // ファイル名をベースにしたユニークID
  return `${fileName}_${Date.now()}`;
}

// すべてのSNSリンクを取得
export async function getAllSNSLinks(): Promise<SNSLinkRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SNS_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(SNS_STORE_NAME);
    const index = objectStore.index('createdAt');
    const request = index.openCursor(null, 'next'); // 作成日時順

    const records: SNSLinkRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('SNSリンクの取得に失敗しました'));
    };
  });
}

// SNSリンクを追加または更新
export async function saveSNSLink(record: SNSLinkRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SNS_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(SNS_STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('SNSリンクの保存に失敗しました'));
    };
  });
}

// SNSリンクを削除
export async function deleteSNSLink(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SNS_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(SNS_STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('SNSリンクの削除に失敗しました'));
    };
  });
}

// SNSリンクIDを生成
export function generateSNSLinkId(name: string): string {
  return `sns_${name}_${Date.now()}`;
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('採点画像の変換に失敗しました');
  return response.blob();
}

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('採点画像の読み込みに失敗しました'));
  reader.readAsDataURL(blob);
});

const createBlobId = async (blob: Blob): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `grading-image-${hash}`;
}

/** 同じ画像は内容ハッシュで1件だけ保存し、複数の採点項目から共有する。 */
export async function saveGradingImage(imageData: string): Promise<string> {
  const blob = await dataUrlToBlob(imageData);
  const id = await createBlobId(blob);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([GRADING_IMAGE_STORE_NAME], 'readwrite');
    const record: GradingImageRecord = { id, blob, createdAt: Date.now() };
    transaction.objectStore(GRADING_IMAGE_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('採点画像の保存に失敗しました'));
    transaction.onabort = () => reject(new Error('採点画像の保存に失敗しました'));
  });
  return id;
}

export async function getGradingImageData(id: string): Promise<string | null> {
  const db = await openDB();
  const record = await new Promise<GradingImageRecord | null>((resolve, reject) => {
    const request = db.transaction([GRADING_IMAGE_STORE_NAME], 'readonly')
      .objectStore(GRADING_IMAGE_STORE_NAME)
      .get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('採点画像の取得に失敗しました'));
  });
  return record ? blobToDataUrl(record.blob) : null;
}

const hydrateGradingImages = async (records: GradingHistoryRecord[]): Promise<GradingHistoryRecord[]> => {
  const imageIds = [...new Set(records.flatMap(record => record.imageId ? [record.imageId] : []))];
  const images = new Map<string, string>();
  await Promise.all(imageIds.map(async imageId => {
    const imageData = await getGradingImageData(imageId);
    if (imageData) images.set(imageId, imageData);
  }));
  return records.map(record => ({
    ...record,
    imageData: record.imageId ? images.get(record.imageId) : undefined
  }));
}

// 採点履歴を保存
export async function saveGradingHistory(record: GradingHistoryRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('採点履歴の保存に失敗しました'));
    };
  });
}

// すべての採点履歴を取得（新しい順）
export async function getAllGradingHistory(): Promise<GradingHistoryRecord[]> {
  const db = await openDB();

  const records = await new Promise<GradingHistoryRecord[]>((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const index = objectStore.index('timestamp');
    const request = index.openCursor(null, 'prev'); // 新しい順

    const records: GradingHistoryRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('採点履歴の取得に失敗しました'));
    };
  });
  return hydrateGradingImages(records);
}

// 特定のPDFの採点履歴を取得
export async function getGradingHistoryByPdfId(pdfId: string): Promise<GradingHistoryRecord[]> {
  const db = await openDB();

  const records = await new Promise<GradingHistoryRecord[]>((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const index = objectStore.index('pdfId');
    const request = index.openCursor(IDBKeyRange.only(pdfId), 'prev');

    const records: GradingHistoryRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('採点履歴の取得に失敗しました'));
    };
  });
  return hydrateGradingImages(records);
}

// 特定の採点履歴を取得
export async function getGradingHistory(id: string): Promise<GradingHistoryRecord | null> {
  const db = await openDB();

  const record = await new Promise<GradingHistoryRecord | null>((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('採点履歴の取得に失敗しました'));
    };
  });
  if (!record) return null;
  return (await hydrateGradingImages([record]))[0];
}

// 採点履歴を削除
export async function deleteGradingHistory(id: string): Promise<void> {
  const db = await openDB();
  const existing = await new Promise<GradingHistoryRecord | null>((resolve, reject) => {
    const request = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly')
      .objectStore(GRADING_HISTORY_STORE_NAME)
      .get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('採点履歴の取得に失敗しました'));
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    objectStore.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('採点履歴の削除に失敗しました'));
    transaction.onabort = () => reject(new Error('採点履歴の削除に失敗しました'));
  });

  if (!existing?.imageId) return;
  const remainingReferences = await new Promise<number>((resolve, reject) => {
    const request = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly')
      .objectStore(GRADING_HISTORY_STORE_NAME)
      .index('imageId')
      .count(IDBKeyRange.only(existing.imageId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('採点画像の参照確認に失敗しました'));
  });
  if (remainingReferences === 0) {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([GRADING_IMAGE_STORE_NAME], 'readwrite');
      transaction.objectStore(GRADING_IMAGE_STORE_NAME).delete(existing.imageId!);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('採点画像の削除に失敗しました'));
      transaction.onabort = () => reject(new Error('採点画像の削除に失敗しました'));
    });
  }
}

// アプリ設定を取得
export async function getAppSettings(): Promise<AppSettings> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTINGS_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(SETTINGS_STORE_NAME);
    const request = objectStore.get('app-settings');

    request.onsuccess = () => {
      const settings = request.result as AppSettings | undefined;
      // デフォルト値: 30分、通知無効、モデルは未指定（バックエンドのデフォルト使用）
      resolve(settings || {
        id: 'app-settings',
        snsTimeLimitMinutes: 30,
        notificationEnabled: false,
        defaultGradingModel: undefined,
        enabledTeacherModes: ['kind'],
        defaultTeacherMode: 'kind'
      });
    };

    request.onerror = () => {
      reject(new Error('設定の取得に失敗しました'));
    };
  });
}

// アプリ設定を保存
export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTINGS_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(SETTINGS_STORE_NAME);
    const request = objectStore.put(settings);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('設定の保存に失敗しました'));
    };
  });
}

// 採点履歴IDを生成
export function generateGradingHistoryId(): string {
  return `grading_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// SNS利用履歴を保存
export async function saveSNSUsageHistory(record: Omit<SNSUsageHistoryRecord, 'id'>): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const transaction = db.transaction([SNS_USAGE_HISTORY_STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(SNS_USAGE_HISTORY_STORE_NAME);

      const historyRecord: SNSUsageHistoryRecord = {
        id: `sns_usage_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        ...record
      };

      const request = objectStore.add(historyRecord);

      transaction.oncomplete = () => {
        console.log('✅ SNS利用履歴を保存:', historyRecord);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ SNS利用履歴の保存に失敗:', request.error);
        reject(new Error('SNS利用履歴の保存に失敗しました'));
      };
    }).catch(reject);
  });
}

// SNS利用履歴を取得（新しい順）
export async function getSNSUsageHistory(): Promise<SNSUsageHistoryRecord[]> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const transaction = db.transaction([SNS_USAGE_HISTORY_STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(SNS_USAGE_HISTORY_STORE_NAME);
      const index = objectStore.index('timestamp');
      const request = index.openCursor(null, 'prev'); // 新しい順

      const results: SNSUsageHistoryRecord[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          console.log('✅ SNS利用履歴を取得:', results.length);
          resolve(results);
        }
      };

      request.onerror = () => {
        console.error('❌ SNS利用履歴の取得に失敗:', request.error);
        reject(new Error('SNS利用履歴の取得に失敗しました'));
      };
    }).catch(reject);
  });
}

// PDFデータを直接ArrayBufferとして取得（iPadのStale Blob対策）
export async function fetchPDFData(id: string): Promise<ArrayBuffer> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = async () => {
      const record = request.result as PDFFileRecord | undefined;
      if (!record || !record.fileData) {
        reject(new Error('PDFデータが見つかりません'));
        return;
      }

      try {
        let buffer: ArrayBuffer;
        if (record.fileData instanceof Blob) {
          if (record.fileData.size === 0) {
            reject(new Error('PDFファイルのサイズが0バイトです'));
            return;
          }
          // Blobを即座にbufferに読み込むことで、transaction終了後の無効化を防ぐ
          buffer = await record.fileData.arrayBuffer();
        } else {
          // Base64 -> ArrayBuffer
          const binaryString = atob(record.fileData as unknown as string);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          buffer = bytes.buffer;
        }
        resolve(buffer);
      } catch (e) {
        reject(new Error('PDFデータの読み込みに失敗しました: ' + (e instanceof Error ? e.message : String(e))));
      }
    };

    request.onerror = () => {
      reject(new Error('PDFデータの取得に失敗しました'));
    };
  });
}
