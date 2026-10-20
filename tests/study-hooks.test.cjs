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
const { harness: pageHarness } = require('./helpers/pdf-page-navigation-harness.cjs')
const geometry = moduleAt(path.join(__dirname, '../../drawing-common/src/geometry/viewport.ts'), {}, {})

function harness(file, overrides = {}) {
  let cursor = 0, timerId = 0
  const cells = [], effects = [], timers = new Map()
  const react = {
    useCallback(callback) { return callback },
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
  window.location = { hostname: 'example.test' }
  window.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id }
  window.clearTimeout = id => timers.delete(id)
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

function voiceHarness(options = {}) {
  const instances = [], drafts = [], committed = [], cancelled = []
  const state = harness('useVoiceInput.ts', {
    '../contexts/AuthContext': { useAuth: () => ({ userData: { isPremium: options.premium !== false } }) },
    '../utils/indexedDB': { getAppSettings: async () => ({ isPremium: options.localPremium === true }) },
  })
  class Recognition {
    constructor() { instances.push(this); this.started = 0; this.stopped = 0; this.aborted = 0 }
    start() { this.started++ }
    stop() { this.stopped++; if (options.synchronousEnd) this.onend?.() }
    abort() { this.aborted++ }
  }
  state.window.webkitSpeechRecognition = Recognition
  if (options.local) state.window.location.hostname = 'localhost'
  const args = { initialText: options.initialText ?? '', language: options.language ?? 'en',
    onCommit: text => committed.push(text), onCancel: () => cancelled.push(true), onDraftChange: text => drafts.push(text) }
  const view = () => state.render('useVoiceInput', args)
  const result = (recognition, parts, resultIndex = 0) => recognition.onresult?.({ resultIndex,
    results: parts.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal })) })
  return { state, args, instances, drafts, committed, cancelled, view, result }
}

test('voice input starts once, appends only changed final results and commits once after graceful stop', () => {
  const h = voiceHarness({ initialText: 'Question' }), commands = h.view()
  commands.startVoice(); commands.startVoice()
  assert.equal(h.instances.length, 1)
  const recognition = h.instances[0]
  assert.equal(recognition.lang, 'en-US')
  recognition.onstart()
  assert.equal(h.view().phase, 'listening')
  h.result(recognition, [['hello', true], ['world', false]])
  assert.equal(h.view().shownText, 'Question hello world')
  h.result(recognition, [['hello', true], ['world', true]], 1)
  assert.equal(h.view().shownText, 'Question hello world')
  assert.equal(h.drafts.at(-1), 'Question hello world')
  h.view().stopVoice()
  assert.equal(h.view().phase, 'stopping')
  recognition.onend()
  assert.equal(h.view().phase, 'idle')
  h.view().finish(false); h.view().finish(false)
  assert.deepEqual(h.committed, ['Question hello world'])
  assert.equal(recognition.onresult, null)
})

test('voice errors, stopping timeout, stale callbacks and unmount release recognition without losing text', () => {
  const h = voiceHarness({ language: 'ja' })
  h.view().startVoice()
  const first = h.instances[0], staleResult = first.onresult
  h.result(first, [['途中', false]])
  first.onerror({ error: 'not-allowed' })
  assert.equal(h.view().errorKey, 'voice.permission')
  assert.equal(h.view().shownText, '途中')
  assert.equal(first.aborted, 1)
  staleResult({ resultIndex: 0, results: [{ 0: { transcript: '古い結果' }, isFinal: true }] })
  assert.equal(h.view().shownText, '途中')
  h.view().startVoice()
  const second = h.instances[1]
  h.result(second, [['続き', false]])
  h.view().stopVoice(); h.state.tick()
  assert.equal(h.view().shownText, '途中続き')
  assert.equal(h.view().phase, 'idle')
  h.view().startVoice()
  const third = h.instances[2]
  h.state.unmount()
  assert.equal(third.aborted, 1)
  assert.equal(third.onresult, null)
  assert.deepEqual(h.committed, [])
})

