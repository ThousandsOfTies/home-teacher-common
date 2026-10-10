const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function harness(ios = true) {
    let cursor = 0, nextTimer = 0
    const cells = [], pendingEffects = [], timers = new Map()
    const react = {
        useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial } },
        useState(initial) {
            const i = cursor++; cells[i] ??= { value: initial }
            return [cells[i].value, value => { cells[i].value = typeof value === 'function' ? value(cells[i].value) : value }]
        },
        useEffect(callback, dependencies) {
            const i = cursor++, previous = cells[i]
            if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return
            previous?.cleanup?.()
            cells[i] = { dependencies }
            pendingEffects.push(() => { cells[i].cleanup = callback() })
        },
    }
    const exports = {}
    const filename = path.join(__dirname, '../src/hooks/pdf/usePDFDrawingResolution.ts')
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
        exports,
        require: id => id === 'react' ? react : { isIOSLikeDevice: () => ios },
        window: {
            devicePixelRatio: 2,
            setTimeout(callback, delay) { assert.equal(delay, 220); timers.set(++nextTimer, callback); return nextTimer },
            clearTimeout: id => timers.delete(id),
        },
    })
    return { ...exports, timers,
        render(paper, zoom, paused) {
            cursor = 0
            const result = exports.usePDFDrawingResolution(paper, zoom, paused)
            pendingEffects.splice(0).forEach(effect => effect())
            return result
        },
        settle() { const ready = [...timers.values()]; timers.clear(); ready.forEach(callback => callback()) },
        unmount() { cells.forEach(cell => cell.cleanup?.()) },
    }
}

test('PDF lines retain Retina detail when the PDF image uses a smaller rendering scale', () => {
    const { getPDFDrawingBitmapSize: size } = harness()
    const paper = { width: 600, height: 800 }
    const bitmap = size(paper, 0.5, 2, 7_000_000)
    assert.equal(bitmap.width, 1500)
    assert.equal(bitmap.height, 2000)
    assert.equal(paper.width, 600)
    assert.equal(paper.height, 800)
    assert.equal(size(paper, 1, 4, 7_000_000).width, bitmap.width)
})

test('zoomed drawing uses the available pixel budget beyond the PDF scale steps without exceeding iPad or desktop limits', () => {
    const { getPDFDrawingBitmapSize: size } = harness()
    const paper = { width: 600, height: 800 }
    const ipad = size(paper, 3, 2, 7_000_000)
    assert.ok(ipad.width > 1800, 'the old iPad PDF scale stops at 3, even though more drawing pixels fit')
    assert.ok(ipad.width * ipad.height <= 7_000_000)
    const desktop = size(paper, 4, 2, 16_000_000)
    assert.ok(desktop.width > 3000)
    assert.ok(desktop.width * desktop.height <= 16_000_000)
    const large = size({ width: 4000, height: 4000 }, 8, 2, 7_000_000)
    assert.ok(large.width * large.height <= 7_000_000)
})

test('pinch, pan and active strokes keep the bitmap stable until navigation and drawing have both ended', () => {
    const app = harness(), paper = { width: 300, height: 400 }
    const original = app.render(paper, 1, false)
    assert.equal(app.render(paper, 2, true).width, original.width)
    assert.equal(app.timers.size, 0)
    app.render(paper, 2, false)
    assert.equal(app.timers.size, 1)
    app.render(paper, 2, true)
    assert.equal(app.timers.size, 0, 'new input cancels an already scheduled bitmap resize')
    app.settle()
    assert.equal(app.render(paper, 2, true).width, original.width)
    app.render(paper, 2, false); app.settle()
    const refined = app.render(paper, 2, false)
    assert.equal(refined.width, 1500)
    assert.equal(refined.height, 2000)
    app.render(paper, 3, false); app.unmount()
    assert.equal(app.timers.size, 0)
})

test('a changed paper establishes its own geometry immediately instead of reusing the previous page bitmap', () => {
    const app = harness()
    assert.equal(app.render(null, 1, false), null)
    app.render({ width: 600, height: 800 }, 1, false)
    const landscape = app.render({ width: 800, height: 600 }, 1, true)
    assert.equal(landscape.width, 2000)
    assert.equal(landscape.height, 1500)
})

test('PDF captures keep their original dimensions while the display-only stroke bitmap becomes sharper', () => {
    const file = path.join(__dirname, '../src/components/study/PDFPane.tsx')
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let getter
    function visit(node) {
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'getCanvas') getter = node.initializer
        ts.forEachChild(node, visit)
    }
    visit(source); assert.ok(getter)
    for (const hidePdfBackground of [true, false]) {
        const drawing = { width: 2291, height: 3055 }, pdf = { width: hidePdfBackground ? 1 : 1800, height: hidePdfBackground ? 1 : 2400 }
        const drawn = [], output = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => drawn.push(args) }) }
        const getCanvas = vm.runInNewContext(ts.transpileModule('const run = ' + getter.getText(source), {
            compilerOptions: { target: ts.ScriptTarget.ES2022 },
        }).outputText + '\nrun', {
            hidePdfBackground, bitmapCanvasSize: { width: 1800, height: 2400 },
            canvasRef: { current: pdf }, containerRef: { current: { querySelector: () => drawing } },
            document: { createElement: () => output },
        })
        assert.equal(getCanvas(), output)
        assert.equal(output.width, 1800)
        assert.equal(output.height, 2400)
        assert.deepEqual(drawn.at(-1), [drawing, 0, 0, 1800, 2400])
        assert.equal(drawn.length, hidePdfBackground ? 1 : 2)
    }
})
