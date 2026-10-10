const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, modules = {}, globals = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const exports = {}
    vm.runInNewContext(code, {
        exports, require: id => { assert.ok(modules[id], id); return modules[id] },
        console, ...globals,
    })
    return exports
}
const wheel = load('utils/wheelPageGesture.ts')

test('mouse and trackpad wheel units have a margin even for a single large delta', () => {
    assert.equal(wheel.normalizeWheelDelta({ deltaY: 3, deltaMode: 1 }, 800), 48)
    assert.equal(wheel.normalizeWheelDelta({ deltaY: 20, deltaMode: 0 }, 800), 20)
    assert.equal(wheel.normalizeWheelDelta({ deltaY: -1, deltaMode: 2 }, 800), -100)
    assert.equal(wheel.normalizeWheelDelta({ deltaY: 9000, deltaMode: 0 }, 800), 100)
    assert.equal(wheel.normalizeWheelDelta({ deltaY: NaN, deltaMode: 0 }, 800), 0)
    const gesture = new wheel.WheelPageGesture()
    assert.equal(gesture.move(100, 0, true, true).turn, null)
    assert.equal(gesture.move(100, 100, true, true).turn, 1)
})

test('short gestures and a reversal do not accumulate into an accidental page turn', () => {
    const gesture = new wheel.WheelPageGesture()
    gesture.move(100, 0, true, true)
    assert.equal(gesture.move(100, wheel.WHEEL_GESTURE_IDLE_MS + 1, true, true).turn, null)
    const reversed = gesture.move(-100, wheel.WHEEL_GESTURE_IDLE_MS + 2, true, true)
    assert.ok(reversed.offset > 0)
    assert.equal(reversed.turn, null)
    assert.equal(gesture.move(-100, wheel.WHEEL_GESTURE_IDLE_MS + 3, true, true).turn, -1)
})

test('inertia turns only one page until the wheel has been still', () => {
    const gesture = new wheel.WheelPageGesture()
    gesture.move(100, 0, true, true)
    assert.equal(gesture.move(100, 50, true, true).turn, 1)
    for (let now = 100; now <= 1000; now += 50) assert.equal(gesture.move(100, now, true, true).turn, null)
    const resumed = 1000 + wheel.WHEEL_GESTURE_IDLE_MS + 1
    assert.equal(gesture.move(100, resumed, true, true).turn, null)
    assert.equal(gesture.move(100, resumed + 50, true, true).turn, 1)
})

test('first and last page bounce without turning, and can still turn the other way', () => {
    for (const [delta, back, forward] of [[-100, false, true], [100, true, false]]) {
        const gesture = new wheel.WheelPageGesture()
        for (let now = 0; now < 400; now += 50) {
            const result = gesture.move(delta, now, back, forward)
            assert.equal(result.turn, null)
            assert.ok(Math.abs(result.offset) <= 40)
        }
        assert.equal(gesture.move(-delta, 450, back, forward).turn, null)
        assert.equal(gesture.move(-delta, 500, back, forward).turn, -Math.sign(delta))
    }
})