test('voice availability respects Premium and local settings; synchronous stop and language changes keep the saved text', async () => {
  const h = voiceHarness({ premium: false, local: true, localPremium: true, synchronousEnd: true, language: 'ja' })
  h.view().startVoice()
  assert.equal(h.instances.length, 0)
  await tick()
  h.view().startVoice()
  assert.equal(h.instances[0].lang, 'ja-JP')
  h.result(h.instances[0], [['日本語', true]])
  h.view().stopVoice()
  assert.equal(h.view().phase, 'idle')
  h.args.language = 'en'
  assert.equal(h.view().shownText, '日本語')
  h.view().startVoice()
  assert.equal(h.instances[1].lang, 'en-US')
  h.view().finish(true)
  assert.deepEqual(h.cancelled, [true])
  h.state.tick()
  assert.deepEqual(h.committed, [])
})

test('rectangle mouse/touch commands finish the latest coordinates once and cancel every part of the selection', () => {
  const state = harness('useRectangleSelection.ts'), container = new Surface()
  const commands = state.render('useRectangleSelection', { current: container })
  commands.beginAt(310, 220)
  commands.moveAt(110, 120)
  assert.deepEqual({ ...commands.finish() }, { x: 100, y: 100, width: 200, height: 100 })
  assert.equal(commands.finish(), null)
  assert.equal(commands.startRef.current, null)
  commands.begin(10, 20)
  commands.move(13, 25)
  assert.equal(commands.finish(), null)
  assert.equal(commands.rectRef.current, null)
  commands.beginAt(110, 120)
  commands.moveAt(999, 999, { left: 10, top: 20, right: 400, bottom: 500 })
  assert.deepEqual({ ...commands.rectRef.current }, { x: 100, y: 100, width: 290, height: 380 })
  commands.cancel()
  commands.moveAt(210, 220)
  assert.equal(commands.finish(), null)
  assert.equal(commands.activeRef.current, false)
  assert.equal(commands.startRef.current, null)
  assert.equal(commands.rectRef.current, null)
})

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
    finishTouchGesture() {},
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
      setPinchActive() {}, finishTouchGesture() {}, applyPinch: (gesture, pair) => updates.push({ gesture, pair }) }), cancelSelection() {} })
  const event = distance => ({ touches: [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }], preventDefault() {} })
  handlers.handleOverlayTouchStart(event(0)); handlers.handleOverlayTouchMove(event(100))
  assert.equal(updates.length, 0)
  handlers.handleOverlayTouchStart(event(100)); handlers.handleOverlayTouchMove(event(10000))
  assert.equal(updates.length, 1)
  assert.equal(updates[0].pair.distance, 10000)
  assert.equal(updates[0].gesture.startDist, 100)
})

