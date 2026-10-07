import messages from '../i18n/locales/ja.json'

import { isIOSLikeDevice } from './platform'

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
        image.onerror = () => reject(new Error(messages.errors.imageCompress))
        image.src = imageData
    })
)
