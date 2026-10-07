const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createInstance } = require('i18next')
const ja = require('../src/i18n/locales/ja.json')
const en = require('../src/i18n/locales/en.json')

const errorExports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/i18n/errorMessages.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: errorExports, Error, require: () => ({ default: ja }) })

test('stored diagnostic errors follow language changes without modifying the error or unknown server messages', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'ja', resources: { ja: { translation: ja }, en: { translation: en } },
    interpolation: { escapeValue: false } })
  const t = i18n.getFixedT(null)
  const cause = new Error(ja.errors.questionSave)
  assert.equal(errorExports.localizeErrorMessage(cause, t), ja.errors.questionSave)
  await i18n.changeLanguage('en')
  assert.equal(errorExports.localizeErrorMessage(cause, t), en.errors.questionSave)
  assert.equal(errorExports.localizeErrorMessage('Error: ' + cause.message, t), 'Error: ' + en.errors.questionSave)
  assert.equal(errorExports.localizeErrorMessage(new Error('upstream returned code 503'), t), 'upstream returned code 503')
  assert.equal(errorExports.localizeErrorMessage(ja.errors.pdfDataLoadPrefix + ja.errors.emptyPDF, t),
    en.errors.pdfDataLoadPrefix + en.errors.emptyPDF)
  assert.equal(cause.message, ja.errors.questionSave)
  await i18n.changeLanguage('ja')
  assert.equal(errorExports.localizeErrorMessage(cause, t), ja.errors.questionSave)
})

test('language changes do not change how older Japanese practice records are read', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/admin/ProgressHistory.tsx'), 'utf8')
  const ast = ts.createSourceFile('ProgressHistory.tsx', source, ts.ScriptTarget.Latest, true)
  const functions = ast.statements.filter(node => ts.isVariableStatement(node) &&
    ['getNextPoint', 'getPracticeAdvice'].includes(node.declarationList.declarations[0].name.text))
    .map(node => node.getText(ast)).join('\n')
  const read = vm.runInNewContext(ts.transpileModule(functions, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText + '\n({ getNextPoint, getPracticeAdvice })', { ja })
  const record = { explanation: '次のポイント： 比率を見直す\n次の絵で試す' }
  assert.equal(read.getNextPoint(record), ' 比率を見直す')
  assert.equal(read.getPracticeAdvice(record), '次の絵で試す')
  assert.equal(read.getNextPoint({ ...record, nextPoint: 'Saved point' }), 'Saved point')
  assert.equal(read.getPracticeAdvice({ ...record, practiceAdvice: 'Saved advice' }), 'Saved advice')
})
