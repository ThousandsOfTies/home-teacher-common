import messages from '../i18n/locales/ja.json'
import type { GradeResponse, GradingResult, GradingResponseResult } from './api'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const invalid = () => new Error(messages.errors.invalidGradingResponse)

function normalizeProblems(value: unknown, depth = 0): GradingResult[] {
  if (depth > 4) throw invalid()
  if (Array.isArray(value)) return value.flatMap(item => normalizeProblems(item, depth + 1))
  if (!isObject(value)) throw invalid()
  if ((typeof value.problemNumber === 'string' || typeof value.problemNumber === 'number') &&
    typeof value.studentAnswer === 'string') {
    if (value.isCorrect !== undefined && typeof value.isCorrect !== 'boolean') throw invalid()
    return [{ ...value, problemNumber: String(value.problemNumber) } as unknown as GradingResult]
  }
  const keys = Object.keys(value).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b))
  if (!keys.length) throw invalid()
  return keys.flatMap(key => normalizeProblems(value[key], depth + 1))
}

/** Accept legacy collection shapes here, before either the screen or history sees them. */
export function normalizeGradeResponse(value: unknown): GradeResponse {
  if (!isObject(value) || typeof value.success !== 'boolean') throw invalid()
  if (!value.success) return { ...value, success: false, result: { problems: [] } } as GradeResponse
  const raw = value.result
  const result = isObject(raw) && 'problems' in raw
    ? { ...raw, problems: normalizeProblems(raw.problems) }
    : { problems: normalizeProblems(raw) }
  return { ...value, success: true, result: result as GradingResponseResult } as GradeResponse
}