// Exercise the actual hook with a deterministic clock and DOM event surface.
// No microphone, real browser, PDF data or network service is required.
class ElementAdapter {
    constructor(editable = false) { this.editable = editable }
    closest() { return this.editable ? this : null }
}
function harness({ enabled = true, left = 0, right = 800, snapshot, surface } = {}) {
    let now = 0, nextId = 1, cursor = 0, effects = [], layoutEffects = [], mounted = true
    const cells = [], timers = new Map(), frames = new Map(), pages = [], views = []
    const disposalLog = [], snapshotRequests = []
    const mainLayer = { style: { visibility: 'visible' } }
    surface ??= {
        listeners: new Set(),
        addEventListener(_, listener, options) { assert.equal(options.passive, false); this.listeners.add(listener) },
        removeEventListener(_, listener) { this.listeners.delete(listener) },
    }
    const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
    const effect = (queue, callback, deps) => {
        const i = cursor++
        if (!same(cells[i]?.deps, deps)) queue.push(() => {
            cells[i]?.cleanup?.()
            cells[i] = { deps, cleanup: callback() }
        })
    }
    const react = {
        useRef(value) { const i = cursor++; cells[i] ??= { current: value }; return cells[i] },
        useState(value) {
            const i = cursor++
            if (!(i in cells)) cells[i] = value
            return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value }]
        },
        useCallback(callback, deps) {
            const i = cursor++
            if (!same(cells[i]?.deps, deps)) cells[i] = { value: callback, deps }
            return cells[i].value
        },
        useEffect: (callback, deps) => effect(effects, callback, deps),
        useLayoutEffect: (callback, deps) => effect(layoutEffects, callback, deps),
    }
    const clone = { style: {}, getBoundingClientRect: () => ({}), disposed: 0 }
    const snapshots = {
        createPageTurnSnapshot: options => {
            snapshotRequests.push(options)
            return snapshot ? snapshot(options) : Promise.resolve({
                layer: clone, width: 600, height: 800, left: 0,
                top: options.direction === 1 ? 820 : -820,
            })
        },
        disposePageTurnSnapshot: layer => {
            disposalLog.push({ layer, mounted, visibility: mainLayer.style.visibility })
            layer.disposed++
        },
    }
    const hook = load('hooks/pdf/useWheelPageNavigation.ts', {
        react, '../../utils/wheelPageGesture': wheel, '../../utils/pdfPageTurnSnapshot': snapshots,
    }, {
        AbortController, Element: ElementAdapter, performance: { now: () => now },
        window: { innerHeight: 1100, matchMedia: () => ({ matches: false }) },
        setTimeout: (callback, delay) => { const id = nextId++; timers.set(id, { callback, time: now + delay }); return id },
        clearTimeout: id => timers.delete(id),
        requestAnimationFrame: callback => { const id = nextId++; frames.set(id, callback); return id },
        cancelAnimationFrame: id => frames.delete(id),
    })
    const pane = {
        clientWidth: right - left, clientHeight: 1000,
        getBoundingClientRect: () => ({ left, right, top: 0, bottom: 1000, width: right - left, height: 1000 }),
    }
    const options = {
        enabled, containerRef: { current: pane }, layerRef: { current: mainLayer }, eventTargetRef: { current: surface },
        pdfDoc: {}, pageNum: 2, numPages: 10, canvasSize: { width: 600, height: 800 },
        renderScale: 1, zoom: 1, panOffset: { x: 100, y: 100 }, splitMode: false, ready: true, busy: false,
        onPageChange: page => { pages.push(page); options.pageNum = page },
        onViewportChange: (zoom, pan) => views.push({ zoom, pan }),
    }
    let result
    const render = () => {
        cursor = 0; effects = []; layoutEffects = []
        result = hook.useWheelPageNavigation(options)
        result.overlayRef.current = { append() {} }
        // PDFPane applies visibility during the DOM commit, before layout effects.
        mainLayer.style.visibility = result.covered ? 'hidden' : 'visible'
        layoutEffects.forEach(effect => effect())
        effects.forEach(effect => effect())
        return result
    }
    render()
    const emit = overrides => {
        const event = {
            target: new ElementAdapter(), clientX: (left + right) / 2, clientY: 200,
            deltaX: 0, deltaY: 100, deltaMode: 0, buttons: 0, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true }, stopPropagation() {}, ...overrides,
        }
        surface.listeners.forEach(listener => listener(event))
        return event
    }
    const advance = ms => {
        now += ms
        for (;;) {
            const due = [...timers].find(([, timer]) => timer.time <= now)
            if (!due) break
            timers.delete(due[0]); due[1].callback()
        }
    }
    const frame = () => {
        const callbacks = [...frames.values()]; frames.clear()
        now += 16; callbacks.forEach(callback => callback())
    }
    const unmount = () => { mounted = false; cells.forEach(cell => cell?.cleanup?.()) }
    return { render, emit, advance, frame, unmount, options, pages, views, clone, surface,
        mainLayer, disposalLog, snapshotRequests }
}

