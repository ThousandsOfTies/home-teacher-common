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

function settingsHarness({ permission = 'granted', requestResult = 'granted', workerError,
  stalePermission = false, supported = true, standalone = true } = {}) {
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
  const sent = [], permissions = [], messages = [], errors = [], pending = [], permissionRequests = [];
  class Notification {
    static permission = permission;
    static requestPermission = async () => {
      permissionRequests.push(true);
      if (!stalePermission) Notification.permission = requestResult;
      return requestResult;
    };
    constructor() { throw new TypeError('Mobile notification constructor is unsupported'); }
  }
  const context = vm.createContext({ window: { ...(supported ? { Notification } : {}),
    navigator: { standalone }, location: { origin: 'https://example.test' },
    matchMedia: () => ({ matches: standalone }) }, document: { referrer: '' },
    navigator: { serviceWorker: { getRegistration: async () => ({ active: {},
      showNotification: async (title, options) => { if (workerError) throw workerError; sent.push({ title, options }); }
    }) } }, Notification, URL,
    APP_NAME: 'TutoTuto', t: key => key, setNotificationPermission: value => permissions.push(value),
    setNotificationTestMessage: value => messages.push(value), setNotificationTestError: value => errors.push(value),
    setNotificationTestPending: value => pending.push(value), console: { error() {} } });
  vm.runInContext(source, context);
  return { run: vm.runInContext(code + '\nrun', context), sent, permissions, messages, errors, pending, permissionRequests };
}

test('the settings switch tests an existing mobile permission without requesting it again', async () => {
  const h = settingsHarness();
  assert.equal(await h.run(), true);
  assert.deepEqual(h.permissions, ['granted']);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].options.icon, 'https://example.test/TutoTuto/app.png');
  assert.equal(h.sent[0].options.body, 'notifications.testBody');
  assert.deepEqual(h.permissionRequests, []);
  assert.deepEqual(h.messages, [null, 'testSent']);
  assert.deepEqual(h.pending, [true, false]);
});

test('the settings switch cannot enable notifications after a silent false delivery result', async () => {
  const h = settingsHarness({ permission: 'default', stalePermission: true });
  assert.equal(await h.run(), false);
  assert.deepEqual(h.permissions, ['granted', 'default']);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.messages, [null, 'testFailed']);
  assert.deepEqual(h.pending, [true, false]);
});

test('an existing denial explains how to recover instead of silently leaving the switch off', async () => {
  const h = settingsHarness({ permission: 'denied' });
  assert.equal(await h.run(), false);
  assert.deepEqual(h.permissions, ['denied']);
  assert.deepEqual(h.messages, [null, 'permissionDenied']);
  assert.deepEqual(h.permissionRequests, []);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.pending, [true, false]);
});

test('an undecided permission prompts directly and sends a test only after permission is granted', async () => {
  const h = settingsHarness({ permission: 'default' });
  assert.equal(await h.run(), true);
  assert.deepEqual(h.permissionRequests, [true]);
  assert.deepEqual(h.permissions, ['granted']);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.messages, [null, 'testSent']);
});

test('dismissing or denying the permission prompt never reports a notification as sent', async () => {
  for (const result of ['default', 'denied']) {
    const h = settingsHarness({ permission: 'default', requestResult: result });
    assert.equal(await h.run(), false);
    assert.deepEqual(h.sent, []);
    assert.deepEqual(h.messages, [null, result === 'denied' ? 'permissionDenied' : 'permissionNotGranted']);
    assert.deepEqual(h.pending, [true, false]);
  }
});

test('a failed mobile delivery leaves the switch off and exposes the actual failure for diagnosis', async () => {
  const h = settingsHarness({ workerError: new Error('Notification service is unavailable') });
  assert.equal(await h.run(), false);
  assert.deepEqual(h.messages, [null, 'testFailed']);
  assert.match(h.errors.at(-1), /Notification service is unavailable/);
  assert.deepEqual(h.pending, [true, false]);
});

test('unsupported browsing modes explain installation requirements without calling notification APIs', async () => {
  for (const standalone of [true, false]) {
    const h = settingsHarness({ supported: false, standalone });
    assert.equal(await h.run(), false);
    assert.deepEqual(h.messages, [null, standalone ? 'unsupported' : 'install']);
    assert.deepEqual(h.permissionRequests, []);
    assert.deepEqual(h.sent, []);
    assert.deepEqual(h.pending, [true, false]);
  }
});
