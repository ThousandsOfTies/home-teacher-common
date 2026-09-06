import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectDeferredAssets, createDeferredAssets } from '../build/deferredAssets.mjs'

function fixture() {
  const chunk = (fileName, moduleIds, imports = [], dynamicImports = [], isEntry = false, css = []) => ({
    type: 'chunk', fileName, moduleIds, imports, dynamicImports, isEntry,
    viteMetadata: { importedCss: new Set(css), importedAssets: new Set() },
  })
  return {
    main: chunk('main.js', ['/src/App.tsx'], ['shared.js'], ['editor.js', 'screenshot.js'], true, ['main.css']),
    shared: chunk('shared.js', ['/src/shared.ts']),
    editor: chunk('editor.js', ['/src/components/admin/PDFEditorPanel.tsx'], ['main.js', 'pdf.js'], [], false, ['editor.css']),
    pdf: chunk('pdf.js', ['/node_modules/pdf-lib/index.js']),
    screenshot: chunk('screenshot.js', ['/node_modules/html2canvas/index.js'], ['shared.js']),
  }
}

test('defers editor-only assets while preserving initial and existing screenshot dependencies', () => {
  const result = collectDeferredAssets(fixture())
  assert.deepEqual(result.initial, ['main.css', 'main.js', 'shared.js'])
  assert.deepEqual(result.deferred, ['editor.css', 'editor.js', 'pdf.js'])
})

test('shared dependencies remain precached even when also imported by an optional feature', () => {
  const bundle = fixture()
  bundle.screenshot.imports.push('pdf.js')
  bundle.main.viteMetadata.importedCss.add('editor.css')
  assert.deepEqual(collectDeferredAssets(bundle).deferred, ['editor.js'])
})

test('manifest transformation removes only the deferred files identified by the bundle', async () => {
  const config = createDeferredAssets()
  config.plugin.generateBundle.call({ emitFile() {} }, {}, fixture())
  const entries = ['main.js', 'shared.js', 'editor.js', 'pdf.js', 'screenshot.js', 'main.css'].map(url => ({ url, revision: 'hash' }))
  const { manifest } = await config.manifestTransform(entries)
  assert.deepEqual(manifest.map(entry => entry.url), ['main.js', 'shared.js', 'screenshot.js', 'main.css'])
})
