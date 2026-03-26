// ============================================================
// 採点関連の共通定数・プロンプト生成関数
// home-teacher-common / src / constants / grading.ts
// ============================================================

// ----------------------------------------
// 利用可能なモデル一覧
// ----------------------------------------
export const DEFAULT_MODEL_ID = 'gemini-2.5-flash'

export const AVAILABLE_MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', description: '最新世代・最高精度モデル（プレビュー版）' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: '次世代の高速・高精度モデル（プレビュー版）' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '複雑な論理推論に強いハイエンドモデル（GA）' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '速度と精度のバランスが良いモデル（推奨・GA）' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: '超高速・低コストモデル（GA）' },
]

// ----------------------------------------
// 教科定義
// ----------------------------------------
export const SUBJECTS = [
  { id: 'math',     labels: { ja: '算数・数学', en: 'Math' },           icon: '📐', description: 'Mathematics and Arithmetic' },
  { id: 'japanese', labels: { ja: '国語',       en: 'Japanese' },        icon: '🇯🇵', description: 'Japanese Language' },
  { id: 'english',  labels: { ja: '英語',       en: 'English' },         icon: '🇬🇧', description: 'English Language' },
  { id: 'science',  labels: { ja: '理科',       en: 'Science' },         icon: '🔬', description: 'Science' },
  { id: 'social',   labels: { ja: '社会',       en: 'Social Studies' },  icon: '🌍', description: 'Social Studies' },
  { id: 'other',    labels: { ja: 'その他',     en: 'Other' },           icon: '📝', description: 'Other subjects' },
]

// ----------------------------------------
// 採点プロンプト生成
// ----------------------------------------
const SUBJECT_GUIDANCE: Record<string, { ja: string; en: string }> = {
  japanese: {
    ja: `\n\n【国語の採点について】
・記述問題では、生徒の表現が模範解答と異なっていても、意味が正しく伝わっていれば正解としてください。
・漢字の書き取りでは、とめ・はね・はらいを厳密にチェックしてください。
・文章の読解では、本文の内容と照らし合わせて判定してください。`,
    en: `\n\n【Japanese Language Grading】
・For written answers, accept answers that convey the correct meaning even if the expression differs from the model answer.
・For kanji writing, check the strokes strictly.
・For reading comprehension, verify against the text.`
  },
  math: {
    ja: `\n\n【算数・数学の採点について】
・計算過程が正しければ、最終的な答えが少し違っても部分点を考慮してください。
・単位の記入漏れは減点対象ですが、計算自体が正しければ大きく減点しないでください。
・図形問題では、補助線や考え方のプロセスも評価してください。`,
    en: `\n\n【Math Grading】
・If the calculation process is correct, consider partial credit even if the final answer is slightly different.
・Missing units should be noted but not heavily penalized if the calculation is correct.
・For geometry, evaluate the use of auxiliary lines and thought process.`
  },
  science: {
    ja: `\n\n【理科の採点について】
・専門用語の表記揺れ（ひらがな・カタカナ）は許容してください。
・実験の観察結果は、要点が合っていれば表現が違っても正解としてください。
・理由を問う問題では、科学的な根拠が含まれているか確認してください。`,
    en: `\n\n【Science Grading】
・Allow variations in technical term notation (hiragana/katakana).
・For experimental observations, accept if the key points are correct.
・For reasoning questions, verify scientific basis is included.`
  },
  social: {
    ja: `\n\n【社会の採点について】
・歴史的事項や地名の表記揺れは許容してください（例：「えどばくふ」「江戸幕府」）。
・記述問題では、重要なキーワードが含まれていれば、文章構成が違っても正解としてください。
・年号の前後数年のズレは大きく減点しないでください。`,
    en: `\n\n【Social Studies Grading】
・Allow variations in historical terms and place names.
・For written answers, accept if key terms are included.
・Minor errors in dates (within a few years) should not be heavily penalized.`
  },
  english: {
    ja: `\n\n【英語の採点について】
・スペルミスは減点対象ですが、意味が通じれば大きく減点しないでください。
・文法問題では、文法の理解を重視してください。
・英作文では、文法・語彙・内容の3つの観点で評価してください。`,
    en: `\n\n【English Grading】
・Spelling errors should be noted but not heavily penalized if meaning is clear.
・For grammar questions, focus on grammatical understanding.
・For composition, evaluate grammar, vocabulary, and content.`
  },
}

