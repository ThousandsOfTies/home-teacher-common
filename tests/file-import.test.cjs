const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createInstance } = require('i18next')
const ja = require('../src/i18n/locales/ja.json')
const en = require('../src/i18n/locales/en.json')

const settle = () => new Promise(resolve => setImmediate(resolve))

function harness({ parseError, saveError, save, checkText = false } = {}) {
  let cursor = 0, timerId = 0, recordId = 0, legacyCalls = 0
  const cells = [], timers = new Map(), records = [], converted = []
  const i18n = createInstance()
  i18n.init({ lng: 'ja', initImmediate: false, resources: { ja: { translation: ja }, en: { translation: en } },
    interpolation: { escapeValue: false } })
  const react = {
    useState(initial) {
      const index = cursor++
      cells[index] ??= { value: initial }
      return [cells[index].value, value => { cells[index].value = value }]
    },
    useRef(initial) { const index = cursor++; cells[index] ??= { current: initial }; return cells[index] },
    useEffect(callback) { const index = cursor++; cells[index] ??= { cleanup: callback() } },
  }
  class FileInput extends EventTarget {
    files = []
    clicks = 0
    clickError = null
    get value() { return this.files.length ? 'C:\\fakepath\\' + this.files[0].name : '' }
    set value(value) { assert.equal(value, ''); this.files.length = 0 }
    select(files) { this.files = [...files] }
    click() { this.clicks++; if (this.clickError) throw this.clickError }
  }
  const input = new FileInput(), window = new EventTarget()
  window.showOpenFilePicker = () => { legacyCalls++; throw new DOMException('Activation required', 'SecurityError') }
  window.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id }
  window.clearTimeout = id => timers.delete(id)
  const inspection = { status: 'text', checkedPages: 1, totalPages: 1 }
  const pdf = { getPage: async () => ({
    getViewport: () => ({ width: 100, height: 100 }),
    render: () => ({ promise: Promise.resolve() }),
  }) }
  const dependencies = {
    react,
    'react-i18next': { useTranslation: () => ({ t: (...args) => i18n.t(...args) }) },
    '../../i18n/errorMessages': { localizeErrorMessage: value => value },
    '../../utils/indexedDB': {
      getAllPDFRecords: async () => [...records], deletePDFRecord: async () => {},
      generatePDFId: name => name + '-' + ++recordId,
      savePDFRecord: async record => { if (saveError) throw saveError; await save?.(record); records.push(record) },
    },
    'pdfjs-dist': { GlobalWorkerOptions: {}, getDocument: () => ({
      promise: parseError ? Promise.reject(parseError) : Promise.resolve(pdf), destroy: async () => {},
    }) },
    '../../services/api': { detectSubject: async () => ({ success: false }) },
    '../../utils/imageProcessor': { isSupportedImageFile: file => file.type.startsWith('image/'),
      processImageFiles: async files => { converted.push(...files); return files } },
    '../../services/pdfConverter': { convertImagesToPDF: async () => new Blob(['converted'], { type: 'application/pdf' }) },
    '../../utils/pdfRange': { LARGE_PDF_THRESHOLD_BYTES: Infinity },
    '../../utils/pdfTextInspection': { inspectPDFText: async () => inspection },
  }
  const exports = {}
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/admin/usePDFRecords.ts'), 'utf8')
    .replaceAll('import.meta.env.BASE_URL', "'/'")
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: id => {
    assert.ok(id in dependencies, `Unexpected import ${id}`)
    return dependencies[id]
  }, window, Error, DOMException, console: { log() {}, warn() {}, error() {} },
    document: { createElement(tag) {
      assert.equal(tag, 'canvas', 'File inputs must come from the mounted AdminPanel')
      return { getContext: () => ({}), toDataURL: () => 'thumbnail' }
    } },
    alert: () => assert.fail('Unexpected validation alert'),
  })
  const view = () => { cursor = 0; return exports.usePDFRecords(512, checkText) }
  view().fileInputRef.current = input
  return { view, input, window, records, converted, i18n, inspection, timers,
    legacyCalls: () => legacyCalls,
    async tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); await settle() },
    unmount() { cells.forEach(cell => cell.cleanup?.()) },
  }
}

const pdfFile = () => new File(['%PDF fixture'], 'book.pdf', { type: 'application/pdf' })

test('the mounted input imports multiple PDFs directly, resets its live FileList and accepts the same files again', async () => {
  const h = harness({ checkText: true }), files = [pdfFile(), pdfFile()]
  h.input.select(files)
  const pending = h.view().handleFileSelect(h.input)
  assert.equal(h.input.value, '')
  assert.equal(h.input.files.length, 0)
  await pending
  assert.equal(h.records.length, 2)
  assert.equal(h.records[0].fileData, files[0])
  assert.equal(h.records[0].textInspection, h.inspection)
  h.input.select(files)
  await h.view().handleFileSelect(h.input)
  assert.equal(h.records.length, 4)
  assert.equal(h.view().uploading, false)
  assert.equal(h.view().errorMessage, null)
  assert.equal(h.legacyCalls(), 0)
})

