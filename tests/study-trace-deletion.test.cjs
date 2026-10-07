const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/utils/indexedDB.ts'), 'utf8')
const ast = ts.createSourceFile('indexedDB.ts', source, ts.ScriptTarget.Latest, true)
const names = ['deletePDFStudyTraceTree', 'restorePDFStudyTraceDeletion', 'getPDFStudyMarkerBranchIds',
    'deletePDFStudyMarkerBranch', 'restorePDFStudyMarkerDeletion']
const code = ts.transpileModule(ast.statements.filter(node =>
    ts.isFunctionDeclaration(node) && names.includes(node.name.text)).map(node => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

// Transaction adapter: requests run asynchronously, writes commit together or roll back together.
function storage(traces, { failDelete, markers = [] } = {}) {
    const asset = (id, kind) => ({ id: `${id}:${kind}`, traceId: id, blob: new Blob([`${id}-${kind}`]) })
    const stores = {
        pdfFiles: new Map([['book', { id: 'book', fileData: new Blob(['original-pdf']) }]]),
        pdfStudyTraces: new Map(traces.map(trace => [trace.id, structuredClone(trace)])),
        pdfStudyMarkers: new Map(markers.map(marker => [marker.id, structuredClone(marker)])),
        pdfStudyAssets: new Map([
            ...traces.flatMap(trace => [asset(trace.id, 'question'), asset(trace.id, 'drawing')]),
            ...markers.flatMap(marker => [marker.id, ...(marker.followUps ?? []).map(node => node.id)]
                .flatMap(id => ['question', 'drawing'].map(kind => ({
                    id: `${marker.id}:${id}:${kind}`, traceId: marker.id, blob: new Blob([`${id}-${kind}`]),
                })))),
        ].map(value => [value.id, value])),
    }
    const transactions = []
    const db = { transaction(storeNames, mode) {
        assert.equal(mode, 'readwrite')
        transactions.push(Array.from(storeNames))
        const working = Object.fromEntries(storeNames.map(name => [name, new Map(stores[name])]))
        let pending = 0, aborted = false
        const transaction = { error: null, abort() {
            if (aborted) return
            aborted = true
            queueMicrotask(() => transaction.onabort?.())
        } }
        const request = operation => {
            pending++
            const result = {}
            queueMicrotask(() => {
                try {
                    if (!aborted) {
                        result.result = operation()
                        result.onsuccess?.({ target: result })
                    }
                } catch (error) {
                    transaction.error = error
                    transaction.abort()
                } finally {
                    pending--
                    if (pending === 0 && !aborted) {
                        Object.entries(working).forEach(([name, values]) => { stores[name] = values })
                        transaction.oncomplete?.()
                    }
                }
            })
            return result
        }
        transaction.objectStore = name => {
            assert.ok(working[name], name)
            const values = working[name]
            return {
                get: key => request(() => structuredClone(values.get(key))),
                getKey: key => request(() => values.has(key) ? key : undefined),
                add: value => request(() => {
                    if (values.has(value.id)) throw new Error('ConstraintError: existing ID')
                    values.set(value.id, structuredClone(value))
                }),
                put: value => request(() => values.set(value.id, structuredClone(value))),
                delete: key => request(() => {
                    if (key === failDelete) throw new Error('simulated storage failure')
                    values.delete(key)
                }),
                index: field => ({ getAll: key => request(() =>
                    Array.from(values.values()).filter(value => value[field] === key).map(value => structuredClone(value))) }),
            }
        }
        return transaction
    } }
    const exports = {}
    vm.runInNewContext(code, { exports, messages: require('../src/i18n/locales/ja.json'),
        openDB: async () => db, IDBKeyRange: { only: value => value },
        STORE_NAME: 'pdfFiles', PDF_STUDY_TRACE_STORE_NAME: 'pdfStudyTraces', PDF_STUDY_ASSET_STORE_NAME: 'pdfStudyAssets',
        PDF_STUDY_MARKER_STORE_NAME: 'pdfStudyMarkers', studyAssetId: (traceId, nodeId, kind) => `${traceId}:${nodeId}:${kind}` })
    return { ...exports, stores, transactions }
}

function trace(id, parentTraceId, pdfId = 'book') {
    return { id, pdfId, parentTraceId, parentStepId: parentTraceId && 'teacher-answer', createdAt: 1234,
        regions: parentTraceId ? [] : [{ pageNumber: 5, x: .1, y: .2, width: .5, height: .2 }],
        steps: [{ id: 'question', type: 'answer', sourcePageNumbers: [5], answerTexts: [{ text: '最新の質問文' }] },
            { id: 'teacher-answer', type: 'grading', result: { overallComment: '先生の回答' }, sourcePageNumbers: [5] }],
        resultRegion: parentTraceId && { x: .2, y: .3, width: .4, height: .1 } }
}

test('deleting a mistaken PDF selection removes its entire tree and leaves other selections and the PDF alone', async () => {
    const store = storage([trace('root'), trace('child', 'root'), trace('grandchild', 'child'), trace('sibling'), trace('other', null, 'another-book')])
    const originalPDF = store.stores.pdfFiles.get('book')
    const deleted = await store.deletePDFStudyTraceTree('book', 'root')
    assert.deepEqual(Array.from(deleted.traces, value => value.id), ['root', 'child', 'grandchild'])
    assert.equal(deleted.assets.length, 6)
    assert.deepEqual(Array.from(store.stores.pdfStudyTraces.keys()), ['sibling', 'other'])
    assert.equal(store.stores.pdfStudyAssets.size, 4)
    assert.equal(store.stores.pdfFiles.get('book'), originalPDF)
    assert.deepEqual(store.transactions, [['pdfStudyTraces', 'pdfStudyAssets']])
})

test('a teacher-answer branch can be deleted and fully restored without removing its parent or another branch', async () => {
    const store = storage([trace('root'), trace('first', 'root'), trace('next', 'first'), trace('second', 'root')])
    const originalTraces = Array.from(store.stores.pdfStudyTraces.values())
    const deleted = await store.deletePDFStudyTraceTree('book', 'first')
    assert.deepEqual(Array.from(store.stores.pdfStudyTraces.keys()), ['root', 'second'])
    await store.restorePDFStudyTraceDeletion(deleted)
    for (const value of originalTraces) assert.deepEqual(store.stores.pdfStudyTraces.get(value.id), value)
    assert.equal(await store.stores.pdfStudyAssets.get('first:question').blob.text(), 'first-question')
    assert.equal(await store.stores.pdfStudyAssets.get('next:drawing').blob.text(), 'next-drawing')
})

test('a failed deletion rolls back both the traces and their images', async () => {
    const store = storage([trace('root'), trace('child', 'root')], { failDelete: 'child:drawing' })
    await assert.rejects(store.deletePDFStudyTraceTree('book', 'root'), /simulated storage failure/)
    assert.equal(store.stores.pdfStudyTraces.size, 2)
    assert.equal(store.stores.pdfStudyAssets.size, 4)
})

test('undo never overwrites a newer history record with the same ID', async () => {
    const store = storage([trace('root'), trace('child', 'root')])
    const deleted = await store.deletePDFStudyTraceTree('book', 'root')
    const newer = { ...trace('child'), createdAt: 9999 }
    store.stores.pdfStudyTraces.set('child', newer)
    await assert.rejects(store.restorePDFStudyTraceDeletion(deleted), /ConstraintError/)
    assert.equal(store.stores.pdfStudyTraces.get('child'), newer)
    assert.equal(store.stores.pdfStudyTraces.has('root'), false)
    assert.equal(store.stores.pdfStudyAssets.size, 0)
})

test('undo after the parent question or the PDF is removed does not create orphan records', async () => {
    for (const missing of ['parent', 'pdf']) {
        const store = storage([trace('root'), trace('child', 'root')])
        const deleted = await store.deletePDFStudyTraceTree('book', 'child')
        if (missing === 'parent') store.stores.pdfStudyTraces.delete('root')
        else store.stores.pdfFiles.clear()
        await assert.rejects(store.restorePDFStudyTraceDeletion(deleted), /見つかりません/)
        assert.equal(store.stores.pdfStudyTraces.has('child'), false)
        assert.equal(store.stores.pdfStudyAssets.has('child:question'), false)
    }
})

test('malformed undo data and another document ID cannot modify any history', async () => {
    const store = storage([trace('root')])
    await assert.rejects(store.deletePDFStudyTraceTree('another-book', 'root'), /削除できません/)
    await assert.rejects(store.restorePDFStudyTraceDeletion({ pdfId: 'another-book', traces: [trace('root')], assets: [] }), /不正/)
    assert.equal(store.stores.pdfStudyTraces.size, 1)
    assert.equal(store.stores.pdfStudyAssets.size, 2)
})

test('an old cyclic trace connection terminates and deletes each record once', async () => {
    const store = storage([trace('root', 'child'), trace('child', 'root')])
    const deleted = await store.deletePDFStudyTraceTree('book', 'root')
    assert.equal(deleted.traces.length, 2)
    assert.equal(store.stores.pdfStudyTraces.size, 0)
})

function marker(id = 'root') {
    return { id, pdfId: 'book', createdAt: 1234, regions: [{ pageNumber: 1, x: .1, y: .2, width: .7, height: .1 }],
        sourcePageNumbers: [1], answer: { strokes: [{ points: [[10, 20], [30, 40]] }], texts: [{ text: '解答' }] },
        grading: { result: { problems: [{ isCorrect: true }] }, modelName: 'test-model', responseTime: 1 },
        followUps: [
            { id: 'first', parentId: id, region: { x: .1, y: .2, width: .3, height: .05 }, answer: { texts: [{ text: '質問１' }] }, grading: { result: { overallComment: '回答１' } } },
            { id: 'next', parentId: 'first', region: { x: .2, y: .3, width: .4, height: .1 }, answer: { texts: [{ text: '再質問' }] } },
            { id: 'second', parentId: id, region: { x: .1, y: .7, width: .5, height: .1 }, answer: { texts: [{ text: '質問２' }] } },
        ] }
}

test('a PDF answer marker and its drawings, grading, follow-ups and images are fully restored', async () => {
    const store = storage([], { markers: [marker(), { ...marker('another'), followUps: [] }] })
    const original = store.stores.pdfStudyMarkers.get('root')
    const originalPDF = store.stores.pdfFiles.get('book')
    const removed = await store.deletePDFStudyMarkerBranch('book', 'root')
    assert.equal(store.stores.pdfStudyMarkers.has('root'), false)
    assert.equal(store.stores.pdfStudyMarkers.has('another'), true)
    assert.equal(removed.assets.length, 8)
    assert.deepEqual(store.transactions, [['pdfStudyMarkers', 'pdfStudyAssets']])
    await store.restorePDFStudyMarkerDeletion(removed)
    assert.deepEqual(store.stores.pdfStudyMarkers.get('root'), original)
    assert.equal(await store.stores.pdfStudyAssets.get('root:first:question').blob.text(), 'first-question')
    assert.equal(store.stores.pdfFiles.get('book'), originalPDF)
})

test('removing a graded follow-up leaves its parent and sibling, and undo preserves newer sibling edits', async () => {
    const store = storage([], { markers: [marker()] })
    const removed = await store.deletePDFStudyMarkerBranch('book', 'root', 'first')
    assert.deepEqual(Array.from(removed.removedNodeIds), ['first', 'next'])
    const remaining = store.stores.pdfStudyMarkers.get('root')
    assert.deepEqual(remaining.followUps.map(node => node.id), ['second'])
    assert.equal(store.stores.pdfStudyAssets.has('root:root:drawing'), true)
    assert.equal(store.stores.pdfStudyAssets.has('root:second:question'), true)
    assert.equal(store.stores.pdfStudyAssets.has('root:first:question'), false)
    remaining.followUps[0].answer.texts[0].text = '質問２の更新'
    remaining.grading.result.updated = true
    await store.restorePDFStudyMarkerDeletion(removed)
    const restored = store.stores.pdfStudyMarkers.get('root')
    assert.deepEqual(restored.followUps.map(node => node.id), ['first', 'next', 'second'])
    assert.equal(restored.followUps[2].answer.texts[0].text, '質問２の更新')
    assert.equal(restored.grading.result.updated, true)
    assert.equal(await store.stores.pdfStudyAssets.get('root:next:drawing').blob.text(), 'next-drawing')
})

test('a failed marker deletion or conflicting undo leaves the current marker and all images intact', async () => {
    const failure = storage([], { markers: [marker()], failDelete: 'root:next:drawing' })
    await assert.rejects(failure.deletePDFStudyMarkerBranch('book', 'root', 'first'), /storage failure/)
    assert.equal(failure.stores.pdfStudyMarkers.get('root').followUps.length, 3)
    assert.equal(failure.stores.pdfStudyAssets.size, 8)
    for (const nodeId of [undefined, 'first']) {
        const store = storage([], { markers: [marker()] })
        const removed = await store.deletePDFStudyMarkerBranch('book', 'root', nodeId)
        const newer = marker()
        store.stores.pdfStudyMarkers.set('root', newer)
        await assert.rejects(store.restorePDFStudyMarkerDeletion(removed))
        assert.equal(store.stores.pdfStudyMarkers.get('root'), newer)
        assert.equal(store.stores.pdfStudyAssets.has('root:first:question'), false)
    }
})

test('marker undo refuses a missing PDF, a removed parent, or data belonging to another PDF', async () => {
    for (const missing of ['pdf', 'parent']) {
        const store = storage([], { markers: [marker()] })
        const removed = await store.deletePDFStudyMarkerBranch('book', 'root', 'next')
        if (missing === 'pdf') store.stores.pdfFiles.clear()
        else store.stores.pdfStudyMarkers.get('root').followUps = store.stores.pdfStudyMarkers.get('root').followUps.filter(node => node.id !== 'first')
        await assert.rejects(store.restorePDFStudyMarkerDeletion(removed), /見つかりません/)
        assert.equal(store.stores.pdfStudyAssets.has('root:next:question'), false)
    }
    const store = storage([], { markers: [marker()] })
    await assert.rejects(store.deletePDFStudyMarkerBranch('other-book', 'root'))
    const removed = await store.deletePDFStudyMarkerBranch('book', 'root', 'first')
    await assert.rejects(store.restorePDFStudyMarkerDeletion({ ...removed, pdfId: 'other-book' }), /不正/)
})

test('play stays inside the selection and delete has a small gap at the upper-right with separate touch targets', () => {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/studyRegionControls.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, { exports })
    const epsilon = 1e-6 // Fractional icon sizes can differ by floating-point rounding at an edge.
    const viewport = { left: 0, top: 54, width: 320, height: 500 }
    for (const deleteIconSize of [exports.STUDY_REGION_DELETE_ICON_SIZE, exports.STUDY_REGION_UNDO_ICON_SIZE]) {
    for (const region of [
        { left: 60, top: 180, width: 200, height: 150 },
        { left: 60, top: 180, width: 200, height: 10 },
        { left: 60, top: 54, width: 200, height: 8 },
        { left: 0, top: 54, width: 10, height: 10 },
        { left: 290, top: 530, width: 30, height: 10 },
    ]) {
        const { open, remove, openIcon, visible } = exports.getStudyRegionControlPositions(region, viewport, deleteIconSize)
        assert.equal(visible, true)
        assert.ok(remove.x - open.x >= 48, 'transparent 44px touch targets have a 4px gap')
        assert.ok(open.x + 22 - openIcon.width >= Math.max(region.left, viewport.left))
        assert.ok(open.x + 22 <= Math.min(region.left + region.width, viewport.left + viewport.width))
        assert.ok(open.y - openIcon.height / 2 >= Math.max(region.top, viewport.top))
        assert.ok(open.y + openIcon.height / 2 <= Math.min(region.top + region.height, viewport.top + viewport.height))
        assert.ok(remove.x - 22 >= viewport.left - epsilon && remove.x - 22 + deleteIconSize <= viewport.left + viewport.width + epsilon)
        assert.ok(remove.y + 22 - deleteIconSize >= viewport.top - epsilon && remove.y + 22 <= viewport.top + viewport.height + epsilon)
    }
    }
    const short = exports.getStudyRegionControlPositions({ left: 60, top: 180, width: 200, height: 10 }, viewport)
    assert.equal(short.remove.x - 22, 262, 'the delete icon has 2px of clearance to the right of the frame')
    assert.equal(short.remove.y + 22, 178, 'the delete icon has 2px of clearance above the frame')
    assert.equal(short.open.x + 22, 256, 'play is inset 4px from the right edge')
    assert.equal(exports.getStudyRegionControlPositions({ left: 60, top: 900, width: 200, height: 20 }, viewport).visible, false)
})
