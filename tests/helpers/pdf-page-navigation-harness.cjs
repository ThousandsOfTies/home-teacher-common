const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, modules = {}, globals = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../src', file), 'utf8'), {
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

// Exercise the actual hook with a deterministic clock and DOM event surface.
// No microphone, real browser, PDF data or network service is required.
class ElementAdapter {
    constructor(editable = false) { this.editable = editable }
    closest() { return this.editable ? this : null }
}
function harness({ enabled = true, left = 0, right = 800, snapshot, surface, height = 1000, ...overrides } = {}) {
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
    const hook = load('hooks/pdf/usePDFPageNavigation.ts', {
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
        clientWidth: right - left, clientHeight: height,
        getBoundingClientRect: () => ({ left, right, top: 0, bottom: height, width: right - left, height }),
    }
    const options = {
        enabled, containerRef: { current: pane }, layerRef: { current: mainLayer }, eventTargetRef: { current: surface },
        pdfDoc: {}, pageNum: 2, numPages: 10, canvasSize: { width: 600, height: 800 },
        renderScale: 1, zoom: 1, panOffset: { x: 100, y: 100 }, splitMode: false, ready: true, busy: false,
        onPageChange: page => { pages.push(page); options.pageNum = page },
        onViewportChange: (zoom, pan, paperSize) => views.push({ zoom, pan, paperSize }),
        ...overrides,
    }
    let result
    const render = () => {
        cursor = 0; effects = []; layoutEffects = []
        result = hook.usePDFPageNavigation(options)
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


module.exports = { harness, ElementAdapter }
