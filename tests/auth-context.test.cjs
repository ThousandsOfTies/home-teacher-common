const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/contexts/AuthContext.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }
}).outputText;
const user = uid => ({ uid, email: uid + '@example.test', displayName: uid });
const snapshot = (exists = true) => ({ exists: () => exists, data: () => ({ isPremium: true }) });
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function mount({ getDoc = async () => snapshot(), setDoc = async () => {} } = {}) {
    const states = [], subscriptions = [];
    let effect, authCallback, authStops = 0;
    const react = {
        createContext: () => ({ Provider: () => null }),
        createElement: () => null,
        useState: initial => {
            const index = states.length;
            states.push(initial);
            return [initial, value => { states[index] = value; }];
        },
        useEffect: callback => { effect = callback; },
    };
    const modules = {
        react,
        'firebase/auth': { onAuthStateChanged: (_, callback) => {
            authCallback = callback;
            return () => { authStops++; };
        } },
        'firebase/firestore': {
            doc: (_, __, uid) => uid, getDoc, setDoc,
            onSnapshot: (uid, next, error) => {
                const subscription = { uid, next, error, stops: 0 };
                subscriptions.push(subscription);
                return () => { subscription.stops++; };
            },
        },
        '../lib/firebase': { auth: {}, db: {} },
    };
    const exports = {};
    vm.runInNewContext(compiled, {
        exports, require: id => {
            assert.ok(modules[id], 'Unexpected import: ' + id);
            return modules[id];
        }, console: { error() {} },
    });
    exports.AuthProvider({ children: null });
    const cleanup = effect();
    return { states, subscriptions, emit: value => authCallback(value), cleanup, authStops: () => authStops };
}

test('logout, account switch and unmount unsubscribe and ignore queued old snapshots', async () => {
    const app = mount();
    await app.emit(user('A'));
    const first = app.subscriptions[0];
    first.next(snapshot());
    assert.equal(app.states[1].uid, 'A');
    await app.emit(user('B'));
    assert.equal(first.stops, 1);
    first.next(snapshot());
    assert.equal(app.states[1], null);
    const second = app.subscriptions[1];
    second.next(snapshot());
    assert.equal(app.states[1].uid, 'B');
    await app.emit(null);
    assert.equal(second.stops, 1);
    second.next(snapshot());
    assert.equal(app.states[1], null);
    assert.equal(app.states[2], false);
    await app.emit(user('C'));
    app.cleanup();
    assert.equal(app.subscriptions[2].stops, 1);
    assert.equal(app.authStops(), 1);
});

test('late getDoc after logout never creates a profile or installs a listener', async () => {
    const pending = deferred();
    let writes = 0;
    const app = mount({ getDoc: () => pending.promise, setDoc: async () => { writes++; } });
    const login = app.emit(user('A'));
    await app.emit(null);
    pending.resolve(snapshot(false));
    await login;
    assert.equal(writes, 0);
    assert.equal(app.subscriptions.length, 0);
    assert.equal(app.states[1], null);
});

test('late profile creation after unmount never installs a listener', async () => {
    const pending = deferred();
    const app = mount({ getDoc: async () => snapshot(false), setDoc: () => pending.promise });
    const login = app.emit(user('A'));
    await Promise.resolve();
    app.cleanup();
    pending.resolve();
    await login;
    assert.equal(app.subscriptions.length, 0);
});

test('out-of-order account initialization leaves only the current account subscribed', async () => {
    const pending = deferred();
    const app = mount({ getDoc: uid => uid === 'A' ? pending.promise : Promise.resolve(snapshot()) });
    const oldLogin = app.emit(user('A'));
    await app.emit(user('B'));
    pending.resolve(snapshot());
    await oldLogin;
    assert.deepEqual(app.subscriptions.map(s => s.uid), ['B']);
    app.subscriptions[0].next(snapshot());
    assert.equal(app.states[1].uid, 'B');
});

test('initialization and subscription errors release loading and clear user data', async () => {
    const failed = mount({ getDoc: async () => { throw new Error('offline'); } });
    await failed.emit(user('A'));
    assert.equal(failed.states[2], false);
    const app = mount();
    await app.emit(user('A'));
    app.subscriptions[0].next(snapshot());
    app.subscriptions[0].error(new Error('permission-denied'));
    assert.equal(app.states[1], null);
    assert.equal(app.states[2], false);
});