export function buildGradingPrompt(language: string | undefined, subjectId: string | undefined): string {
  const isJapanese = !language || language.startsWith('ja')
  const guidance = subjectId && SUBJECT_GUIDANCE[subjectId]
    ? (isJapanese ? SUBJECT_GUIDANCE[subjectId].ja : SUBJECT_GUIDANCE[subjectId].en)
    : ''

  if (isJapanese) {
    return `あなたは小中学生の家庭教師です。以下の画像には生徒の解答が写っています。${guidance}

この画像を見て以下のステップで処理してください：
1. 画像内に含まれる【すべての解答済みの問題】をもれなく特定してください（1問だけではありません）。
2. 各問題について、問題の形式（記述式、記号選択、穴埋めなど）を視覚的なレイアウトから正確に把握してください。
3. 生徒の手書き解答を読み取ってください。穴埋め形式の場合は、生徒が書き込んだ言葉が前後の印字されたテキストと合わさって正しい意味を成しているかを確認してください。
4. 正誤判定をしてください。
5. 正解とフィードバックを簡潔に提供してください。

【重要】複数の問題がある場合は、必ず以下の形式のJSONの「配列（Array）」を出力してください。前置きや説明文（jsonコードブロック指定など）は絶対に含めないでください：
[
  {
    "problemNumber": "問題番号（例: '1(1)', '2(3)'）",
    "studentAnswer": "生徒の解答",
    "isCorrect": true または false,
    "correctAnswer": "正解",
    "feedback": "1〜2文の簡潔なフィードバック（正解なら褒める、不正解なら要点のみ指摘）",
    "explanation": "3〜5文以内の簡潔な解説。要点のみ。長くしない。",
    "explanationSvg": "図解SVGコード（図形・グラフ問題のみ。不要ならnull）"
  }
]

【簡潔さの原則】
・feedbackは1〜2文以内。正解時は「正解です！〇〇を正しく使えています。」程度。
・explanationは3〜5文以内。核心的な考え方のみ述べる。詳細な場合分けや複数の解法は不要。
・SVGは図形・グラフ・数直線など視覚的補助が明確に必要な場合のみ生成。文章で十分な場合はnull。

【SVG生成ルール】（必要な場合のみ）
・SVGタグのみ（xmlコードブロック指定不要）。width/height属性なし、viewBoxのみ。
・色は #333 (黒), #e74c3c (赤/強調), #3498db (青/補助) を使い分け。

JSONのみを出力してください。「はい」「承知しました」などの前置きは不要です。`
  } else {
    return `You are a helpful tutor for students. The image shows a student's answer(s).${guidance}

Please analyze this image by following these steps:
1. Identify ALL answered problems in the image (do not stop at just one).
2. Understand the format of each question from the visual layout (fill-in-the-blank, multiple choice, free text, etc.).
3. Recognize the student's handwritten answer. For fill-in-the-blank, check if the handwritten word correctly completes the printed sentence.
4. Determine if the answer is correct.
5. Provide concise feedback and explanation.

【IMPORTANT】Output ONLY a JSON ARRAY. No introductory text or markdown:
[
  {
    "problemNumber": "Problem Number (e.g., '1(1)', '2(3)')",
    "studentAnswer": "Student's Answer",
    "isCorrect": true or false,
    "correctAnswer": "Correct Answer",
    "feedback": "1-2 sentences max. Praise if correct, briefly note the key point if wrong.",
    "explanation": "3-5 sentences max. Key concept only. Do not list multiple approaches.",
    "explanationSvg": "SVG code only if a diagram genuinely helps (geometry/graphs). null otherwise."
  }
]

【Brevity Rules】
- feedback: 1-2 sentences. For correct answers: "Great job! You correctly applied [concept]."
- explanation: 3-5 sentences. Core idea only. No exhaustive case analysis.
- SVG: only for geometry, graphs, or number lines. null if text suffices.

【SVG Rules】SVG tag only (no xml block). No width/height, use viewBox. Colors: #333, #e74c3c, #3498db.

Output ONLY JSON. No introductory text.`
  }
}
