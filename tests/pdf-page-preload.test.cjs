const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const settle = () => new Promise(resolve => setImmediate(resolve))
function load(file, dependencies, globals) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, { exports, require: id => {
        assert.ok(id in dependencies, `Unexpected import ${id}`)
        return dependencies[id]
    }, ...globals })
    return exports
}

function harness({ idle = true, width = 600, height = 800, rotate = 0, hold = false } = {}) {
    const callbacks = new Map(), canvases = [], requests = [], renders = []
    let nextId = 0
    const schedule = callback => { const id = ++nextId; callbacks.set(id, callback); return id }
    const cancel = id => callbacks.delete(id)
    const window = { setTimeout: schedule, clearTimeout: cancel }
    if (idle) Object.assign(window, { requestIdleCallback: schedule, cancelIdleCallback: cancel })
    const document = { createElement(tag) {
        assert.equal(tag, 'canvas')
        const copies = []
        const canvas = { width: 300, height: 150, style: {}, copies,
            getContext: () => ({ drawImage: (...args) => copies.push(args) }) }
        canvases.push(canvas)
        return canvas
    } }
    const api = load('utils/pdfPagePreload.ts', { '../constants/pdf': { INITIAL_PDF_RENDER_SCALE: 1.5 } }, { window, document })
    const page = {
        rotate,
        getViewport({ scale, rotation }) { return {
            width: (rotation === 90 || rotation === 270 ? height : width) * scale,
            height: (rotation === 90 || rotation === 270 ? width : height) * scale,
        } },
        render({ canvasContext, viewport }) {
            let resolve, reject
            const task = { promise: new Promise((yes, no) => { resolve = yes; reject = no }),
                cancelled: false, cancel() { this.cancelled = true; reject(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })) },
                finish: () => resolve(), viewport, canvasContext }
            renders.push(task)
            if (!hold) resolve()
            return task
        },
    }
    const pdf = { numPages: 3, getPage: async number => { requests.push(number); return page } }
    return { api, pdf, page, window, document, callbacks, canvases, requests, renders,
        async idle() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback()); await settle() } }
}

test('only the requested hidden page renders after idle; the bitmap is reused once', async () => {
    const h = harness()
    h.api.schedulePDFPagePreload(h.pdf, 1)
    h.api.schedulePDFPagePreload(h.pdf, 1)
    assert.deepEqual(h.requests, [])
    assert.equal(h.callbacks.size, 1)
    await h.idle()
    assert.deepEqual(h.requests, [1])
    assert.equal(h.renders.length, 1)
    assert.equal(h.api.takePDFPagePreload(h.pdf, 2), undefined)
    const prepared = h.api.takePDFPagePreload(h.pdf, 1)
    assert.equal(prepared.canvas.width, 900)
    assert.equal(prepared.canvas.height, 1200)
    assert.equal(h.api.takePDFPagePreload(h.pdf, 1), undefined)
    h.api.releasePDFPageBitmap(prepared.canvas)
    assert.equal(prepared.canvas.width * prepared.canvas.height, 0)
})

test('same-page B bitmap is copied without PDF rendering or overstating its resolution', async () => {
    const h = harness({ idle: false })
    const source = h.document.createElement('canvas')
    source.width = 600; source.height = 800
    h.api.schedulePDFPagePreload(h.pdf, 1, { pageNum: 1, canvas: source,
        metrics: { pixelWidth: 600, pixelHeight: 800, layoutWidth: 600, layoutHeight: 800 } })
    await h.idle()
    assert.deepEqual(h.requests, [])
    assert.equal(h.renders.length, 0)
    const prepared = h.api.takePDFPagePreload(h.pdf, 1)
    assert.equal(prepared.canvas.width, 600)
    assert.equal(prepared.canvas.height, 800)
    assert.deepEqual(prepared.canvas.copies[0], [source, 0, 0, 600, 800])
    assert.equal(source.width, 600)
})

test('a large rotated page stays within the pixel budget and preserves logical geometry', async () => {
    const h = harness({ width: 5000, height: 4000, rotate: 90 })
    h.api.schedulePDFPagePreload(h.pdf, 2)
    await h.idle()
    const prepared = h.api.takePDFPagePreload(h.pdf, 2)
    assert.ok(prepared.canvas.width * prepared.canvas.height <= h.api.MAX_PRELOAD_PIXELS)
    assert.ok(Math.max(prepared.canvas.width, prepared.canvas.height) <= 2048)
    assert.equal(prepared.metrics.layoutWidth, 4000)
    assert.equal(prepared.metrics.layoutHeight, 5000)
})

test('foreground rendering cancels speculative chunks; replacement and close release buffers', async () => {
    const h = harness({ hold: true })
    const cancelFirst = h.api.schedulePDFPagePreload(h.pdf, 1)
    await h.idle()
    let continued = 0
    h.renders[0].onContinue(() => continued++)
    assert.equal(continued, 0)
    h.api.cancelPDFPagePreload(h.pdf)
    await settle()
    assert.equal(h.renders[0].cancelled, true)
    assert.equal(h.callbacks.size, 0)
    assert.equal(h.canvases[0].width, 0)
    h.api.schedulePDFPagePreload(h.pdf, 2)
    cancelFirst() // An old cleanup cannot cancel the new request.
    await h.idle()
    h.renders[1].onContinue(() => continued++)
    await h.idle()
    assert.equal(continued, 1)
    h.renders[1].finish(); await settle()
    const second = h.canvases[1]
    h.api.schedulePDFPagePreload(h.pdf, 3)
    assert.equal(second.width, 0)
    h.api.clearPDFPagePreload(h.pdf)
    await h.idle()
    assert.deepEqual(h.requests, [1, 2])
    assert.equal(h.api.takePDFPagePreload(h.pdf, 2), undefined)
})

