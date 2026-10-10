const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, globals) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...globals })
  return exports
}
const root = path.join(__dirname, '../../src')
function rectangleSelection(containerRef, rectRef, activeRef, startRef, onChange = () => {}) {
  const refs = [rectRef, activeRef, startRef]
  const api = load(path.join(root, 'hooks/useRectangleSelection.ts'), {
    require: () => ({ useRef: () => refs.shift(), useState: () => [rectRef.current, onChange], useCallback: callback => callback }),
  })
  return api.useRectangleSelection(containerRef)
}
function studySelectionAdapters(adapters) {
  return {
    selection: rectangleSelection(adapters.containerRef ?? { current: null },
      { current: adapters.selectionRect ?? null }, adapters.isSelectingRef ?? { current: false },
      adapters.selectionStartRef ?? { current: null }, adapters.setSelectionRect),
    gradingSelection: rectangleSelection(adapters.gradingPanelRef ?? { current: null },
      adapters.gradingCaptureRectRef ?? { current: adapters.gradingCaptureRect ?? null },
      adapters.isGradingCapturingRef ?? { current: false }, adapters.gradingCaptureStartRef ?? { current: null },
      adapters.setGradingCaptureRect),
    captureStudyPDFSelection: (...args) => load(path.join(root, 'utils/studySelection.ts'),
      { document: adapters.document }).captureStudyPDFSelection(...args),
  }
}
module.exports = { studySelectionAdapters }
