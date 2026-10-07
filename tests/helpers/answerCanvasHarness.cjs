const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, adapters = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...adapters })
  return exports
}
const drawingRoot = path.join(__dirname, '../../../drawing-common/src')
const geometry = load(path.join(drawingRoot, 'geometry/viewport.ts'))
const { CanvasUndoHistory } = load(path.join(drawingRoot, 'history/CanvasUndoHistory.ts'), { Uint32Array, Uint8ClampedArray })

function answerWheelHarness() {
  class Element { constructor(control = false) { this.control = control } closest() { return this.control ? this : null } }
  const viewportRef = {}, updates = []
  let listener
  const container = { clientHeight: 500, getBoundingClientRect: () => ({ left: 100, top: 80 }),
    addEventListener(type, callback) { listener = callback }, removeEventListener() {} }
  const { useAnswerWheel } = load(path.join(__dirname, '../../src/hooks/useAnswerWheel.ts'), {
    Element,
    require: id => id === 'react' ? {
      useRef(value) { viewportRef.current = value; return viewportRef }, useEffect(callback) { callback() },
    } : geometry,
  })
  useAnswerWheel({ current: container }, { zoom: 1, panOffset: { x: 0, y: 0 },
    setZoom: value => updates.push(['zoom', value]), setPanOffset: value => updates.push(['pan', value]) })
  return { viewportRef, updates, control: () => new Element(true),
    send(options = {}) {
      let prevented = false, stopped = false
      listener({ target: new Element(), buttons: 0, deltaY: 100, deltaMode: 0, clientX: 300, clientY: 280,
        preventDefault() { prevented = true }, stopPropagation() { stopped = true }, ...options })
      return { prevented, stopped }
    },
  }
}

module.exports = { answerWheelHarness, CanvasUndoHistory }
