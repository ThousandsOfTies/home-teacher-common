const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

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
