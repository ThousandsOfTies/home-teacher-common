const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { IDBFactory } = require('fake-indexeddb')

const source = ts.createSourceFile('indexedDB.ts', fs.readFileSync(path.join(__dirname,
  '../../src/utils/indexedDB.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const implementation = ts.transpileModule(source.statements.find(node =>
  ts.isFunctionDeclaration(node) && node.name.text === 'updateRequestUsageLog').getText(source), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function requestUsageHarness() {
  const factory = new IDBFactory()
  const db = await new Promise((resolve, reject) => {
    const open = factory.open('usage-test', 16)
    open.onupgradeneeded = () => {
      for (const name of ['settings', 'pdfFiles', 'gradingHistory']) open.result.createObjectStore(name, { keyPath: 'id' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  function client(openDB = async () => db) {
    const exports = {}
    vm.runInNewContext(implementation, { exports, openDB, SETTINGS_STORE_NAME: 'settings', Error, TypeError })
    return exports.updateRequestUsageLog
  }
  async function entry(storeName, id, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], value ? 'readwrite' : 'readonly')
      const store = tx.objectStore(storeName)
      const request = value ? store.put(value) : store.get(id)
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = tx.onerror = () => reject(tx.error)
    })
  }
  return { db, client, update: client(), entry }
}
module.exports = { requestUsageHarness }