test('the button opens the mounted input without starting an import, and both cancel paths stay silent', async () => {
  const h = harness()
  h.view().openFilePicker()
  assert.equal(h.input.clicks, 1)
  assert.equal(h.view().uploading, false)
  h.input.dispatchEvent(new Event('cancel'))
  h.window.dispatchEvent(new Event('focus'))
  assert.equal(h.timers.size, 0)
  h.view().openFilePicker()
  h.window.dispatchEvent(new Event('focus'))
  await h.tick()
  assert.equal(h.view().errorMessage, null)
  assert.equal(h.view().uploading, false)
  assert.equal(h.records.length, 0)
  assert.equal(h.legacyCalls(), 0)
})

test('iPad focus fallback imports once; a late empty change cannot clear the busy state', async () => {
  let finish
  const saving = new Promise(resolve => { finish = resolve })
  const h = harness({ save: () => saving })
  h.view().openFilePicker()
  h.input.select([pdfFile()])
  h.window.dispatchEvent(new Event('focus'))
  await h.tick()
  assert.equal(h.view().uploading, true)
  await h.view().handleFileSelect(h.input)
  assert.equal(h.view().uploading, true)
  finish()
  await settle()
  assert.equal(h.records.length, 1)
  assert.equal(h.view().uploading, false)
})

test('change, cancel, reopening and unmount dispose focus listeners and pending timers', async () => {
  for (const action of ['change', 'cancel', 'reopen', 'unmount']) {
    const h = harness()
    h.view().openFilePicker()
    h.window.dispatchEvent(new Event('focus'))
    assert.equal(h.timers.size, 1)
    if (action === 'change') {
      h.input.select([pdfFile()])
      await h.view().handleFileSelect(h.input)
    } else if (action === 'cancel') h.input.dispatchEvent(new Event('cancel'))
    else if (action === 'reopen') h.view().openFilePicker()
    else h.unmount()
    assert.equal(h.timers.size, 0, action)
    await h.tick()
    assert.equal(h.records.length, action === 'change' ? 1 : 0)
  }
})

test('picker exceptions are visible and translated, while AbortError is silent', async () => {
  const h = harness()
  h.input.clickError = new DOMException('Activation required', 'SecurityError')
  h.view().openFilePicker()
  assert.equal(h.view().errorMessage, ja.pdfImport.pickerFailed)
  await h.i18n.changeLanguage('en')
  assert.equal(h.view().errorMessage, en.pdfImport.pickerFailed)
  h.window.dispatchEvent(new Event('focus'))
  assert.equal(h.timers.size, 0)
  const cancelled = harness()
  cancelled.input.clickError = new DOMException('Cancelled', 'AbortError')
  cancelled.view().openFilePicker()
  assert.equal(cancelled.view().errorMessage, null)
})

test('file access failures use errorMessage and leave the input usable for a retry', async () => {
  const h = harness()
  Object.defineProperty(h.input, 'files', { configurable: true, get() { throw new Error('Could not read files') } })
  await h.view().handleFileSelect(h.input)
  assert.equal(h.view().errorMessage, ja.pdfImport.selectFailed.replace('{{detail}}', 'Could not read files'))
  assert.equal(h.view().uploading, false)
  Object.defineProperty(h.input, 'files', { configurable: true, writable: true, value: [pdfFile()] })
  await h.view().handleFileSelect(h.input)
  assert.equal(h.records.length, 1)
  assert.equal(h.view().errorMessage, null)
})

test('PDF parsing and storage failures reach errorMessage and clear the busy state', async () => {
  for (const options of [{ parseError: new Error('Invalid PDF') },
    { saveError: new DOMException('Full', 'QuotaExceededError') }]) {
    const h = harness(options)
    h.input.select([pdfFile()])
    await h.view().handleFileSelect(h.input)
    assert.equal(h.records.length, 0)
    assert.equal(h.view().uploading, false)
    assert.ok(h.view().errorMessage)
    if (options.saveError) assert.equal(h.view().errorMessage, ja.pdfImport.storageFull)
    else assert.ok(h.view().errorMessage.includes('Invalid PDF'))
  }
})

test('image selections still use the existing image conversion and PDF storage pipeline', async () => {
  const h = harness(), file = new File(['image'], 'picture.png', { type: 'image/png' })
  h.input.select([file])
  await h.view().handleFileSelect(h.input)
  assert.equal(h.converted[0], file)
  assert.equal(h.records.length, 1)
  assert.equal(h.records[0].fileName, 'picture.pdf')
  assert.equal(h.records[0].fileData.type, 'application/pdf')
  assert.equal(h.view().errorMessage, null)
})
