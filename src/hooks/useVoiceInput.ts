import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAppSettings } from '../utils/indexedDB'

interface SpeechResult {
  readonly isFinal: boolean
  readonly [index: number]: { readonly transcript: string }
}

interface SpeechResultEvent {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechResult>
}

interface BrowserSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition
type VoicePhase = 'idle' | 'starting' | 'listening' | 'stopping'

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function appendSpeech(current: string, speech: string, japanese: boolean): string {
  const addition = speech.trim()
  if (!addition) return current
  if (!current || /\s$/.test(current)) return current + addition
  return current + (japanese ? '' : ' ') + addition
}

type Options = {
  initialText?: string
  language: string
  onCommit: (text: string) => void
  onCancel: () => void
  onDraftChange?: (text: string) => void
}

export function useVoiceInput({ initialText = '', language, onCommit, onCancel, onDraftChange }: Options) {
  const { userData } = useAuth()
  const japanese = language.startsWith('ja')
  const isLocalApp = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const [localPremium, setLocalPremium] = useState(false)
  const voiceAvailable = userData?.isPremium === true || (isLocalApp && localPremium)
  const browserSupported = Boolean(getSpeechRecognition())

  const [draft, setDraft] = useState(initialText)
  const [interim, setInterim] = useState('')
  const [phase, setPhaseState] = useState<VoicePhase>('idle')
  const phaseRef = useRef<VoicePhase>('idle')
  const setPhase = (next: VoicePhase) => { phaseRef.current = next; setPhaseState(next) }
  const [errorKey, setErrorKey] = useState('')
  const draftRef = useRef(initialText)
  const interimRef = useRef('')
  const finishedRef = useRef(false)
  const runRef = useRef(0)
  const stoppingRef = useRef(false)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const stopTimerRef = useRef<number | undefined>()

  useEffect(() => {
    if (!isLocalApp) return
    let cancelled = false
    void getAppSettings().then(settings => {
      if (!cancelled) setLocalPremium(settings.isPremium === true)
    }).catch(cause => console.error('Failed to load local Premium settings:', cause))
    return () => { cancelled = true }
  }, [isLocalApp])

  const disposeVoice = () => {
    runRef.current += 1
    window.clearTimeout(stopTimerRef.current)
    stopTimerRef.current = undefined
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.abort() } catch { /* already stopped */ }
    }
  }

  const settleInterim = () => {
    if (!interimRef.current) return
    const next = appendSpeech(draftRef.current, interimRef.current, japanese)
    draftRef.current = next
    interimRef.current = ''
    setDraft(next)
    setInterim('')
  }

  useEffect(() => () => { disposeVoice() }, [])

  const finish = (cancelled: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const text = appendSpeech(draftRef.current, interimRef.current, japanese)
    disposeVoice()
    if (cancelled) onCancel()
    else onCommit(text)
  }

  const startVoice = () => {
    if (!voiceAvailable || phaseRef.current !== 'idle') return
    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      setErrorKey('voice.unsupported')
      return
    }

    const run = ++runRef.current
    stoppingRef.current = false
    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = japanese ? 'ja-JP' : 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    setPhase('starting')
    setErrorKey('')
    setInterim('')
    interimRef.current = ''

    recognition.onstart = () => {
      if (run === runRef.current && !stoppingRef.current) setPhase('listening')
    }
    recognition.onresult = event => {
      if (run !== runRef.current) return
      let finalText = ''
      let pendingText = ''
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          // Earlier final results remain in the list; only append results changed by this event.
          if (index >= event.resultIndex) finalText = appendSpeech(finalText, transcript, japanese)
        } else {
          pendingText = appendSpeech(pendingText, transcript, japanese)
        }
      }
      if (finalText) {
        const next = appendSpeech(draftRef.current, finalText, japanese)
        draftRef.current = next
        setDraft(next)
      }
      interimRef.current = pendingText
      setInterim(pendingText)
    }
    recognition.onerror = event => {
      if (run !== runRef.current) return
      if (event.error === 'no-speech') {
        setErrorKey('voice.noSpeech')
        return
      }
      if (event.error === 'aborted' && stoppingRef.current) return
      settleInterim()
      disposeVoice()
      setPhase('idle')
      const messageKey = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'voice.permission'
        : event.error === 'audio-capture'
          ? 'voice.capture'
          : event.error === 'network'
            ? 'voice.network'
            : 'voice.failed'
      setErrorKey(messageKey)
    }
    recognition.onend = () => {
      if (run !== runRef.current) return
      settleInterim()
      disposeVoice()
      setPhase('idle')
    }

    try {
      recognition.start()
    } catch {
      disposeVoice()
      setPhase('idle')
      setErrorKey('voice.startFailed')
    }
  }

  const stopVoice = () => {
    if (phaseRef.current === 'idle' || phaseRef.current === 'stopping') return
    const recognition = recognitionRef.current
    if (!recognition) return
    stoppingRef.current = true
    setPhase('stopping')
    try {
      // stop() lets the browser return the final transcript before onend fires.
      recognition.stop()
      if (recognitionRef.current !== recognition) return
      stopTimerRef.current = window.setTimeout(() => {
        settleInterim()
        disposeVoice()
        setPhase('idle')
      }, 5000)
    } catch {
      settleInterim()
      disposeVoice()
      setPhase('idle')
    }
  }

  const shownText = appendSpeech(draft, interim, japanese)
  useEffect(() => { onDraftChange?.(shownText) }, [shownText, onDraftChange])
  const setDraftText = (text: string) => { draftRef.current = text; setDraft(text) }
  return { shownText, phase, errorKey, voiceAvailable, browserSupported,
    recording: phase !== 'idle', startVoice, stopVoice, finish, setDraftText }
}
