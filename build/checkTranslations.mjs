import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const roots = process.argv.slice(2).map(root => path.resolve(root))
assert.ok(roots.length, 'Provide one or more source directories')
const keys = new Set()
function strings(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix + key
    if (typeof child === 'string') output[name] = child
    // Catalogs intentionally contain different sites and tag counts for each language.
    else if (!Array.isArray(child)) strings(child, name + '.', output)
  }
  return output
}
const variables = value => [...value.matchAll(/{{\s*([\w]+)\s*}}/g)].map(match => match[1]).sort()
for (const root of roots) {
  const ja = strings(JSON.parse(fs.readFileSync(path.join(root, 'i18n/locales/ja.json'), 'utf8')))
  const en = strings(JSON.parse(fs.readFileSync(path.join(root, 'i18n/locales/en.json'), 'utf8')))
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort(), root + ': translation keys differ')
  for (const key of Object.keys(ja)) {
    assert.deepEqual(variables(ja[key]), variables(en[key]), root + ': interpolation differs at ' + key)
    keys.add(key)
    if (/_(?:zero|one|two|few|many|other)$/.test(key)) keys.add(key.replace(/_(?:zero|one|two|few|many|other)$/, ''))
  }
  for (const catalog of ['drillCatalog', 'drawingCatalog']) {
    for (const language of ['ja', 'en']) {
      const resource = JSON.parse(fs.readFileSync(path.join(root, `i18n/locales/${language}.json`), 'utf8'))
      if (!resource[catalog]?.sites) continue
      assert.ok(Array.isArray(resource[catalog].sites))
      for (const site of resource[catalog].sites) {
        for (const field of ['name', 'description', 'url', 'highlight']) assert.equal(typeof site[field], 'string')
        for (const field of ['subjects', 'grades']) assert.ok(site[field].every(value => typeof value === 'string'))
      }
    }
  }
}

const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const invariantLabel = /^(?:px|MB(?:\s*\/)?|Google|ThousandsOfTies|thousands\.of\.ties@gmail\.com|github\.com\/ThousandsOfTies)$/
let checkedFiles = 0
const wordingIssues = []
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) scan(file)
    else if (/\.tsx?$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8')
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
      const isUI = /[\\/](?:components|hooks)[\\/]/.test(file) || file.endsWith('App.tsx')
      const at = node => `${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`
      function inConsole(node) {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) &&
            parent.expression.expression.getText(ast) === 'console') return true
        }
        return false
      }
      function isVisibleLabel(node) {
        if (ts.isJsxText(node)) return true
        for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
          if (ts.isCallExpression(parent)) return false
          if (ts.isElementAccessExpression(parent) && parent.argumentExpression === child) return false
          if (ts.isConditionalExpression(parent) && parent.condition === child) return false
          if (ts.isBinaryExpression(parent)) {
            const operator = parent.operatorToken.kind
            if ([ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
              ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
              ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(operator)) return false
            if (operator === ts.SyntaxKind.AmpersandAmpersandToken && parent.left === child) return false
          }
          if (ts.isJsxAttribute(parent)) {
            return ['title', 'aria-label', 'placeholder', 'alt'].includes(parent.name.getText(ast))
          }
          if (ts.isJsxExpression(parent) && ts.isJsxElement(parent.parent)) {
            return !['style', 'script'].includes(parent.parent.openingElement.tagName.getText(ast))
          }
          if (ts.isJsxExpression(parent) && ts.isJsxFragment(parent.parent)) return true
        }
        return false
      }
      function visit(node) {
        if (isUI && (ts.isJsxText(node) || ts.isStringLiteralLike(node) ||
          [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(node.kind))) {
          const text = node.text.trim()
          if (text && !inConsole(node)) {
            if (japanese.test(text)) wordingIssues.push(at(node) + ': inline Japanese UI text: ' + text)
            if (isVisibleLabel(node)) {
              if (/[a-z]{2}/i.test(text) && !invariantLabel.test(text)) {
                wordingIssues.push(at(node) + ': inline UI label: ' + text)
              }
            }
          }
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          ['t', 'td', 'doriT'].includes(node.expression.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text.split(':').at(-1)
          if (!keys.has(key)) wordingIssues.push(at(node) + ': missing translation: ' + key)
        }
        ts.forEachChild(node, visit)
      }
      visit(ast)
      checkedFiles++
    }
  }
}
for (const root of roots) scan(root)
assert.equal(wordingIssues.length, 0, wordingIssues.join('\n'))
console.log(`Verified translation keys, interpolation, catalogs and UI wording in ${checkedFiles} source files.`)