test('wheel navigation is opt-in, leaves Ctrl/Command zoom and editable controls alone', () => {
    const disabled = harness({ enabled: false })
    assert.equal(disabled.surface.listeners.size, 0)
    assert.equal(disabled.emit().defaultPrevented, false)
    const app = harness()
    for (const overrides of [
        { ctrlKey: true }, { metaKey: true }, { deltaX: 200 }, { buttons: 1 },
        { target: new ElementAdapter(true) }, { clientX: 900 },
    ]) assert.equal(app.emit(overrides).defaultPrevented, false)
    assert.deepEqual(app.pages, [])
    assert.equal(app.emit().defaultPrevented, true)
    assert.ok(app.render().offset < 0)
    app.advance(wheel.WHEEL_GESTURE_IDLE_MS)
    assert.equal(app.render().offset, 0)
    app.unmount()
    assert.equal(app.surface.listeners.size, 0)
})

test('selection overlays route to the pane under the pointer, including split A/B', () => {
    const a = harness({ left: 0, right: 400 })
    const b = harness({ left: 400, right: 800, surface: a.surface })
    assert.equal(a.emit({ clientX: 650 }).defaultPrevented, true)
    assert.equal(a.render().offset, 0)
    assert.ok(b.render().offset < 0)
    a.unmount(); b.unmount()
})

test('slide completes before page selection, and its snapshot lasts until the new bitmap is ready', async () => {
    const app = harness()
    app.emit(); app.advance(50); app.emit()
    await new Promise(setImmediate)
    assert.equal(app.render().covered, true)
    assert.deepEqual(app.pages, [])
    app.frame()
    assert.match(app.clone.style.transform, /translate\(100px, -720px\)/)
    app.advance(310)
    assert.deepEqual(app.pages, [3])
    assert.equal(app.views[0].zoom, 1)
    assert.equal(app.render().covered, true)
    app.emit() // Inertia continues while the selected page is rendering.
    app.render().onPageRendered(2)
    app.frame(); app.frame()
    assert.equal(app.render().covered, true)
    app.render().onPageRendered(3)
    app.frame(); app.frame()
    // A busy React render can postpone the commit beyond the readiness frames.
    app.advance(500); app.frame(); app.frame()
    assert.equal(app.mainLayer.style.visibility, 'hidden')
    assert.equal(app.clone.disposed, 0)
    app.emit(); app.advance(50); app.emit()
    await new Promise(setImmediate)
    assert.equal(app.snapshotRequests.length, 1)
    assert.equal(app.render().covered, false)
    assert.equal(app.clone.disposed, 1)
    assert.equal(app.disposalLog[0].visibility, 'visible')
    for (let i = 0; i < 20; i++) { app.advance(50); app.emit() }
    await new Promise(setImmediate)
    app.frame(); app.advance(310)
    assert.deepEqual(app.pages, [3])
    app.unmount()
})

test('unmount and an explicit zoom cancel a pending page slide and ignore late preview work', async () => {
    for (const cancel of ['zoom', 'unmount']) {
        let resolve
        const app = harness({ snapshot: () => new Promise(yes => { resolve = yes }) })
        app.emit(); app.advance(50); app.emit()
        if (cancel === 'zoom') assert.equal(app.emit({ ctrlKey: true }).defaultPrevented, false)
        else app.unmount()
        resolve({ layer: app.clone, width: 600, height: 800, left: 0, top: 820 })
        await new Promise(setImmediate)
        app.frame(); app.advance(9000)
        assert.deepEqual(app.pages, [])
        assert.equal(app.clone.disposed, 1)
        if (cancel === 'zoom') { assert.equal(app.render().covered, false); app.unmount() }
    }
})

