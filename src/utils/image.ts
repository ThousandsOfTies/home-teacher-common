
import { isIOSLikeDevice } from './platform'

export const compressImage = (canvas: HTMLCanvasElement, maxSize: number = 1024): string => {
    const isIOS = isIOSLikeDevice()
    if (canvas.width <= maxSize && canvas.height <= maxSize) {
        return canvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
    }
    const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height)
    const targetWidth = Math.floor(canvas.width * scale)
    const targetHeight = Math.floor(canvas.height * scale)
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = targetWidth
    tempCanvas.height = targetHeight
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) {
        throw new Error('Canvas context creation failed')
    }
    tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
    return tempCanvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
}

/** PNGなどのData URLを、AI判定に十分な解像度のJPEGへ変換する。 */
export const compressImageDataUrl = (imageData: string, maxSize: number = 2048): Promise<string> => (
    new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
            const context = canvas.getContext('2d')
            if (!context) {
                reject(new Error('Canvas context creation failed'))
                return
            }
            // 透明な描画面がJPEGで黒くならないよう白地を明示する。
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            resolve(canvas.toDataURL('image/jpeg', isIOSLikeDevice() ? 0.78 : 0.84))
        }
        image.onerror = () => reject(new Error('画像の圧縮に失敗しました'))
        image.src = imageData
    })
)
