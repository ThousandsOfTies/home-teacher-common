import messages from '../i18n/locales/ja.json'

/** Production targets are supplied by each app; only development has a local default. */
export function resolveApiBaseUrl(url: string | undefined, development: boolean): string {
  const configured = url?.trim()
  if (!configured) {
    if (development) return 'http://localhost:3003'
    throw new Error(messages.errors.apiNotConfigured)
  }
  try {
    const parsed = new URL(configured)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new TypeError()
    }
    return configured.replace(/\/+$/, '')
  } catch {
    throw new Error(messages.errors.apiInvalidUrl)
  }
}

export const getApiBaseUrl = () => resolveApiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV)