test('a different paper size slides to its fitted destination and a missing bitmap releases the cover', async () => {
    const layer = { style: {}, getBoundingClientRect: () => ({}), disposed: 0 }
    const app = harness({ snapshot: async () => ({ layer, width: 1200, height: 600, left: -300, top: 820 }) })
    app.emit(); app.advance(50); app.emit()
    await new Promise(setImmediate)
    app.frame(); app.advance(310)
    assert.equal(app.views[0].zoom, 0.65)
    assert.equal(app.views[0].pan.x, 10)
    assert.equal(app.views[0].pan.y, 305)
    assert.equal(app.render().covered, true)
    app.advance(8000)
    assert.equal(app.mainLayer.style.visibility, 'hidden')
    assert.equal(layer.disposed, 0)
    assert.equal(app.render().covered, false)
    assert.equal(layer.disposed, 1)
    assert.equal(app.disposalLog[0].visibility, 'visible')
    app.unmount()
})

test('cancelling a visible slide retains its cover until the main page is committed', async () => {
    for (const cancel of ['zoom', 'disable', 'document', 'page']) {
        const app = harness()
        app.emit(); app.advance(50); app.emit()
        await new Promise(setImmediate)
        assert.equal(app.render().covered, true)
        app.frame()
        if (cancel === 'zoom') app.emit({ ctrlKey: true })
        else {
            if (cancel === 'disable') app.options.enabled = false
            if (cancel === 'document') app.options.pdfDoc = {}
            if (cancel === 'page') app.options.pageNum = 7
            app.render()
        }
        assert.equal(app.clone.disposed, 0)
        assert.equal(app.mainLayer.style.visibility, 'hidden')
        app.advance(9000); app.frame(); app.frame()
        assert.deepEqual(app.pages, [])
        assert.equal(app.clone.disposed, 0)
        assert.equal(app.render().covered, false)
        assert.equal(app.clone.disposed, 1)
        assert.equal(app.disposalLog[0].visibility, 'visible')
        app.unmount()
        assert.equal(app.clone.disposed, 1)
    }
})

test('unmount releases active and retiring snapshots immediately, without a late page change', async () => {
    for (const retiring of [false, true]) {
        const app = harness()
        app.emit(); app.advance(50); app.emit()
        await new Promise(setImmediate)
        assert.equal(app.render().covered, true)
        app.frame()
        if (retiring) app.emit({ ctrlKey: true })
        app.unmount()
        assert.equal(app.clone.disposed, 1)
        assert.equal(app.disposalLog[0].mounted, false)
        app.advance(9000); app.frame(); app.frame()
        assert.deepEqual(app.pages, [])
        assert.equal(app.clone.disposed, 1)
        assert.equal(app.surface.listeners.size, 0)
    }
})

test('cancellation before the cover is painted still releases the appended snapshot', async () => {
    const app = harness()
    app.emit(); app.advance(50); app.emit()
    await new Promise(setImmediate)
    app.emit({ ctrlKey: true })
    assert.equal(app.mainLayer.style.visibility, 'visible')
    assert.equal(app.clone.disposed, 0)
    assert.equal(app.render().covered, false)
    assert.equal(app.clone.disposed, 1)
    assert.equal(app.disposalLog[0].visibility, 'visible')
    app.unmount()
})

