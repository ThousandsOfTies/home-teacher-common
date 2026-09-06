import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const output = path.resolve(process.argv[2] ?? 'dist')
const report = JSON.parse(fs.readFileSync(path.join(output, 'deferred-assets.json'), 'utf8'))
const sw = fs.readFileSync(path.join(output, 'sw.js'), 'utf8')
assert.equal(report.roots.length, 3, 'Editor, image-to-PDF and HEIC must each have an async chunk')
for (const name of report.roots) assert.ok(!report.initial.includes(name), name + ' loaded eagerly')
for (const name of report.initial) assert.ok(sw.includes(name), name + ' missing from precache')
for (const name of report.deferred) {
  assert.ok(fs.existsSync(path.join(output, name)), name + ' missing from build')
  assert.ok(!sw.includes(name), name + ' should load on demand')
}
assert.ok(sw.includes('on-demand-assets-v1'), 'Runtime cache missing')
console.log('Verified initial assets, deferred dependencies and service worker cache separation.')
