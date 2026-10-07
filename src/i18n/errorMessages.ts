import type { TFunction } from 'i18next'
import ja from './locales/ja.json'

// Keep diagnostic Error.message values stable; translate them only when shown in the UI.
export function translateKnownMessage(message: string, messages: Record<string, string>,
  t: TFunction, namespace: string): string | undefined {
  const key = Object.keys(messages).find(key => messages[key] === message)
  return key ? t(`${namespace}:errors.${key}`) : undefined
}

export function localizeErrorMessage(error: unknown, t: TFunction): string {
  const message = error instanceof Error ? error.message : String(error)
  const translated = translateKnownMessage(message, ja.errors, t, 'translation')
  if (translated !== undefined) return translated
  if (message.startsWith('Error: ')) {
    return 'Error: ' + localizeErrorMessage(message.slice(7), t)
  }
  if (message.startsWith(ja.errors.pdfDataLoadPrefix)) {
    return t('translation:errors.pdfDataLoadPrefix') +
      localizeErrorMessage(message.slice(ja.errors.pdfDataLoadPrefix.length), t)
  }
  return message
}
