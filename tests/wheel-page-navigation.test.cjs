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

const { harness, ElementAdapter } = require('./helpers/pdf-page-navigation-harness.cjs')

test('drag/touch requests use the wheel transition even with wheel detection disabled', async () => {
    const app = harness({ wheelEnabled: false })
    assert.equal(app.surface.listeners.size, 0)
    assert.equal(app.render().turnPage(1, -150), true)
    assert.equal(app.render().turnPage(-1, 150), false)
    assert.equal(app.snapshotRequests.length, 1)
    assert.equal(app.render().offset, -150)
    assert.deepEqual(app.pages, [])
    await new Promise(setImmediate)
    assert.equal(app.render().covered, true)
    app.frame(); app.advance(310)
    assert.deepEqual(app.pages, [3])
    assert.equal(app.render().turnPage(1), false)
    app.render().onPageRendered(3)
    app.frame(); app.frame(); app.render()
    assert.equal(app.clone.disposed, 1)
    app.unmount()
})

test('all page-turn inputs share bounds, readiness and drawing guards', () => {
    for (const [options, direction] of [
        [{ enabled: false }, 1], [{ ready: false }, 1], [{ busy: true }, 1],
        [{ pageNum: 1 }, -1], [{ pageNum: 10 }, 1], [{ pdfDoc: null }, 1],
    ]) {
        const app = harness(options)
        assert.equal(app.render().turnPage(direction), false)
        assert.equal(app.snapshotRequests.length, 0)
        assert.deepEqual(app.pages, [])
        app.unmount()
    }
    const dragging = harness({ gesturing: true })
    assert.equal(dragging.emit().defaultPrevented, false)
    assert.equal(dragging.render().turnPage(1, -150), true, 'a drag may complete while its React flag is still active')
    dragging.unmount()
})

test('a final unrendered gesture supplies its current zoom and pan to the shared slide', async () => {
    const app = harness({ getViewport: () => ({ zoom: 1.5, panOffset: { x: 30, y: 60 } }) })
    app.render().turnPage(1, -100)
    await new Promise(setImmediate)
    assert.equal(app.clone.style.transform, 'translate(30px, -40px) scale(1.5)')
    app.unmount()
})

test('blank drawing pages retain immediate selection and still reject overlapping turns', () => {
    const app = harness({ wheelEnabled: false, animate: false })
    assert.equal(app.render().turnPage(1, -150), true)
    assert.deepEqual(app.pages, [3])
    assert.equal(app.snapshotRequests.length, 0)
    assert.equal(app.render().offset, 0)
    assert.equal(app.render().turnPage(1), false)
    app.render().onPageRendered(3)
    app.frame(); app.frame(); app.render()
    assert.equal(app.render().turnPage(-1), true)
    assert.deepEqual(app.pages, [3, 2])
    app.unmount()
})

test('switching documents cancels a touch slide while wheel detection is disabled', async () => {
    let resolve
    const app = harness({ wheelEnabled: false, snapshot: () => new Promise(yes => { resolve = yes }) })
    app.render().turnPage(1)
    app.options.pdfDoc = {}
    app.render()
    resolve({ layer: app.clone, width: 600, height: 800, left: 0, top: 820 })
    await new Promise(setImmediate)
    app.frame(); app.advance(9000)
    assert.deepEqual(app.pages, [])
    assert.equal(app.clone.disposed, 1)
    app.unmount()
})

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
    assert.equal(app.views[0].paperSize.width, 1200)
    assert.equal(app.views[0].paperSize.height, 600)
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
