const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, requireModule) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: requireModule, console: { log() {}, error() {} } })
  return exports
}

test('all predefined SNS icons, including the Amazon fallback, remain available', async () => {
  const icons = await import('simple-icons')
  const sns = load('constants/sns.ts', () => icons)
  const expected = { youtube: 'siYoutube', x: 'siX', instagram: 'siInstagram', tiktok: 'siTiktok',
    facebook: 'siFacebook', line: 'siLine', discord: 'siDiscord', twitch: 'siTwitch',
    reddit: 'siReddit', github: 'siGithub', note: 'siNote', zenn: 'siZenn', qiita: 'siQiita',
    niconico: 'siNiconico', pixiv: 'siPixiv' }
  for (const { id } of sns.PREDEFINED_SNS) {
    const icon = sns.getSNSIcon(id)
    assert.ok(icon.svg.includes('<svg'))
    if (id !== 'amazon') {
      assert.equal(icon.svg, icons[expected[id]].svg)
      assert.equal(icon.color, '#' + icons[expected[id]].hex)
    } else assert.equal(icon.color, '#FF9900')
  }
  for (const id of ['custom-site', '__proto__', 'constructor']) assert.equal(sns.getSNSIcon(id), null)
})

test('JPEG/PNG do not load HEIC; a failed load explains how to recover', async () => {
  let loads = 0, fail = true
  const converted = { type: 'image/jpeg' }
  const processor = load('utils/imageProcessor.ts', id => {
    assert.equal(id, 'heic2any')
    loads++
    if (fail) throw new Error('offline')
    return { default: async () => [converted] }
  })
  for (const type of ['image/jpeg', 'image/png']) {
    const file = { type, name: 'image.jpg' }
    assert.equal(await processor.normalizeImageFile(file), file)
  }
  assert.equal(loads, 0)
  await assert.rejects(processor.normalizeImageFile({ type: 'image/heic', name: 'image.heic' }), /再読み込み/)
  fail = false
  assert.equal(await processor.normalizeImageFile({ type: '', name: 'image.HEIF' }), converted)
  assert.equal(loads, 2)
})

test('retry navigation resumes the same PDF in the editor; ordinary PDF links open study', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useAppInitializer.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  for (const [search, view] of [['?pdfId=fixture&edit=1', 'editor'], ['?pdfId=fixture', 'viewer']]) {
    const states = [], effects = []
    const record = { id: 'fixture' }
    const exports = {}
    vm.runInNewContext(code, {
      exports, URLSearchParams, console: { log() {}, error() {} },
      window: { location: { search, pathname: '/TutoTuto/', hash: '' }, history: { replaceState() {} }, addEventListener() {}, removeEventListener() {} },
      require: id => id === 'react' ? {
        useState(value) { const index = states.length; states.push(value); return [value, next => { states[index] = next }] },
        useEffect(callback) { effects.push(callback) },
        useCallback: callback => callback,
      } : { getPDFRecord: async id => { assert.equal(id, 'fixture'); return record } },
    })
    exports.useAppInitializer()
    effects.forEach(effect => effect())
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(states.includes(view))
    assert.ok(states.includes(record))
  }
})
