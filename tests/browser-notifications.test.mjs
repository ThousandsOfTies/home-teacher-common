import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/utils/browserNotifications.js', import.meta.url), 'utf8')
  .replace('export async function', 'async function');

function harness({ permission = 'granted', worker, desktopError } = {}) {
  const calls = [];
  class Notification {
    static permission = permission;
    constructor(title, options) {
      calls.push({ title, options });
      if (desktopError) throw desktopError;
      this.close = () => calls.push('closed');
      calls.push(this);
    }
  }
  const context = vm.createContext({ window: { Notification, focus: () => calls.push('focused') },
    navigator: { serviceWorker: worker }, Notification });
  const show = vm.runInContext(source + '\nshowBrowserNotification', context);
  return { show, calls };
}

test('mobile notifications use the active worker without calling the unsupported constructor', async () => {
  const sent = [];
  const h = harness({ desktopError: new TypeError('Use ServiceWorkerRegistration.showNotification'),
    worker: { getRegistration: async () => ({ active: {}, showNotification: async (...args) => sent.push(args) }) } });
  const options = { body: 'Time is up', tag: 'time-limit', data: { url: 'https://example.test/TutoTuto/manage.html' } };
  assert.equal(await h.show('TutoTuto', options), true);
  assert.deepEqual(sent, [['TutoTuto', options]]);
  assert.equal(h.calls.length, 0);
});

test('desktop notifications work without a worker and focus the page on click', async () => {
  const h = harness();
  assert.equal(await h.show('Time is up'), true);
  h.calls[1].onclick();
  assert.deepEqual(h.calls.slice(2), ['focused', 'closed']);
});

test('denied notifications do not call either notification API', async () => {
  const h = harness({ permission: 'denied', worker: { getRegistration: () => assert.fail('Worker must not be called') } });
  assert.equal(await h.show('Time is up'), false);
  assert.equal(h.calls.length, 0);
});

test('a worker failure can fall back to desktop, and total failure is reported to the caller', async () => {
  const error = new Error('Worker notification failed');
  const worker = { getRegistration: async () => ({ active: {}, showNotification: async () => { throw error; } }) };
  assert.equal(await harness({ worker }).show('Time is up'), true);
  const mobile = harness({ worker, desktopError: new TypeError('Unsupported constructor') });
  await assert.rejects(mobile.show('Time is up'), error);
});

test('the settings switch can enable notifications on mobile without calling the desktop constructor', async () => {
  const component = fs.readFileSync(new URL('../src/components/admin/AdminPanel.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AdminPanel.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'requestNotificationPermission') initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(initializer);
  const code = ts.transpileModule('const run = ' + initializer.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText.replace('import.meta.env.BASE_URL', "'/TutoTuto/'").replace(/export\s*\{\s*\};?/g, '');
  const sent = [], permissions = [], alerts = [];
  class Notification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor() { assert.fail('Mobile settings must not use new Notification'); }
  }
  const context = vm.createContext({ window: { Notification, location: { origin: 'https://example.test' },
    matchMedia: () => ({ matches: true }) }, navigator: { serviceWorker: { getRegistration: async () => ({ active: {},
    showNotification: async (title, options) => sent.push({ title, options }) }) } }, Notification, URL,
    APP_NAME: 'TutoTuto', t: key => key, setNotificationPermission: value => permissions.push(value),
    alert: message => alerts.push(message), console });
  vm.runInContext(source, context);
  const requestPermission = vm.runInContext(code + '\nrun', context);
  assert.equal(await requestPermission(), true);
  assert.deepEqual(permissions, ['granted']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].options.icon, 'https://example.test/TutoTuto/app.png');
  assert.equal(alerts.length, 0);
});
