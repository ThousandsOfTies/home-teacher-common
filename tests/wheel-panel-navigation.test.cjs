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
        exports, require: id => { assert.ok(modules[id], id); return modules[id] }, console, ...globals,
    })
    return exports
}
const wheel = load('utils/wheelPageGesture.ts')
const { getPanelWheelDestination } = load('utils/panelWheelNavigation.ts')
const plain = value => JSON.parse(JSON.stringify(value))

test('horizontal route targets move one panel and stop at both ends', () => {
    const options = { currentIndex: 1, panelCount: 3 }
    assert.deepEqual(plain(getPanelWheelDestination({ ...options, direction: -1 })), { type: 'panel', index: 0 })
    assert.deepEqual(plain(getPanelWheelDestination({ ...options, direction: 1 })), { type: 'panel', index: 2 })
    assert.equal(getPanelWheelDestination({ ...options, currentIndex: 0, direction: -1 }), null)
    assert.equal(getPanelWheelDestination({ ...options, currentIndex: 2, direction: 1 }), null)
})

test('a fork blocks right even when an earlier chosen route remains in breadcrumbs; left still works', () => {
    const options = { currentIndex: 2, panelCount: 5, nextPanelId: 'a', outgoingIds: ['a', 'b'] }
    assert.equal(getPanelWheelDestination({ ...options, direction: 1 }), null)
    assert.deepEqual(plain(getPanelWheelDestination({ ...options, direction: -1 })), { type: 'panel', index: 1 })
})

test('a sole outgoing link reuses a matching panel or opens that marker instead of a stale route', () => {
    const options = { direction: 1, currentIndex: 0, panelCount: 4, outgoingIds: ['a', 'a'] }
    assert.deepEqual(plain(getPanelWheelDestination({ ...options, nextPanelId: 'a' })), { type: 'panel', index: 1 })
    assert.deepEqual(plain(getPanelWheelDestination({ ...options, nextPanelId: 'old' })), { type: 'marker', id: 'a' })
    assert.deepEqual(plain(getPanelWheelDestination({ ...options, panelCount: 1 })), { type: 'marker', id: 'a' })
})

test('a PDF screen without outgoing marks cannot enter a previous page\'s retained route', () => {
    assert.equal(getPanelWheelDestination({ direction: 1, currentIndex: 0, panelCount: 5, outgoingIds: [] }), null)
})

class ElementAdapter {
    constructor(editable = false) { this.editable = editable }
    closest() { return this.editable ? this : null }
}
function harness(overrides = {}) {
    let now = 0, cursor = 0, navigation
    const cells = [], effects = [], directions = []
    const surface = {
        clientWidth: 1000, listeners: new Set(),
        addEventListener(type, listener, options) {
            assert.equal(type, 'wheel'); assert.equal(options.passive, false); assert.equal(options.capture, true)
            this.listeners.add(listener)
        },
        removeEventListener(_, listener, capture) { assert.equal(capture, true); this.listeners.delete(listener) },
    }
    const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
    const react = {
        useRef(value) { const i = cursor++; cells[i] ??= { current: value }; return cells[i] },
        useState(value) {
            const i = cursor++
            cells[i] ??= { value }
            return [cells[i].value, next => { cells[i].value = next }]
        },
        useCallback(callback, deps) {
            const i = cursor++
            if (!same(cells[i]?.deps, deps)) cells[i] = { deps, callback }
            return cells[i].callback
        },
        useEffect(callback, deps) {
            const i = cursor++
            if (!same(cells[i]?.deps, deps)) effects.push(() => {
                cells[i]?.cleanup?.()
                cells[i] = { deps, cleanup: callback() }
            })
        },
    }
    const { useWheelPanelNavigation } = load('hooks/useWheelPanelNavigation.ts', {
        react, '../utils/wheelPageGesture': wheel,
    }, { Element: ElementAdapter, performance: { now: () => now } })
    const options = {
        enabled: true, containerRef: { current: surface }, navigationKey: 'pdf',
        canGoBack: true, canGoForward: true, busy: false,
        onNavigate: direction => { directions.push(direction) }, ...overrides,
    }
    const render = () => { cursor = 0; navigation = useWheelPanelNavigation(options); while (effects.length) effects.shift()() }
    const emit = (overrides = {}) => {
        const event = {
            deltaX: 100, deltaY: 0, deltaMode: 0, buttons: 0,
            ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
            target: new ElementAdapter(), defaultPrevented: false, stopped: false,
            preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true },
            ...overrides,
        }
        for (const listener of surface.listeners) listener(event)
        return event
    }
    render()
    return {
        options, directions, surface, emit, render,
        get navigation() { return navigation },
        advance: ms => { now += ms },
        unmount: () => { for (const cell of cells) cell?.cleanup?.() },
    }
}
const flush = () => new Promise(setImmediate)

