const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createInstance } = require('i18next')
const messages = require('../src/i18n/locales/ja.json')
const englishMessages = require('../src/i18n/locales/en.json')
const i18n = createInstance()
i18n.init({ lng: 'ja', fallbackLng: 'ja', initImmediate: false,
  resources: { ja: { translation: messages }, en: { translation: englishMessages } } })
function moduleAt(name, dependencies = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name), 'utf8')
    .replaceAll('import.meta.env', 'API_ENV'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, URL, Error, TypeError, console: { log() {}, warn() {}, error() {} },
    require: id => id === '../i18n/locales/ja.json' ? messages : dependencies[id], ...globals })
  return exports
}
const { normalizeGradeResponse } = moduleAt('services/gradingResponse.ts')
const { resolveApiBaseUrl } = moduleAt('services/apiConfig.ts', {}, { API_ENV: {} })
const problem = (number = '1') => ({ problemNumber: number, studentAnswer: '2m', isCorrect: false,
  correctAnswer: '2cm', explanation: '単位を確認', confidence: 0.8 })

test('API targets are explicit in production and missing or invalid targets never choose another app', () => {
  assert.equal(resolveApiBaseUrl(undefined, true), 'http://localhost:3003')
  assert.equal(resolveApiBaseUrl(' https://copicopi.example/ ', false), 'https://copicopi.example')
  assert.equal(resolveApiBaseUrl('http://localhost:4000', true), 'http://localhost:4000')
  for (const value of [undefined, '', '   ']) assert.throws(() => resolveApiBaseUrl(value, false),
    error => error.message === messages.errors.apiNotConfigured)
  for (const value of ['bad-url', 'javascript:alert(1)', 'https://example.com/?key=secret', 'https://user:pass@example.com']) {
    assert.throws(() => resolveApiBaseUrl(value, false), error => error.message === messages.errors.apiInvalidUrl)
  }
})

test('legacy grading collection shapes have the same screen and history representation', () => {
  for (const raw of [[problem()], problem(), { 0: problem() }, [{ 0: problem() }]]) {
    const result = normalizeGradeResponse({ success: true, modelName: 'model', result: { problems: raw, overallComment: 'comment' } })
    assert.equal(result.result.problems.length, 1)
    assert.equal(result.result.problems[0].studentAnswer, '2m')
    assert.equal(result.result.problems[0].isCorrect, false)
    assert.equal(result.result.overallComment, 'comment')
    assert.equal(result.modelName, 'model')
  }
  const ordered = normalizeGradeResponse({ success: true, result: { problems: { 10: problem(10), 2: problem(2) } } })
  assert.deepEqual(Array.from(ordered.result.problems, item => item.problemNumber), ['2', '10'])
  assert.equal(normalizeGradeResponse({ success: true, result: problem() }).result.problems.length, 1)
})

test('follow-up text and copying feedback survive normalization, while malformed results cannot appear successful', () => {
  const followUp = normalizeGradeResponse({ success: true, result: { pageType: 'follow-up-question', problems: [], overallComment: '**解説**' } })
  assert.equal(followUp.result.pageType, 'follow-up-question')
  assert.equal(followUp.result.overallComment, '**解説**')
  const copy = normalizeGradeResponse({ success: true, result: { problems: [{ problemNumber: '模写', studentAnswer: '', confidence: 4, feedback: 'よい線' }] } })
  assert.equal(copy.result.problems[0].confidence, 4)
  assert.equal(copy.result.problems[0].feedback, 'よい線')
  for (const value of [null, {}, { success: true }, { success: true, result: { problems: [null] } },
    { success: true, result: { problems: [{ ...problem(), isCorrect: 'false' }] } }]) {
    assert.throws(() => normalizeGradeResponse(value), error => error.message === messages.errors.invalidGradingResponse)
  }
  assert.equal(normalizeGradeResponse({ success: false, error: 'quota' }).error, 'quota')
})