function snapshotAdapters({ ready = true, renderPromise = Promise.resolve() } = {}) {
    let rendered = 0, cancelled = 0, drawn = 0
    const canvas = (preview = false, drawing = false) => ({
        width: 8000, height: 4000, style: { width: '600px', height: '800px' },
        dataset: { rendered: ready ? 'true' : 'false' },
        classList: { contains: name => name === 'pdf-page-preview' ? preview : name === 'drawing-canvas' && drawing },
        getContext: () => ({ drawImage() {} }), remove() { this.removed = true },
    })
    const originals = [canvas(true), canvas(), canvas(false, true)]
    const copies = originals.map(() => canvas())
    const clone = {
        style: {}, prepend(target) { this.target = target }, setAttribute() {}, remove() { this.removed = true },
        querySelectorAll: () => [...copies.filter(value => !value.removed), ...(clone.target ? [clone.target] : [])],
    }
    const layer = {
        querySelector: () => originals[0], querySelectorAll: () => originals,
        cloneNode: () => clone,
    }
    const pdfDoc = { getPage: async () => ({
        rotate: 90,
        getViewport: ({ scale, rotation }) => {
            assert.equal(rotation, 90)
            return { width: 600 * scale, height: 400 * scale }
        },
        render: () => { rendered++; return { promise: renderPromise, cancel: () => cancelled++ } },
    }) }
    const snapshots = load('utils/pdfPageTurnSnapshot.ts', {
        '../components/study/components/PDFPagePreview': { drawPreviewPaths: () => drawn++ },
    }, { document: { createElement: () => canvas() } })
    return { snapshots, clone, copies, originals, rendered: () => rendered, cancelled: () => cancelled, drawn: () => drawn,
        options: { layer, pdfDoc, targetPage: 1, direction: -1, canvasSize: { width: 600, height: 800 },
            renderScale: 2, paths: [], signal: new AbortController().signal } }
}

test('transition snapshots reuse ready previews, preserve logical dimensions and cap bitmap memory', async () => {
    const app = snapshotAdapters()
    const result = await app.snapshots.createPageTurnSnapshot(app.options)
    assert.equal(app.rendered(), 0)
    assert.equal(result.top, -420)
    assert.equal(result.layer.target.style.width, '600px')
    assert.equal(result.layer.target.style.height, '400px')
    assert.equal(app.copies[0].removed, true)
    for (const bitmap of [app.copies[1], app.copies[2], result.layer.target]) {
        assert.ok(bitmap.width * bitmap.height <= 4_010_000)
    }
    assert.equal(app.copies[1].style.width, '600px')
    app.snapshots.disposePageTurnSnapshot(result.layer)
    assert.equal(app.clone.removed, true)
    assert.equal(result.layer.target.width, 1)
})

test('page-turn covers reveal capture ink and retain independent region markers without doubling their zoom', async () => {
    const app = snapshotAdapters()
    app.originals[2].style.visibility = 'hidden'
    app.copies[2].style.visibility = 'hidden'
    const markerCopy = { style: { transform: 'translate(10px, 20px) scale(2)', opacity: '0', visibility: 'hidden' } }
    const overlay = { style: { transform: markerCopy.style.transform }, cloneNode: () => markerCopy }
    app.clone.append = value => { app.clone.markers = value }
    await app.snapshots.createPageTurnSnapshot({ ...app.options, snapshotOverlays: [overlay] })
    assert.equal(app.copies[2].style.visibility, 'visible')
    assert.equal(app.originals[2].style.visibility, 'hidden')
    assert.equal(app.clone.markers, markerCopy)
    assert.equal(markerCopy.style.transform, 'none')
    assert.equal(markerCopy.style.visibility, 'visible')
    assert.equal(overlay.style.transform, 'translate(10px, 20px) scale(2)')
})

test('an unready adjacent preview renders only the target page and cancels its work on abort', async () => {
    const ready = snapshotAdapters({ ready: false })
    await ready.snapshots.createPageTurnSnapshot(ready.options)
    assert.equal(ready.rendered(), 1)
    assert.equal(ready.drawn(), 1)
    let resolve
    const app = snapshotAdapters({ ready: false, renderPromise: new Promise(yes => { resolve = yes }) })
    const controller = new AbortController()
    const work = app.snapshots.createPageTurnSnapshot({ ...app.options, signal: controller.signal })
    await new Promise(setImmediate)
    controller.abort()
    resolve()
    await assert.rejects(work, { name: 'AbortError' })
    assert.equal(app.cancelled(), 1)
    assert.equal(app.drawn(), 0)
})
