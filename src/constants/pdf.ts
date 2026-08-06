/**
 * PDF レンダリングの定数
 */

// PDFの論理座標は常に原寸（scale=1）。bitmapだけ表示倍率と端末性能に
// 合わせて可変解像度で描画する。
export const INITIAL_PDF_RENDER_SCALE = 1.5
export const MAX_PDF_RENDER_SCALE = 5