test('pinch state ends when one finger lifts, and cancellation or unmount cannot leave the pane pinching', () => {
  const state = harness('useStudyOverlayTouch.ts'), changes = [], singleMoves = [], cancelled = [], finishes = []
  const pane = { getZoom: () => 1, getMinimumZoom: () => 0.1, getPanOffset: () => ({ x: 0, y: 0 }),
    applyPinch() {},
    finishTouchGesture: cancelled => finishes.push(cancelled),
    setPinchActive: active => changes.push(active) }
  const handlers = state.render('useStudyOverlayTouch', { containerRef: { current: new Surface() },
    getTargetPane: () => 'A', getPane: () => pane, cancelSelection: () => cancelled.push(true) })
  const first = { clientX: 100, clientY: 100 }, second = { clientX: 200, clientY: 100 }
  const event = touches => ({ touches, preventDefault() {} })
  handlers.handleOverlayTouchStart(event([first, second]))
  handlers.handleOverlayTouchEnd(event([first]))
  handlers.handleOverlayTouchMove(event([first]), () => singleMoves.push(true))
  assert.deepEqual(changes, [true, false])
  assert.deepEqual(finishes, [false])
  assert.deepEqual(singleMoves, [])
  handlers.handleOverlayTouchEnd(event([]))
  assert.deepEqual(finishes, [false]) // Lifting the remaining finger cannot commit twice.

  handlers.handleOverlayTouchStart(event([first, second]))
  handlers.handleOverlayTouchCancel()
  handlers.handleOverlayTouchMove(event([first, second]))
  assert.deepEqual(changes, [true, false, true, false])
  assert.deepEqual(finishes, [false, true])
  assert.equal(cancelled.length, 3)

  handlers.handleOverlayTouchStart(event([first, second]))
  state.unmount()
  assert.deepEqual(changes, [true, false, true, false, true, false])
  assert.deepEqual(finishes, [false, true, true])
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
    finishTouchGesture() {},
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

// Exercise PDFPane's real gesture commands with the real viewport controller.
// In particular, do not render between the final movement and finger release.
function pdfTouchPane({ page = 2, left = 0, zoom } = {}) {
  const app = zoomHarness({ width: 500, height: 800, left })
  app.fit()
  const view = app.view()
  if (zoom) view.setZoom(zoom)
  const navigation = pageHarness({ left, right: left + 500, height: 800, pageNum: page, numPages: 4,
    ...view.getViewport(), getViewport: view.getViewport,
    onViewportChange: (zoom, panOffset, paperSize) => view.restoreViewport({ zoom, panOffset }, paperSize) })
  const file = path.join(__dirname, '../src/components/study/PDFPane.tsx')
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = ['SWIPE_THRESHOLD', 'goToPrevPage', 'goToNextPage', 'checkAndFinishSwipe', 'applyTouchPinch', 'finishTouchGesture']
  const commands = new Map()
  let setPinchActive
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) {
      commands.set(node.name.getText(source), node.initializer.getText(source))
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'setPinchActive') {
      setPinchActive = node.initializer.getText(source)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(commands.size, names.length)
  assert.ok(setPinchActive)
  const code = names.map(name => `const ${name} = ${commands.get(name)};`).join('\n')
    + `\nconst result = { applyPinch: applyTouchPinch, finishTouchGesture, finishMouseDrag: checkAndFinishSwipe,
      setPinchActive: ${setPinchActive} };`
  const pane = vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText + '\nresult', {
    React: { useCallback: callback => callback }, window: { innerHeight: 1000 },
    pageNavigation: navigation.render(),
    getOverscroll: view.getOverscroll, resetOverscroll: view.resetOverscroll,
    applyPinch: view.applyPinch, setIsPinching() {}, pinchZoomedRef: { current: false },
  })
  pane.getZoom = () => view.getViewport().zoom
  pane.getPanOffset = () => view.getViewport().panOffset
  return { pane, app, pages: navigation.pages, view, navigation,
    async complete() {
      await tick()
      navigation.render()
      navigation.frame()
      navigation.advance(310)
      navigation.render().onPageRendered(navigation.options.pageNum)
      navigation.frame(); navigation.frame(); navigation.render()
    },
    dispose() { navigation.unmount(); app.dispose() },
  }
}

test('two-finger PDF page turns work through the selection/text overlay on either pane', async () => {
  for (const target of ['A', 'B']) for (const distance of [-550, 550]) {
    const panes = { A: pdfTouchPane(), B: pdfTouchPane({ left: 510 }) }
    const state = harness('useStudyOverlayTouch.ts'), cancelled = [], selections = []
    const handlers = state.render('useStudyOverlayTouch', { containerRef: { current: new Surface() },
      getTargetPane: x => x < 510 ? 'A' : 'B', getPane: name => panes[name].pane,
      cancelSelection: () => cancelled.push(true) })
    const x = target === 'A' ? 250 : 760
    const points = y => [{ clientX: x - 50, clientY: y }, { clientX: x + 50, clientY: y }]
    const event = touches => ({ touches, preventDefault() {} })
    handlers.handleOverlayTouchStart(event(points(450).slice(0, 1)), () => selections.push('start'))
    handlers.handleOverlayTouchStart(event(points(450)))
    const moved = points(450 + distance)
    moved[1].clientX += 15 // Small finger-spacing drift is still a page drag.
    handlers.handleOverlayTouchMove(event(moved))
    assert.ok(Math.abs(panes[target].view.getOverscroll().y) > 250)
    assert.deepEqual(panes[target].pages, [])
    handlers.handleOverlayTouchEnd(event(points(450 + distance).slice(0, 1)))
    handlers.handleOverlayTouchMove(event(points(450 + distance).slice(0, 1)), () => selections.push('move'))
    handlers.handleOverlayTouchEnd(event([]))
    assert.deepEqual(panes[target].pages, [], 'touch release waits for the same transition as the wheel')
    assert.equal(panes[target].navigation.snapshotRequests.length, 1)
    await panes[target].complete()
    assert.deepEqual(panes[target].pages, [distance < 0 ? 3 : 1])
    assert.deepEqual(panes[target === 'A' ? 'B' : 'A'].pages, [])
    assert.deepEqual(selections, ['start'])
    assert.equal(cancelled.length, 1)
    near(panes[target].view.getOverscroll().y, 0)
    state.unmount()
    Object.values(panes).forEach(pane => pane.dispose())
  }
})

test('short drags, page boundaries, zooms, cancelled touches and unmount never turn the PDF', async () => {
  for (const scenario of [
    { distance: -50 }, { page: 1, distance: 550 }, { page: 4, distance: -550 },
    { distance: 0, shiftX: 550 }, { distance: -550, zoom: 2 },
    { distance: -550, spread: 200 }, { distance: -550, cancel: true }, { distance: -550, unmount: true },
  ]) {
    const pdf = pdfTouchPane(scenario), state = harness('useStudyOverlayTouch.ts')
    const handlers = state.render('useStudyOverlayTouch', { containerRef: { current: new Surface() },
      getTargetPane: () => 'A', getPane: () => pdf.pane, cancelSelection() {} })
    const event = (y, spread = 100, shiftX = 0) => ({ touches: [
      { clientX: 250 - spread / 2 + shiftX, clientY: y }, { clientX: 250 + spread / 2 + shiftX, clientY: y },
    ], preventDefault() {} })
    handlers.handleOverlayTouchStart(event(450))
    handlers.handleOverlayTouchMove(event(450 + scenario.distance, scenario.spread, scenario.shiftX))
    if (scenario.cancel) handlers.handleOverlayTouchCancel()
    else if (scenario.unmount) state.unmount()
    else handlers.handleOverlayTouchEnd({ touches: [] })
    await pdf.complete()
    assert.equal(pdf.navigation.snapshotRequests.length, 0)
    assert.deepEqual(pdf.pages, [], JSON.stringify(scenario))
    near(pdf.view.getOverscroll().y, 0)
    if (!scenario.unmount) state.unmount()
    pdf.dispose()
  }
})

test('direct PDF touches share the same page-turn completion as overlays and the wheel', async () => {
  const pdf = pdfTouchPane(), start = pdf.view.getViewport()
  const gesture = { startZoom: start.zoom, startPan: start.panOffset,
    startDist: 100, startCenter: { x: 250, y: 450 } }
  pdf.pane.setPinchActive(true)
  pdf.pane.applyPinch(gesture, { distance: 100, center: { x: 250, y: -100 } })
  pdf.pane.finishTouchGesture()
  pdf.pane.finishTouchGesture()
  assert.equal(pdf.navigation.snapshotRequests.length, 1)
  assert.deepEqual(pdf.pages, [])
  await pdf.complete()
  assert.deepEqual(pdf.pages, [3])
  near(pdf.view.getOverscroll().y, 0)
  pdf.dispose()
})

test('Ctrl-mouse drag finishes through the same PDF transition and cannot overlap a touch/wheel turn', async () => {
  const pdf = pdfTouchPane()
  pdf.view.startPanningAt(250, 450)
  pdf.view.panTo(250, -350)
  assert.ok(pdf.view.getOverscroll().y < -250)
  pdf.pane.finishMouseDrag()
  pdf.pane.finishMouseDrag()
  pdf.pane.finishTouchGesture()
  pdf.navigation.emit(); pdf.navigation.advance(50); pdf.navigation.emit()
  assert.equal(pdf.navigation.snapshotRequests.length, 1)
  assert.deepEqual(pdf.pages, [])
  await pdf.complete()
  assert.deepEqual(pdf.pages, [3])
  pdf.dispose()
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

test('page view commands retain the reading apps B-tab policy and delegate swaps only in split view', () => {
  const state = harness('useStudyPageView.ts'), swaps = []
  const options = { initialView: { mode: 'single', activeTab: 'B' }, splitActiveTab: 'B',
    onSwapPanes: () => swaps.push('swap') }
  const render = () => state.render('useStudyPageView', options)
  let view = render()
  assert.equal(view.isSplitView, false); assert.equal(view.activeTab, 'B')
  view.toggleActiveTab(); view = render(); assert.equal(view.activeTab, 'A')
  view.toggleSplitView(); view = render()
  assert.equal(view.isSplitView, true); assert.equal(view.activeTab, 'B'); assert.equal(swaps.length, 0)
  view.toggleSplitView(); view.toggleSplitView()
  assert.deepEqual(swaps, ['swap', 'swap'])
  view.showTab('A'); view = render()
  assert.equal(view.isSplitView, true); assert.equal(view.activeTab, 'A')
  view.toggleActiveTab(); view = render()
  assert.equal(view.isSplitView, false); assert.equal(view.activeTab, 'B')
})

test('drawing app keeps its active pane when entering/leaving split and rapid commands use the latest view', () => {
  const state = harness('useStudyPageView.ts'), swaps = []
  const options = { initialView: { mode: 'split', activeTab: 'A' }, onSwapPanes: () => swaps.push('swap') }
  const render = () => state.render('useStudyPageView', options)
  let view = render()
  view.toggleActiveTab(); view.toggleActiveTab(); view.toggleSplitView(); view.toggleSplitView()
  view = render()
  assert.equal(view.isSplitView, true); assert.equal(view.activeTab, 'B')
  assert.deepEqual(swaps, ['swap'])
  view.toggleActiveTab(); view = render()
  assert.equal(view.isSplitView, false); assert.equal(view.activeTab, 'B')
  view.toggleActiveTab(); view = render(); assert.equal(view.activeTab, 'A')
})

test('page navigation flushes the leaving page, rejects invalid pages, and debounces page-position writes', () => {
  const writes = [], flushes = [], options = []
  const state = harness('useStudyPDFPages.ts', {
    '../utils/indexedDB': { flushDrawingSaves: async (...args) => flushes.push(args), updatePDFRecord: async (...args) => writes.push(args) },
    './pdf/usePDFRenderer': { usePDFRenderer: (record, config) => { options.push(config); return { numPages: 3, pdfDoc: {}, isLoading: false } } },
  })
  const record = { id: 'book', lastPageNumberA: 1, lastPageNumberB: 2 }
  const render = () => state.render('useStudyPDFPages', record, record.id)
  let view = render()
  for (const page of [0, 4, 1.5, NaN, Infinity]) { view.handlePageAChange(page); view.handlePageBChange(page) }
  assert.equal(flushes.length, 0)
  view.handlePageAChange(2); view = render(); view.handlePageAChange(3); render()
  assert.deepEqual(flushes, [['book', 1], ['book', 2]])
  assert.equal(writes.length, 0); state.tick()
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [['book', { lastPageNumberA: 3 }]])
  view = render(); view.swapPages(); view = render()
  assert.equal(view.pageA, 2); assert.equal(view.pageB, 3)
  assert.deepEqual(flushes.slice(-2), [['book', 3], ['book', 2]])
  state.tick()
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1))), ['book', { lastPageNumberA: 2, lastPageNumberB: 3 }])
  view.handlePageAChange(1); view.swapPages(); view = render()
  assert.equal(view.pageA, 3); assert.equal(view.pageB, 1)
  state.unmount()
})

test('saved out-of-range page positions recover together and equal-page swaps do not flush or write', () => {
  const writes = [], flushes = [], options = []
  const state = harness('useStudyPDFPages.ts', {
    '../utils/indexedDB': { flushDrawingSaves: async (...args) => flushes.push(args), updatePDFRecord: async (...args) => writes.push(args) },
    './pdf/usePDFRenderer': { usePDFRenderer: (record, config) => { options.push(config); return { numPages: 3, pdfDoc: {}, isLoading: false } } },
  })
  const record = { id: 'book', lastPageNumberA: 12, lastPageNumberB: -2 }
  const render = () => state.render('useStudyPDFPages', record, record.id)
  render(); options.at(-1).onLoadSuccess(3)
  let view = render(); assert.equal(view.pageA, 1); assert.equal(view.pageB, 1)
  state.tick()
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [['book', { lastPageNumberA: 1, lastPageNumberB: 1 }]])
  const before = flushes.length
  view.swapPages(); view.handlePageAChange(1); view.handlePageBChange(1)
  render(); state.tick()
  assert.equal(flushes.length, before); assert.equal(writes.length, 1)
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
