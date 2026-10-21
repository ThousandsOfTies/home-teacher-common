const test = require('node:test')
const assert = require('node:assert/strict')
const { requestUsageHarness } = require('./helpers/requestUsageHarness.cjs')

test('monthly pruning changes only the selected usage log, preserving settings, PDFs and results', async () => {
  const h = await requestUsageHarness()
  await h.entry('settings', null, { id: 'app-settings', isPremium: true })
  await h.entry('settings', null, { id: 'requestUsage:another-feature', timestamps: [1] })
  await h.entry('settings', null, { id: 'requestUsage:ai', timestamps: [99, 100, 150, 199, 200] })
  await h.entry('pdfFiles', null, { id: 'book', drawings: { 1: 'saved handwriting' } })
  await h.entry('gradingHistory', null, { id: 'answer', timestamp: 1, feedback: 'saved answer' })
  assert.equal((await h.update('ai', 100, 200)).count, 3)
  assert.deepEqual((await h.entry('settings', 'requestUsage:ai')).timestamps, [100, 150, 199])
  assert.equal((await h.entry('settings', 'app-settings')).isPremium, true)
  assert.deepEqual((await h.entry('settings', 'requestUsage:another-feature')).timestamps, [1])
  assert.equal((await h.entry('pdfFiles', 'book')).drawings[1], 'saved handwriting')
  assert.equal((await h.entry('gradingHistory', 'answer')).feedback, 'saved answer')
})

test('concurrent callers cannot spend more than the allowance, even at identical timestamps', async () => {
  const h = await requestUsageHarness(), otherTab = h.client()
  const results = await Promise.all(Array.from({ length: 120 }, (_, i) =>
    (i % 2 ? h.update : otherTab)('ai', 100, 200, { timestamp: 150, limit: 100 })))
  assert.equal(results.filter(result => result.recorded).length, 100)
  assert.equal((await h.update('ai', 100, 200)).count, 100)
  assert.equal((await h.entry('settings', 'requestUsage:ai')).timestamps.length, 100)
})

test('counting and recording completed responses preserve other months until cleanup is explicitly requested', async () => {
  const h = await requestUsageHarness()
  await h.entry('settings', null, { id: 'requestUsage:ai', timestamps: [99, 100, 150, 200] })
  assert.equal((await h.update('ai', 100, 200, undefined, { prune: false })).count, 2)
  assert.deepEqual((await h.entry('settings', 'requestUsage:ai')).timestamps, [99, 100, 150, 200])
  assert.equal((await h.update('ai', 100, 200, { timestamp: 170 }, { prune: false })).count, 3)
  assert.deepEqual((await h.entry('settings', 'requestUsage:ai')).timestamps, [99, 100, 150, 200, 170])
  assert.equal((await h.update('ai', 100, 200, undefined, { prune: true })).count, 3)
  assert.deepEqual((await h.entry('settings', 'requestUsage:ai')).timestamps, [100, 150, 170])
})

test('invalid or failed storage never reports that a request was recorded', async () => {
  const h = await requestUsageHarness()
  await h.entry('settings', null, { id: 'requestUsage:ai', timestamps: ['invalid'] })
  await assert.rejects(h.update('ai', 100, 200, { timestamp: 150, limit: 100 }))
  assert.deepEqual((await h.entry('settings', 'requestUsage:ai')).timestamps, ['invalid'])
  await assert.rejects(h.client(async () => { throw new Error('storage unavailable') })('ai', 100, 200))
  for (const args of [['ai', 200, 100], ['ai', 100, 200, { timestamp: 200, limit: 100 }],
    ['ai', 100, 200, { timestamp: 150, limit: -1 }]]) await assert.rejects(h.update(...args))
})
