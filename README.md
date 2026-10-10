# home-teacher-common

TutoTuto・DoriDori・CopiCopiの共通UI、PDF表示、保存、認証を提供するReact・TypeScriptライブラリです。

## 主な役割

- PDF・画像の取り込み、教材一覧、設定・履歴画面。
- 学習画面のツールバー、A/B切替・分割表示、範囲選択・拡大縮小。
- PDFページや注釈の読み込み・保存、パネル履歴を管理する共通フック。
- IndexedDB、Firebase認証、API通信、日本語・英語の共通文言。

学習・読書・模写の画面や、本文索引・画材・先生・レイヤーなどの固有機能は各アプリが管理します。共通部品を取り込むだけで他アプリの機能が有効になる構成にはしません。

## 利用方法

各メタリポジトリがGitサブモジュールとしてコミットを固定し、アプリのVite・TypeScript設定から兄弟ディレクトリの `src` を参照します。

- インポートは `@home-teacher/common/components/...`、`hooks/...`、`utils/...` などを使用します。
- `VITE_INDEXED_DB_NAME` はアプリ側で必ず指定します。共通の既定DB名はありません。
- 本番のAPI接続先は各アプリの `VITE_API_URL` で指定します。未設定時に他アプリのAPIへ接続する既定値はありません。
- 3アプリのDB名はそれぞれ `TutoTutoDB`、`DoriDoriDB`、`CopiCopiDB` です。
- 共通文言は [src/i18n/locales](src/i18n/locales) の `ja.json` / `en.json`、アプリ固有の文言は各アプリの翻訳ファイルへ置きます。

主な実装は [src/components](src/components)、[src/hooks](src/hooks)、[src/utils](src/utils) にあります。

## 開発・検証

```bash
npm install
npm test
```

変更時は3アプリの型チェック・ビルドで互換性も確認し、このリポジトリをcommit・pushしてから各メタのgitlinkを更新します。
