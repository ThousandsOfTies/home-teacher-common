const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function harness(adapters = {}) {
    let cursor = 0, now = 0, timerId = 0, pdfId = 'book'
    const cells = [], timers = new Map(), deleted = [], restored = []
    const react = {
        useRef(value) { const index = cursor++; cells[index] ??= { current: value }; return cells[index] },
        useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => { cells[index] = next }] },
        useEffect(callback, deps) {
            const index = cursor++, previous = cells[index]
            if (previous && deps.every((value, position) => value === previous.deps[position])) return
            previous?.cleanup?.()
            cells[index] = { deps, cleanup: callback() }
        },
    }
    const snapshot = id => ({ pdfId, traces: [{ id }], assets: [] })
    const exports = {}
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/hooks/useStudyTraceUndo.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    vm.runInNewContext(code, { exports,
        require: () => react,
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, time: now + delay }); return id },
        clearTimeout(id) { timers.delete(id) },
    })
    function render() {
        cursor = 0
        return exports.useStudyTraceUndo(pdfId, {
            remove: async id => { deleted.push(id); return adapters.remove ? adapters.remove(id) : snapshot(id) },
            restore: async value => { if (adapters.restore) await adapters.restore(value); restored.push(value.traces[0].id) },
        })
    }
    return { render, deleted, restored, timers,
        tick(ms) { now += ms; for (const [id, timer] of timers) if (timer.time <= now) { timers.delete(id); timer.callback() } },
        switchPDF(id) { pdfId = id; return render() },
        unmount() { for (const value of cells) value?.cleanup?.() },
    }
}

test('undo appears only after a successful deletion and expires after ten seconds', async () => {
    const state = harness()
    assert.equal(state.render().undoAvailable, false)
    assert.equal(state.render().undoSnapshot, null)
    await state.render().deleteTrace('first')
    assert.equal(state.render().undoAvailable, true)
    assert.equal(state.render().undoSnapshot.traces[0].id, 'first')
    state.tick(9999)
    assert.equal(state.render().undoAvailable, true)
    state.tick(1)
    assert.equal(state.render().undoAvailable, false)
    assert.equal(state.render().undoSnapshot, null)
    assert.equal(await state.render().undoDelete(), null)
})

test('successive deletions extend the time and undo from the latest selection', async () => {
    const state = harness()
    await state.render().deleteTrace('first')
    state.tick(9000)
    await state.render().deleteTrace('second')
    assert.equal(state.render().undoSnapshot.traces[0].id, 'second')
    state.tick(9000)
    assert.equal(state.render().undoAvailable, true)
    await state.render().undoDelete()
    assert.deepEqual(state.restored, ['second'])
    assert.equal(state.render().undoAvailable, true)
    assert.equal(state.render().undoSnapshot.traces[0].id, 'first')
    await state.render().undoDelete()
    assert.deepEqual(state.restored, ['second', 'first'])
    assert.equal(state.render().undoAvailable, false)
    assert.equal(state.render().undoSnapshot, null)
    assert.equal(state.timers.size, 0)
})

test('a slow restore cannot lose the snapshot to timeout; a failure remains retryable', async () => {
    let finish, fail = true
    const state = harness({ restore: () => new Promise((resolve, reject) => { finish = () => fail ? reject(new Error('storage busy')) : resolve() }) })
    await state.render().deleteTrace('first')
    const first = state.render().undoDelete()
    state.tick(20000)
    assert.equal(state.render().busy, true)
    assert.equal(state.render().undoAvailable, true)
    finish()
    await assert.rejects(first, /storage busy/)
    assert.equal(state.render().undoSnapshot.traces[0].id, 'first')
    fail = false
    const retry = state.render().undoDelete()
    finish()
    await retry
    assert.equal(state.render().undoAvailable, false)
})

test('double taps cannot delete or restore twice during a pending save', async () => {
    let finish
    const state = harness()
    const first = state.render().deleteTrace('first', () => new Promise(resolve => { finish = resolve }))
    assert.equal(await state.render().deleteTrace('first'), null)
    assert.equal(await state.render().undoDelete(), null)
    finish()
    await first
    assert.deepEqual(state.deleted, ['first'])
})

test('another PDF and unmount discard the old undo and ignore late completions', async () => {
    let finish
    const state = harness({ remove: () => new Promise(resolve => { finish = () => resolve({ pdfId: 'book', traces: [{ id: 'first' }], assets: [] }) }) })
    const pending = state.render().deleteTrace('first')
    await Promise.resolve()
    state.switchPDF('another-book')
    finish()
    assert.equal(await pending, null)
    assert.equal(state.render().undoAvailable, false)
    assert.equal(state.render().busy, false)
    assert.equal(state.render().undoSnapshot, null)
    assert.equal(state.timers.size, 0)
    state.unmount()
    assert.equal(state.timers.size, 0)
})