test('closing while getPage is pending prevents stale allocation, and failures allow a later retry', async () => {
    const h = harness()
    let resolve
    h.pdf.getPage = () => new Promise(yes => { resolve = yes })
    h.api.schedulePDFPagePreload(h.pdf, 1)
    await h.idle()
    h.api.clearPDFPagePreload(h.pdf)
    resolve(h.page); await settle()
    assert.equal(h.canvases.length, 0)
    h.pdf.getPage = async () => { throw new Error('unreadable') }
    h.api.schedulePDFPagePreload(h.pdf, 1); await h.idle()
    assert.equal(h.api.takePDFPagePreload(h.pdf, 1), undefined)
    h.pdf.getPage = async () => h.page
    h.api.schedulePDFPagePreload(h.pdf, 1); await h.idle()
    assert.ok(h.api.takePDFPagePreload(h.pdf, 1))
    for (const number of [0, 4, 1.5, NaN]) h.api.schedulePDFPagePreload(h.pdf, number)
    assert.equal(h.callbacks.size, 0)
})

function canvasHarness(h, initial) {
    let cursor = 0
    const cells = [], effects = [], rendered = []
    const react = {
        useRef(initial) { const index = cursor++; cells[index] ??= { current: initial }; return cells[index] },
        useState(initial) { const index = cursor++; cells[index] ??= { value: initial }; return [cells[index].value,
            value => { cells[index].value = typeof value === 'function' ? value(cells[index].value) : value }] },
        useEffect(callback, deps) { const index = cursor++, previous = cells[index]
            if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
            effects.push(() => { previous?.cleanup?.(); cells[index] = { deps, cleanup: callback() } }) },
    }
    const component = load('components/study/components/PDFCanvas.tsx', {
        react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) }, '../../../utils/pdfPagePreload': h.api,
    }, { document: h.document }).default
    const props = { pdfDoc: h.pdf, pageNum: 2, renderScale: 1.5,
        canvasRef: { current: h.document.createElement('canvas') }, onPageRendered: metrics => rendered.push(metrics), ...initial }
    return { props, rendered, render(changes = {}) { Object.assign(props, changes); cursor = 0; component(props)
        for (const effect of effects.splice(0)) effect() }, unmount() { for (const cell of cells) cell?.cleanup?.() } }
}

test('B completes before preparing A, and the first A view displays the cache without another render', async () => {
    const h = harness({ hold: true }), b = canvasHarness(h, { preloadPageNum: 1 })
    b.render(); await settle()
    assert.deepEqual(h.requests, [2])
    assert.equal(h.callbacks.size, 0)
    h.renders[0].finish(); await settle(); b.render()
    await h.idle()
    assert.deepEqual(h.requests, [2, 1])
    h.renders[1].finish(); await settle()
    b.unmount()
    const a = canvasHarness(h, { pageNum: 1 })
    a.render(); await settle()
    assert.equal(a.rendered.length, 1)
    assert.equal(a.props.canvasRef.current.width, 900)
    assert.equal(h.renders.length, 2)
    assert.equal(h.api.takePDFPagePreload(h.pdf, 1), undefined)
})

test('a bounded A preview is shown immediately then upgraded; a blank B never copies its invisible PDF', async () => {
    const h = harness({ width: 2400, height: 3000, hold: true })
    h.api.schedulePDFPagePreload(h.pdf, 1); await h.idle()
    h.renders[0].finish(); await settle()
    const a = canvasHarness(h, { pageNum: 1 })
    a.render(); await settle()
    assert.equal(a.rendered.length, 1)
    assert.ok(a.props.canvasRef.current.width * a.props.canvasRef.current.height <= h.api.MAX_PRELOAD_PIXELS)
    h.renders[1].finish(); await settle()
    assert.equal(a.rendered.length, 2)
    assert.equal(a.props.canvasRef.current.width, 3600)
    a.unmount()
    const b = canvasHarness(h, { pageNum: 1, renderContent: false, preloadPageNum: 1 })
    b.render(); await settle(); b.render(); await h.idle()
    assert.equal(b.props.canvasRef.current.width, 1)
    assert.equal(h.renders.length, 3, 'CopiCopi A must render the PDF rather than copy its blank B pane')
    b.unmount(); await settle()
    assert.equal(h.renders[2].cancelled, true)
})

test('changing the hidden A target does not re-render B, and separate documents cannot share cached pages', async () => {
    const h = harness(), b = canvasHarness(h, { preloadPageNum: 1 })
    b.render(); await settle(); b.render(); await h.idle()
    const first = h.canvases.at(-1)
    b.render({ preloadPageNum: 3 }); await h.idle()
    assert.deepEqual(h.requests, [2, 1, 3])
    assert.equal(b.rendered.length, 1)
    assert.equal(first.width, 0)
    const otherDocument = { ...h.pdf }
    assert.equal(h.api.takePDFPagePreload(otherDocument, 3), undefined)
    assert.ok(h.api.takePDFPagePreload(h.pdf, 3))
    b.unmount()
})