function client(env, responseBody, { user = null, status = 200, invalidJson = false } = {}) {
  const calls = [], errors = [], auth = { currentUser: user }
  const constants = { SUBJECTS: [{ id: 'math' }], DEFAULT_MODEL_ID: 'default', AVAILABLE_MODELS: [] }
  const configuration = moduleAt('services/apiConfig.ts', {}, { API_ENV: env })
  const api = moduleAt('services/api.ts', { './apiConfig': configuration, './gradingResponse': { normalizeGradeResponse },
    '../constants/grading': constants, '../lib/firebase': { auth }, '../i18n': i18n },
    { API_ENV: env, console: { log() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')) } },
    fetch: async (url, options) => {
      calls.push({ url, options }); return { ok: status >= 200 && status < 300, status,
        text: async () => JSON.stringify(responseBody),
        json: async () => { if (invalidJson) throw new SyntaxError('Invalid JSON'); return responseBody } }
    } })
  return { api, calls, errors, auth }
}

test('grading and questions normalize at the fetch boundary; configuration errors make no request', async () => {
  const h = client({ VITE_API_URL: 'https://copicopi.example/', DEV: false },
    { success: true, result: { problems: [{ 0: problem() }] } })
  assert.equal((await h.api.gradeWork('image')).result.problems[0].problemNumber, '1')
  assert.equal((await h.api.askQuestion('image', { problems: [] })).result.problems[0].problemNumber, '1')
  assert.deepEqual(h.calls.map(call => call.url), ['https://copicopi.example/api/grade-work', 'https://copicopi.example/api/ask-question'])
  const missing = client({ DEV: false }, {})
  const failed = await missing.api.gradeWork('image')
  assert.equal(failed.success, false)
  assert.equal(failed.error, messages.errors.apiNotConfigured)
  assert.equal(missing.calls.length, 0)
})

test('local-only subjects return normally without contacting or throwing through the API', async () => {
  const h = client({ DEV: false, VITE_USE_LOCAL_SUBJECTS_ONLY: 'true' }, {})
  assert.equal((await h.api.getSubjects()).subjects[0].id, 'math')
  assert.equal(h.calls.length, 0)
})

const apiEnvironment = { VITE_API_URL: 'https://copicopi.example', DEV: false }
const successfulResponse = { success: true, result: { problems: [problem()] }, subjectId: 'math', confidence: 0.9 }
const aiRequests = [
  api => api.gradeWork('image', undefined, 'en'),
  api => api.askQuestion('image', { problems: [] }, undefined, 'en'),
  api => api.detectSubject('image'),
]

test('all AI POST requests attach the current Firebase token and keep legacy signed-out requests working', async () => {
  for (const signedIn of [false, true]) {
    let tokenCalls = 0
    const h = client(apiEnvironment, successfulResponse, { user: signedIn ? {
      getIdToken: async () => `test-token-${++tokenCalls}`,
    } : null })
    for (const request of aiRequests) assert.equal((await request(h.api)).success, true)
    assert.equal(h.calls.length, 3)
    for (const [index, call] of h.calls.entries()) {
      assert.equal(call.options.method, 'POST')
      assert.equal(call.options.headers['Content-Type'], 'application/json')
      assert.equal(call.options.headers.Authorization, signedIn ? `Bearer test-token-${index + 1}` : undefined)
    }
    assert.equal(tokenCalls, signedIn ? 3 : 0)
    h.auth.currentUser = null
    await h.api.gradeWork('image')
    assert.equal(h.calls[3].options.headers.Authorization, undefined)
  }
})

test('token failures stop every AI request and never expose provider details in errors or logs', async () => {
  for (const getIdToken of [async () => { throw new Error('secret-token-in-provider-error') }, async () => '']) {
    for (const request of aiRequests) {
      const h = client(apiEnvironment, successfulResponse, { user: { getIdToken } })
      const response = await request(h.api)
      assert.equal(response.success, false)
      assert.equal(h.calls.length, 0)
      assert.ok(response.error.includes(request === aiRequests[2]
        ? messages.errors.apiAuthFailed : englishMessages.errors.apiAuthFailed))
      assert.ok(!response.error.includes('secret-token'))
      assert.ok(!h.errors.join('\n').includes('secret-token'))
    }
  }
})

test('grading and follow-up API errors use the requested language for all known security and AI codes', async () => {
  const cases = [
    ['AUTH_REQUIRED', 401, 'apiAuthRequired'],
    ['RATE_LIMITED', 429, 'apiRateLimited'],
    ['SERVICE_UNAVAILABLE', 503, 'apiServiceUnavailable'],
    ['INVALID_IMAGE', 400, 'apiInvalidImage'],
    ['INVALID_AI_RESPONSE', 502, 'apiInvalidAiResponse'],
    ['AI_TIMEOUT', 504, 'apiAiTimeout'],
    ['AI_UNAVAILABLE', 502, 'apiAiUnavailable'],
  ]
  for (const language of ['ja', 'en']) {
    for (const [code, status, key] of cases) {
      const h = client(apiEnvironment, { success: false, error: 'technical fallback', code }, { status })
      for (const response of [await h.api.gradeWork('image', undefined, language),
        await h.api.askQuestion('image', { problems: [] }, undefined, language)]) {
        assert.equal(response.success, false)
        assert.equal(response.error, (language === 'en' ? englishMessages : messages).errors[key])
        assert.equal(response.result.problems.length, 0)
      }
    }
  }
  assert.equal(i18n.language, 'ja', 'request-specific language must not change the global language')
})

test('unknown and non-JSON API errors preserve legacy fallbacks; detect-subject preserves its 404 fallback', async () => {
  for (const { body, options, expected } of [
    { body: { error: 'legacy server error', code: 'FUTURE_CODE' }, options: { status: 500 }, expected: 'legacy server error' },
    { body: { code: '__proto__' }, options: { status: 500 }, expected: 'HTTP Error: 500' },
    { body: null, options: { status: 502, invalidJson: true }, expected: 'HTTP Error: 502' },
  ]) {
    const h = client(apiEnvironment, body, options)
    assert.equal((await h.api.gradeWork('image')).error, expected)
    assert.equal((await h.api.askQuestion('image', { problems: [] })).error, expected)
  }
  const h = client(apiEnvironment, {}, { status: 404 })
  assert.equal((await h.api.detectSubject('image')).success, true)
})

test('public model and subject requests do not request or send Firebase tokens', async () => {
  const h = client(apiEnvironment, { models: [], subjects: [] }, { user: {
    getIdToken: async () => { throw new Error('Public endpoint requested a token') },
  } })
  await h.api.getAvailableModels()
  await h.api.getSubjects()
  assert.equal(h.calls.length, 2)
  assert.ok(h.calls.every(call => call.options === undefined))
})
