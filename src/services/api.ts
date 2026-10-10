
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, SUBJECTS } from '../constants/grading'

import { getApiBaseUrl } from './apiConfig'
import { normalizeGradeResponse } from './gradingResponse'

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

export interface AvailableModelsResponse {
  models: ModelInfo[]
  default: string
}

export interface GradingResult {
  problemNumber: string
  studentAnswer: string
  correctAnswer?: string
  isCorrect?: boolean
  explanation?: string
  feedback?: string
  confidence?: string | number
  printedPageNumber?: number | null
  problemText?: string
  positionReasoning?: string
  overallComment?: string
  gradingSource?: string
  dbMatchedAnswer?: any
  matchingMetadata?: any
  explanationSvg?: string
}

export interface GradingResponseResult {
  pageType?: string
  printedPageNumber?: number | null
  problems: GradingResult[]
  overallComment?: string
  rawResponse?: string
}

export interface GradeResponse {
  success: boolean
  modelName?: string
  responseTime?: number
  result: GradingResponseResult
  error?: string
}

export type TeacherMode = 'kind' | 'balanced' | 'strict'

export const getAvailableModels = async (): Promise<AvailableModelsResponse> => {
  const response = await fetch(`${getApiBaseUrl()}/api/models`)
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`)
  }

  const text = await response.text()
  try {
    const result = JSON.parse(text) as AvailableModelsResponse
    return {
      default: result.default || DEFAULT_MODEL_ID,
      models: result.models || AVAILABLE_MODELS,
    }
  } catch (err) {
    console.error("Failed to parse models JSON. Response was:", text.substring(0, 100))
    throw new Error("Invalid JSON response from /api/models")
  }
}

// 簡素化された採点API（切り抜き画像のみ）
export const gradeWork = async (
  croppedImageData: string,
  model?: string,
  language: string = 'ja',
  subjectId?: string,  // Optional: subject ID for subject-specific grading
  teacherMode: TeacherMode = 'kind',
  panesReversed: boolean = false
): Promise<GradeResponse> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/grade-work`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        croppedImageData,
        // Omit the default selection so the API controls the deployed default.
        ...(model && model !== 'default' ? { model } : {}),
        language,
        teacherMode,
        panesReversed,
        ...(subjectId && { subjectId }), // Only include if provided (backward compatible)
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP Error: ${response.status}`)
    }

    const result = normalizeGradeResponse(await response.json())
    console.log(`✅ Grading Result:`, result)
    return result
  } catch (error) {
    console.error('❌ Grading Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      result: { problems: [] }
    }
  }
}

// 採点結果からの質問は採点とは別の指示で処理する。
export const askQuestion = async (
  questionImageData: string,
  parentResult: GradingResponseResult,
  model?: string,
  language: string = 'ja',
): Promise<GradeResponse> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/ask-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionImageData,
        parentResult,
        ...(model && model !== 'default' ? { model } : {}),
        language,
      }),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP Error: ${response.status}`)
    }
    return normalizeGradeResponse(await response.json())
  } catch (error) {
    console.error('質問への回答に失敗しました:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      result: { problems: [] },
    }
  }
}


// ==========================================
// Subject Management (Server-Driven)
// ==========================================

export interface SubjectLabel {
  ja: string
  en: string
  [key: string]: string
}

export interface SubjectInfo {
  id: string
  labels: SubjectLabel
  description?: string
  icon?: string // Optional icon/emoji
}

export interface SubjectsResponse {
  subjects: SubjectInfo[]
  default: string
}

export interface DetectSubjectResponse {
  success: boolean
  subjectId: string
  confidence: number
  error?: string
}

/**
 * Get available subjects from the server
 */
export const getSubjects = async (): Promise<SubjectsResponse> => {
  if (import.meta.env.VITE_USE_LOCAL_SUBJECTS_ONLY === 'true') return { subjects: SUBJECTS, default: 'math' }
  try {

    const response = await fetch(`${getApiBaseUrl()}/api/subjects`)

    if (!response.ok) {
      console.warn('⚠️ /api/subjects endpoint missing or error, using fallback list')
      throw new Error(`Failed to fetch subjects: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.warn('⚠️ Server subjects not available, using localized fallback')
    // Fallback: If server is not ready, return static list
    return {
      subjects: SUBJECTS,
      default: 'math'
    }
  }
}

/**
 * Detect subject from image (cover page)
 */
export const detectSubject = async (croppedImageData: string): Promise<DetectSubjectResponse> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/detect-subject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: croppedImageData
      }),
    })

    if (!response.ok) {
      // If 404 (endpoint not implemented), return mock response
      if (response.status === 404) {
        console.warn('⚠️ /api/detect-subject not implemented, returning mock result')
        return { success: true, subjectId: 'math', confidence: 0.5 }
      }
      throw new Error(`HTTP Error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('❌ Subject detection failed:', error)
    // Mock response for dev
    return {
      success: false,
      subjectId: 'math', // Default to math
      confidence: 0,
      error: String(error)
    }
  }
}
