/**
 * iPadOSのデスクトップ表示はMacintoshを名乗るため、User-Agentだけでは
 * 判定できない。タッチ点数も併用してCanvasの安全上限を選ぶ。
 */
export const isIOSLikeDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
