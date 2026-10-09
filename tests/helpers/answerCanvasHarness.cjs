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

function answerPinchHarness(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const expressions = {}
  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source)
      if (['onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'].includes(name)) {
        expressions[name] = node.initializer.expression
      }
      if (name === 'className' && node.initializer?.text === 'answer-canvas-stack') {
        const style = node.parent.properties.find(property => property.name?.getText(source) === 'style')
        expressions.transition = style.initializer.expression.properties.find(property =>
          property.name?.getText(source) === 'transition').initializer
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  const state = { zoom: 1, panOffset: { x: 0, y: 0 }, isPinching: false, isPanning: false,
    isTextMode: false, isEraserMode: false, gestureRef: { current: null }, textTouchStartRef: { current: null },
    containerRef: { current: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } }, ...geometry,
    stopDraw() {}, stopPanning() {}, setEraserCursorPos() {},
    setIsPinching: value => { state.isPinching = value },
    setZoom: value => { state.zoom = value }, setPanOffset: value => { state.panOffset = value },
  }
  const context = vm.createContext(state)
  const evaluate = expression => {
    if (!expression) throw new Error('Missing pinch handler or viewport transition')
    const code = ts.transpileModule('var run = ' + expression.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
    return vm.runInContext(code + '\nrun', context)
  }
  return { state,
    start: evaluate(expressions.onTouchStart), move: evaluate(expressions.onTouchMove),
    end: evaluate(expressions.onTouchEnd), cancel: evaluate(expressions.onTouchCancel),
    transition: () => evaluate(expressions.transition),
  }
}

module.exports = { answerWheelHarness, answerPinchHarness, CanvasUndoHistory }