test('horizontal wheel is opt-in and leaves vertical scroll, zoom, drawing and text controls alone', () => {
    const disabled = harness({ enabled: false })
    assert.equal(disabled.surface.listeners.size, 0)
    const app = harness()
    for (const overrides of [
        { deltaX: 0, deltaY: 100 }, { deltaX: 20, deltaY: 100 },
        { ctrlKey: true }, { metaKey: true }, { altKey: true }, { buttons: 1 },
        { target: new ElementAdapter(true) },
    ]) assert.equal(app.emit(overrides).defaultPrevented, false)
    const event = app.emit()
    assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true)
    assert.deepEqual(app.directions, [])
    app.unmount()
    assert.equal(app.surface.listeners.size, 0)
})

test('horizontal gestures require a margin and their inertial tail cannot skip panels', async () => {
    const app = harness()
    app.emit(); await flush(); assert.deepEqual(app.directions, [])
    app.advance(50); app.emit(); await flush(); assert.deepEqual(app.directions, [1])
    app.options.navigationKey = 'answer'; app.render()
    for (let i = 0; i < 20; i++) { app.advance(50); app.emit(); await flush() }
    assert.deepEqual(app.directions, [1])
    app.advance(wheel.WHEEL_GESTURE_IDLE_MS + 1); app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1, 1])
    app.unmount()
})

test('right wheel at a fork does nothing while left can return to the preceding screen', async () => {
    const app = harness({ canGoForward: false })
    for (let i = 0; i < 10; i++) { app.emit(); app.advance(50) }
    await flush(); assert.deepEqual(app.directions, [])
    app.emit({ deltaX: -100 }); app.advance(50); app.emit({ deltaX: -100 }); await flush()
    assert.deepEqual(app.directions, [-1])
    app.unmount()
})

test('busy screens and pending history restoration consume wheel events without repeated navigation', async () => {
    let resolve
    const app = harness({ busy: true, onNavigate: direction => {
        app.directions.push(direction)
        return new Promise(yes => { resolve = yes })
    } })
    app.emit(); app.advance(50); app.emit(); await flush(); assert.deepEqual(app.directions, [])
    app.options.busy = false; app.render(); app.advance(300)
    app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1])
    app.advance(1000); app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1])
    resolve(); await flush()
    app.emit(); app.advance(50); app.emit(); await flush(); assert.deepEqual(app.directions, [1])
    app.unmount()
})

test('Shift with a vertical wheel provides the same horizontal movement', async () => {
    const app = harness()
    app.emit({ deltaX: 0, deltaY: 3, deltaMode: 1, shiftKey: true })
    await flush(); assert.deepEqual(app.directions, [])
    for (let i = 0; i < 3; i++) { app.advance(50); app.emit({ deltaX: 0, deltaY: 3, deltaMode: 1, shiftKey: true }) }
    await flush(); assert.deepEqual(app.directions, [1])
    app.unmount()
})

test('changing the screen through a breadcrumb discards a partially accumulated wheel gesture', async () => {
    const app = harness()
    app.emit(); app.advance(50)
    app.options.navigationKey = 'different-screen'; app.render()
    app.emit(); await flush(); assert.deepEqual(app.directions, [])
    app.advance(300); app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1])
    app.unmount()
})

test('button navigation obeys the same fork, busy and end-of-route rules as the wheel', async () => {
    const app = harness({ canGoForward: false })
    await app.navigation.navigate(1)
    assert.deepEqual(app.directions, [])
    app.options.canGoForward = true; app.options.busy = true; app.render()
    await app.navigation.navigate(1)
    assert.deepEqual(app.directions, [])
    app.options.busy = false; app.render()
    await app.navigation.navigate(1)
    assert.deepEqual(app.directions, [1])
    app.options.canGoForward = false; app.options.canGoBack = false; app.render()
    await app.navigation.navigate(1); await app.navigation.navigate(-1)
    assert.deepEqual(app.directions, [1])
    app.unmount()
    app.options.canGoForward = true; app.render()
    await app.navigation.navigate(1)
    assert.deepEqual(app.directions, [1])
})

test('button clicks and wheel gestures share one pending restoration and suppress its inertial tail', async () => {
    let resolve
    const app = harness({ onNavigate: direction => {
        app.directions.push(direction)
        return new Promise(yes => { resolve = yes })
    } })
    const pending = app.navigation.navigate(1)
    app.render(); assert.equal(app.navigation.isNavigating, true)
    await app.navigation.navigate(1)
    app.advance(1000); app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1])
    resolve(); await pending
    app.render(); assert.equal(app.navigation.isNavigating, false)
    app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1])
    app.advance(300); app.emit(); app.advance(50); app.emit(); await flush()
    assert.deepEqual(app.directions, [1, 1])
    await app.navigation.navigate(1)
    assert.deepEqual(app.directions, [1, 1])
    resolve(); await flush()
    app.unmount()
})
