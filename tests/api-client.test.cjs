const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const messages = require('../src/i18n/locales/ja.json')
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

function client(env, responseBody) {
  const calls = [], constants = { SUBJECTS: [{ id: 'math' }], DEFAULT_MODEL_ID: 'default', AVAILABLE_MODELS: [] }
  const configuration = moduleAt('services/apiConfig.ts', {}, { API_ENV: env })
  const api = moduleAt('services/api.ts', { './apiConfig': configuration, './gradingResponse': { normalizeGradeResponse },
    '../constants/grading': constants }, { API_ENV: env, fetch: async (url, options) => {
      calls.push({ url, options }); return { ok: true, json: async () => responseBody }
    } })
  return { api, calls }
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
