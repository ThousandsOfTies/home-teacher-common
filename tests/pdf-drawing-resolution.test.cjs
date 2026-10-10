const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { harness: zoomHarness } = require('../../drawing-common/tests/helpers/zoom-pan-harness.cjs')

test('pager fit and reset delegate to the same logical-paper command regardless of PDF resolution', () => {
    const file = path.join(__dirname, '../src/components/study/PDFPane.tsx')
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let fit, reset, click
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'fitPageToScreen') {
            fit = node.initializer.arguments[0]
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'resetZoom') reset = node.initializer
        if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'button'
            && node.attributes.properties.some(attr => attr.name?.getText(source) === 'title'
                && attr.initializer?.getText(source).includes("'pdfNavigation.fit'"))) {
            click = node.attributes.properties.find(attr => attr.name?.getText(source) === 'onClick').initializer.expression
        }
        ts.forEachChild(node, visit)
    }
    visit(source)
    assert.ok(fit && reset && click, 'the real pager, reset and fit command must be exercised')
    for (const splitMode of [false, true]) for (const hidden of [false, true]) {
        const width = hidden ? 842 : 600, height = hidden ? 595 : 800
        const app = zoomHarness({ width: 520, height: 380, pageWidth: width, pageHeight: height })
        const commands = vm.runInNewContext(ts.transpileModule(`const fitPageToScreen = ${fit.getText(source)};
            const commands = [${reset.getText(source)}, ${click.getText(source)}]`, {
            compilerOptions: { target: ts.ScriptTarget.ES2022 },
        }).outputText + '\ncommands', {
            containerRef: { current: app.pane }, canvasRef: { current: app.canvas },
            window: { innerHeight: 1000 }, splitMode, fitToScreen: app.view().fitToScreen,
        })
        assert.equal(commands[0], commands[1], 'pager fitting cannot maintain its own size calculation')
        for (const bitmapScale of [1, 3, 8]) for (const command of commands) {
            app.canvas.width = hidden ? 1 : width * bitmapScale
            app.canvas.height = hidden ? 1 : height * bitmapScale
            app.view().setZoom(3)
            command()
            const expected = splitMode ? 360 / height : Math.min(500 / width, 360 / height)
            assert.ok(Math.abs(app.view().zoom - expected) < 1e-10)
            assert.ok(Number.isFinite(app.view().panOffset.x) && Number.isFinite(app.view().panOffset.y))
        }
        app.dispose()
    }
})

test('PDF captures preserve page dimensions independently of viewport-only ink', () => {
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
