const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

class Surface {
  constructor(bounds = { left: 10, top: 20, width: 1000, height: 800 }) {
    this.bounds = bounds; this.clientHeight = bounds.height; this.listeners = new Map()
  }
  getBoundingClientRect() { return this.bounds }
  addEventListener(type, fn, options) {
    if (['wheel', 'touchmove'].includes(type)) assert.equal(options.passive, false)
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(fn)
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
  emit(type, properties = {}) {
    const event = { defaultPrevented: false, buttons: 0, deltaMode: 0, deltaY: 10,
      clientX: 100, clientY: 100, target: null, touches: [], changedTouches: [],
      preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true }, ...properties }
    for (const handler of this.listeners.get(type) ?? []) handler(event)
    return event
  }
}

function moduleAt(file, dependencies, globals) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: id => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`)
    return dependencies[id]
  }, console, ...globals })
  return exports
}
const { harness: zoomHarness } = require('../../drawing-common/tests/helpers/zoom-pan-harness.cjs')
const geometry = moduleAt(path.join(__dirname, '../../drawing-common/src/geometry/viewport.ts'), {}, {})

function harness(file, overrides = {}) {
  let cursor = 0, timerId = 0
  const cells = [], effects = [], timers = new Map()
  const react = {
    useRef(value) { const index = cursor++; cells[index] ??= { current: value }; return cells[index] },
    useState(initial) {
      const index = cursor++
      if (!(index in cells)) cells[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [cells[index].value, next => { cells[index].value = typeof next === 'function' ? next(cells[index].value) : next }]
    },
    useEffect(callback, deps) {
      const index = cursor++, previous = cells[index]
      if (previous && previous.deps.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
      effects.push(() => { previous?.cleanup?.(); cells[index] = { deps, cleanup: callback() } })
    },
  }
  const storage = new Map(), document = new Surface(), window = new Surface()
  class Element { closest() { return this.editor ? this : null } }
  const api = moduleAt(path.join(__dirname, '../src/hooks', file), {
    react, '@thousands-of-ties/drawing-common': geometry, ...overrides,
  }, { document, window, Element,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id },
    clearTimeout: id => timers.delete(id),
  })
  return { api, storage, document, window, Element,
    render(name, ...args) { cursor = 0; const result = api[name](...args); for (const effect of effects.splice(0)) effect(); return result },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()) },
    unmount() { for (const cell of cells) cell?.cleanup?.() },
  }
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('tool transitions cannot activate incompatible tools together', () => {
  const state = harness('useStudyToolMode.ts')
  let mode = state.render('useStudyToolMode', 'select-pdf')
  for (const tool of ['pen', 'eraser', 'text', 'select-pdf', 'select-result', 'none']) {
    mode.setTool(tool)
    mode = state.render('useStudyToolMode', 'select-pdf')
    assert.equal(mode.tool, tool)
    assert.equal([mode.isDrawingMode, mode.isEraserMode, mode.isTextMode,
      mode.isSelectionMode, mode.isGradingCaptureMode].filter(Boolean).length, tool === 'none' ? 0 : 1)
  }
  assert.equal(state.api.studyToolForPanel('answer', 'pen'), 'pen')
  assert.equal(state.api.studyToolForPanel('answer', 'text'), 'text')
  assert.equal(state.api.studyToolForPanel('pdf', 'pen'), 'select-pdf')
  assert.equal(state.api.studyToolForPanel('grading', 'text'), 'select-result')
})

test('overlay touch selects in container coordinates and forwards raw pinch requests to the chosen pane', () => {
  const state = harness('useStudyOverlayTouch.ts'), container = new Surface(), touched = [], updates = [], cancelled = [], pinchStates = []
  const panes = ['A', 'B'].map(name => ({
    getZoom: () => 1, getPanOffset: () => ({ x: 0, y: 0 }),
    setPinchActive: active => pinchStates.push([name, active]),
    applyPinch: (gesture, pair) => updates.push({ name, gesture, pair }),
  }))
  let reversed = false
  const options = { containerRef: { current: container }, getTargetPane: x => ((x < 510) !== reversed) ? 'A' : 'B',
    getPane: pane => panes[pane === 'A' ? 0 : 1], cancelSelection: () => cancelled.push(true) }
  const handlers = state.render('useStudyOverlayTouch', options)
  const event = touches => ({ touches, preventDefault() {} })
  const point = (x, y) => ({ clientX: x, clientY: y })
  handlers.handleOverlayTouchStart(event([point(110, 120)]), (x, y) => touched.push([x, y]))
  handlers.handleOverlayTouchMove(event([point(130, 150)]), (x, y) => touched.push([x, y]))
  handlers.handleOverlayTouchEnd(event([]), () => touched.push('end'))
  assert.deepEqual(touched, [[100, 100], [120, 130], 'end'])
  handlers.handleOverlayTouchStart(event([point(610, 120), point(710, 120)]))
  assert.deepEqual(pinchStates, [['B', true]])
  handlers.handleOverlayTouchMove(event([point(570, 140), point(770, 140)]))
  assert.equal(cancelled.length, 1)
  assert.equal(updates[0].name, 'B')
  assert.equal(updates[0].gesture.startZoom, 1)
  assert.equal(updates[0].gesture.startDist, 100)
  assert.equal(updates[0].gesture.startCenter.x, 660)
  assert.equal(updates[0].pair.distance, 200)
  assert.equal(updates[0].pair.center.y, 140)
  handlers.handleOverlayTouchEnd(event([]))
  assert.deepEqual(pinchStates, [['B', true], ['B', false]])
  reversed = true
  handlers.handleOverlayTouchStart(event([point(50, 80), point(150, 80)]))
  handlers.handleOverlayTouchMove(event([point(20, 80), point(180, 80)]))
  assert.equal(updates[1].name, 'B') // CopiCopi's reversed pane resolver is preserved.
})

test('coincident fingers are ignored and overlay forwards the unbounded request to the viewport controller', () => {
  const state = harness('useStudyOverlayTouch.ts'), updates = []
  const handlers = state.render('useStudyOverlayTouch', { containerRef: { current: new Surface() }, getTargetPane: () => 'A',
    getPane: () => ({ getZoom: () => 1, getPanOffset: () => ({ x: 0, y: 0 }),
      setPinchActive() {}, applyPinch: (gesture, pair) => updates.push({ gesture, pair }) }), cancelSelection() {} })
  const event = distance => ({ touches: [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }], preventDefault() {} })
  handlers.handleOverlayTouchStart(event(0)); handlers.handleOverlayTouchMove(event(100))
  assert.equal(updates.length, 0)
  handlers.handleOverlayTouchStart(event(100)); handlers.handleOverlayTouchMove(event(10000))
  assert.equal(updates.length, 1)
  assert.equal(updates[0].pair.distance, 10000)
  assert.equal(updates[0].gesture.startDist, 100)
})

test('pinch state ends when one finger lifts, and cancellation or unmount cannot leave the pane pinching', () => {
  const state = harness('useStudyOverlayTouch.ts'), changes = [], singleMoves = [], cancelled = []
  const pane = { getZoom: () => 1, getMinimumZoom: () => 0.1, getPanOffset: () => ({ x: 0, y: 0 }),
    applyPinch() {},
    setPinchActive: active => changes.push(active) }
  const handlers = state.render('useStudyOverlayTouch', { containerRef: { current: new Surface() },
    getTargetPane: () => 'A', getPane: () => pane, cancelSelection: () => cancelled.push(true) })
  const first = { clientX: 100, clientY: 100 }, second = { clientX: 200, clientY: 100 }
  const event = touches => ({ touches, preventDefault() {} })
  handlers.handleOverlayTouchStart(event([first, second]))
  handlers.handleOverlayTouchEnd(event([first]))
  handlers.handleOverlayTouchMove(event([first]), () => singleMoves.push(true))
  assert.deepEqual(changes, [true, false])
  assert.deepEqual(singleMoves, [])
  handlers.handleOverlayTouchEnd(event([]))

  handlers.handleOverlayTouchStart(event([first, second]))
  handlers.handleOverlayTouchCancel()
  handlers.handleOverlayTouchMove(event([first, second]))
  assert.deepEqual(changes, [true, false, true, false])
  assert.equal(cancelled.length, 3)

  handlers.handleOverlayTouchStart(event([first, second]))
  state.unmount()
  assert.deepEqual(changes, [true, false, true, false, true, false])
})

test('repeated overlay pinches and direct zoom commands share the real viewport controller for both paper sizes', () => {
  const state = harness('useStudyOverlayTouch.ts')
  const apps = [
    zoomHarness({ width: 500, height: 380, left: 0 }),
    zoomHarness({ width: 500, height: 380, left: 510, pageWidth: 842, pageHeight: 595 }),
  ]
  const minima = apps.map(app => app.fit().zoom)
  const panes = apps.map(app => ({
    getZoom: () => app.view().getViewport().zoom,
    getPanOffset: () => app.view().getViewport().panOffset,
    setPinchActive() {},
    applyPinch: (gesture, pair) => app.view().applyPinch(gesture, pair),
  }))
  const handlers = state.render('useStudyOverlayTouch', { containerRef: { current: new Surface() },
    getTargetPane: x => x < 510 ? 'A' : 'B', getPane: pane => panes[pane === 'A' ? 0 : 1], cancelSelection() {} })
  for (const [index, app] of apps.entries()) {
    const center = index === 0 ? 250 : 760
    const event = distance => ({ touches: [
      { clientX: center - distance / 2, clientY: 240 },
      { clientX: center + distance / 2, clientY: 240 },
    ], preventDefault() {} })
    for (let repeat = 0; repeat < 20; repeat++) {
      handlers.handleOverlayTouchStart(event(100))
      handlers.handleOverlayTouchMove(event(0.001))
      handlers.handleOverlayTouchEnd({ touches: [] })
      near(app.view().zoom, minima[index])
      const pan = app.view().panOffset
      near((250 - pan.x) / minima[index], app.canvas.clientWidth / 2)
      near((190 - pan.y) / minima[index], app.canvas.clientHeight / 2)
    }
    app.view().setZoom(0.001)
    near(app.view().zoom, minima[index])
    handlers.handleOverlayTouchStart(event(100))
    handlers.handleOverlayTouchMove(event(200))
    handlers.handleOverlayTouchEnd({ touches: [] })
    near(app.view().zoom, minima[index] * 2)
    app.dispose()
  }
})

test('answer wheel accumulates bursts, normalizes line/page deltas, and ignores active editors', () => {
  const state = harness('useAnswerWheel.ts'), surface = new Surface(), ref = { current: surface }
  const controller = zoomHarness({ zoomOptions: { minimumZoom: 0.2, constrainPan: false, nativeWheel: false } }).view()
  state.render('useAnswerWheel', ref, controller)
  surface.emit('wheel', { deltaY: -1, ctrlKey: true })
  surface.emit('wheel', { deltaY: -1, ctrlKey: true })
  const { zoom } = controller.getViewport()
  let { panOffset } = controller.getViewport()
  near(zoom, 1.21)
  near(panOffset.x, 90 - 90 * zoom); near(panOffset.y, 80 - 80 * zoom)
  surface.emit('wheel', { deltaY: 2, deltaMode: 1 })
  panOffset = controller.getViewport().panOffset
  near(panOffset.y, 80 - 80 * zoom - 32)
  surface.emit('wheel', { deltaY: 1, deltaMode: 2 })
  panOffset = controller.getViewport().panOffset
  near(panOffset.y, 80 - 80 * zoom - 832)
  const before = panOffset
  assert.equal(surface.emit('wheel', { buttons: 1 }).defaultPrevented, false)
  assert.equal(surface.emit('wheel', { defaultPrevented: true }).stopped, undefined)
  const editor = new state.Element(); editor.editor = true
  assert.equal(surface.emit('wheel', { target: editor }).defaultPrevented, false)
  assert.deepEqual(controller.getViewport().panOffset, before)
  state.unmount()
  assert.equal(surface.listeners.get('wheel').size, 0)
})

test('split resizing uses the current container, persists a clamped ratio and removes handlers on cancellation', () => {
  const state = harness('useStudySplitResize.ts'), first = new Surface(), second = new Surface({ left: 100, top: 0, width: 400, height: 800 })
  state.storage.set('copi.splitRatio', '0.6')
  let current = first
  const render = () => state.render('useStudySplitResize', 'copi.splitRatio', () => current)
  let view = render(); assert.equal(view.splitRatio, 0.6)
  view.handleResizeStart(); render()
  state.document.emit('mousemove', { clientX: 2000 }); assert.equal(render().splitRatio, 0.8)
  current = second; render()
  state.document.emit('touchmove', { touches: [{ clientX: 240 }] }); near(render().splitRatio, 0.35)
  state.document.emit('touchend', { changedTouches: [{ clientX: 220 }] })
  view = render(); assert.equal(view.isResizing, false); assert.equal(view.splitRatio, 0.3)
  assert.equal(state.storage.get('copi.splitRatio'), '0.3')
  view.handleResizeStart(); render(); state.document.emit('touchcancel'); render()
  assert.equal(state.document.listeners.get('touchmove').size, 0)
})

test('page navigation flushes the leaving page, rejects invalid pages, and debounces page-position writes', () => {
  const writes = [], flushes = [], options = []
  const state = harness('useStudyPDFPages.ts', {
    '../utils/indexedDB': { flushDrawingSaves: async (...args) => flushes.push(args), updatePDFRecord: async (...args) => writes.push(args) },
    './pdf/usePDFRenderer': { usePDFRenderer: (record, config) => { options.push(config); return { numPages: 3, pdfDoc: {}, isLoading: false } } },
  })
  const record = { id: 'book', lastPageNumberA: 1, lastPageNumberB: 2 }
  const render = () => state.render('useStudyPDFPages', record, record.id)
  let view = render(); view.handlePageAChange(0); view.handlePageBChange(4)
  assert.equal(flushes.length, 0)
  view.handlePageAChange(2); view = render(); view.handlePageAChange(3); render()
  assert.deepEqual(flushes, [['book', 1], ['book', 2]])
  assert.equal(writes.length, 0); state.tick()
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [['book', { lastPageNumberA: 3 }]])
  view = render(); view.setPageB(12); render(); options.at(-1).onLoadSuccess(3)
  assert.equal(render().pageB, 1)
  state.unmount()
})

test('drawing save queue publishes after render and flushes pending writes to the original PDF on switch/unmount', () => {
  const scheduled = [], flushed = []
  const state = harness('useStudyPageAnnotations.ts', {
    '../utils/indexedDB': { scheduleDrawingSave: (...args) => scheduled.push(args), flushDrawingSaves: async (...args) => flushed.push(args) },
  })
  let revision = {}, pdfId = 'first'
  const render = () => state.render('useStudyDrawingSaveQueue', pdfId, revision)
  const queue = render(); queue.current.set(2, '[1]'); queue.current.set(2, '[2]')
  assert.equal(scheduled.length, 0)
  revision = {}; render(); assert.deepEqual(scheduled, [['first', 2, '[2]']])
  queue.current.set(3, '[3]'); pdfId = 'second'; render()
  assert.deepEqual(scheduled.at(-1), ['first', 3, '[3]'])
  queue.current.set(4, '[4]'); state.window.emit('pagehide')
  assert.deepEqual(scheduled.at(-1), ['second', 4, '[4]'])
  queue.current.set(5, '[5]'); state.unmount()
  assert.deepEqual(scheduled.at(-1), ['second', 5, '[5]'])
  assert.equal(state.window.listeners.get('pagehide').size, 0)
  assert.deepEqual(flushed.map(args => args[0]), ['first', 'second', 'second'])
})

test('late annotation loads cannot replace the annotations for a newly selected PDF; empty text clears persisted data', async () => {
  const pending = [], saved = []
  const state = harness('useStudyPageAnnotations.ts', {
    '../utils/indexedDB': { getAllTextAnnotations: id => new Promise(resolve => pending.push({ id, resolve })),
      saveTextAnnotation: async (...args) => saved.push(args) },
  })
  state.render('useStudyTextAnnotations', 'first')
  state.render('useStudyTextAnnotations', 'second')
  pending[1].resolve({ 2: JSON.stringify([{ text: 'second' }]) }); await tick()
  pending[0].resolve({ 1: JSON.stringify([{ text: 'first' }]) }); await tick()
  const view = state.render('useStudyTextAnnotations', 'second')
  assert.equal(view.textAnnotations.get(2)[0].text, 'second')
  assert.equal(view.textAnnotations.has(1), false)
  view.persistTextAnnotations(2, []); await tick()
  assert.deepEqual(saved, [['second', 2, '[]']])
})

test('pushing from an older panel discards only the forward branch and preserves restored panel data', () => {
  const state = harness('useStudyPanelStack.ts')
  const render = () => state.render('useStudyPanelStack', { type: 'pdf' })
  let view = render(); view.pushPanel({ type: 'answer', id: 1 }); view = render()
  view.pushPanel({ type: 'grading', id: 2 }); view = render()
  view.setActivePanelIndex(0); view = render(); view.pushPanel({ type: 'answer', id: 3 }); view = render()
  assert.deepEqual(JSON.parse(JSON.stringify(view.panelStack)), [{ type: 'pdf' }, { type: 'answer', id: 3 }])
  assert.equal(view.activePanelIndex, 1)
  const restored = [{ type: 'pdf' }, { type: 'answer', drawing: 'saved' }, { type: 'grading' }]
  view.setPanelStack(restored); view.setActivePanelIndex(2); view = render()
  assert.equal(view.panelStack, restored); assert.equal(view.activePanelIndex, 2)
})
