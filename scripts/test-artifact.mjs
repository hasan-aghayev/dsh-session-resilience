import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';
import { attachConnection, getConnectionState, reconnectAndWaitForConnected, subscribeToConnection } from '../src/client/connection-control.js';
import { fetchWithTimeout, singleFlight } from '../src/client/request.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out after ${timeoutMs} ms while waiting for an explicit state change.`);
}

function snapshotStore(initial) {
  let value = initial;
  return {
    getSnapshot: () => value,
    subscribe: () => () => {},
    set: async (next) => { value = { ...value, ...next }; },
    update: async (next) => { value = { ...value, ...next }; },
    unset: async () => {},
  };
}

test('published manifest and host artifacts expose the standalone package', async () => {
  const manifest = await readJson(join(root, 'package.json'));
  const host = await readFile(join(root, 'lib/index.js'), 'utf8');
  assert.equal(manifest.name, 'dsh-session-resilience');
  assert.equal(manifest.version, '0.1.12');
  assert.equal(manifest.engines.dsh, '>=0.1.0-rc.7 <0.2.0 || >=0.1.7-alpha.1 <0.1.8 || 0.2.0-rc.2 || ^0.2.0');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal((await readFile(join(root, 'cordis.patch.yml'), 'utf8')).includes('dsh-session-resilience'), true);
  assert.equal(host.includes('restartResumeWindowMs: 300 * 1e3'), true);
  for (const marker of [
    'function isLoopbackRequest',
    'invalid restart request id',
    'restartRequestId',
    'request body too large',
    'cannot prepare restart handoff',
    'bridgeRouteDisposers',
    'marker.newInstanceId !== INSTANCE_ID',
  ]) {
    assert.equal(host.includes(marker), true, `missing production marker: ${marker}`);
  }
});

test('client requests time out and concurrent status checks share one request', async () => {
  let attempts = 0;
  const fetcher = (_input, { signal }) => {
    attempts += 1;
    if (attempts > 1) return Promise.resolve({ ok: true });
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };

  await assert.rejects(fetchWithTimeout('/dsh-restart/status', {}, 10, fetcher), { name: 'AbortError' });
  assert.equal((await fetchWithTimeout('/dsh-restart/status', {}, 1_000, fetcher)).ok, true);
  assert.equal(attempts, 2);

  let calls = 0;
  const read = singleFlight(() => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('local host is restarting')) : Promise.resolve('ready');
  });
  const first = read();
  const concurrent = read();
  assert.equal(first, concurrent);
  await Promise.resolve();
  assert.equal(calls, 1);
  await assert.rejects(first, /local host is restarting/);
  const next = read();
  assert.notEqual(next, first);
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(await next, 'ready');
});

test('restart reconnects the DSH connection and waits for it to be ready', async () => {
  let state = 'connected';
  let reconnects = 0;
  const listeners = new Set();
  const connection = {
    reconnect() {
      reconnects += 1;
      state = 'connecting';
      for (const listener of listeners) listener();
      setTimeout(() => {
        state = 'connected';
        for (const listener of listeners) listener();
      }, 0);
    },
    state: {
      getSnapshot: () => state,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };

  const detach = attachConnection(connection);
  let stateChanges = 0;
  const unsubscribe = subscribeToConnection(() => { stateChanges += 1; });
  try {
    assert.equal(getConnectionState(), 'connected');
    await reconnectAndWaitForConnected(1_000);
    assert.equal(reconnects, 1);
    assert.equal(state, 'connected');
    assert.equal(stateChanges, 2);
  } finally {
    unsubscribe();
    detach();
  }
  assert.equal(getConnectionState(), undefined);
  await assert.rejects(reconnectAndWaitForConnected(1_000), /DSH connection service is unavailable/);
});

test('browser restart controls reconnect in place without navigating the current page', async () => {
  const client = await readFile(join(root, 'lib/client.js'), 'utf8');
  const host = await readFile(join(root, 'lib/index.js'), 'utf8');
  assert.match(client, /waitForReplacementHost/);
  assert.match(client, /ACTION_REQUEST_TIMEOUT_MS = 15e3/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /reconnectAndWaitForConnected/);
  assert.match(client, /createRestartRequestId/);
  assert.match(client, /status\.restartRequestId === restartRequestId/);
  assert.match(client, /DSH did not accept the action/);
  assert.doesNotMatch(client, /navigator\.sendBeacon/);
  assert.doesNotMatch(client, /STATUS_REFRESH_INTERVAL_MS/);
  assert.match(client, /reconnecting the DSH page/);
  assert.doesNotMatch(client, /form\.target = "_self"/);
  assert.doesNotMatch(client, /window\.location\.(?:assign|replace)\(/);
  assert.doesNotMatch(host, /function restartDocument|window\.location\.replace\(launch\.href\)/);
  assert.match(host, /path: "\/dsh-restart\/restart"[\s\S]*?json\(res, 200, result\)/);
});

test('published client registers the settings card and sidebar controls', async () => {
  let loaderDefinition;
  let actionCount = 0;
  let statusReads = 0;
  let actionRequestId;
  let tokenExchanged = false;
  let reconnectCount = 0;
  let formCount = 0;
  const context = vm.createContext({
    window: {
      clearInterval() {},
      setInterval() { throw new Error('restart controls must not poll the status route'); },
      setTimeout,
      location: {
        href: 'http://127.0.0.1:3080/',
        protocol: 'http:',
        host: '127.0.0.1:3080',
      },
      __ModuleLoader__: {
        load(definition) { loaderDefinition = definition; },
      },
    },
    navigator: {},
    fetch: async (input, init) => {
      if (String(input).startsWith('/dsh-restart/restart?')) {
        const endpoint = new URL(String(input), 'http://127.0.0.1:3080/');
        assert.equal(init.method, 'POST');
        assert.equal(init.credentials, 'omit');
        assert.equal(init.headers.accept, 'application/json');
        actionRequestId = endpoint.searchParams.get('requestId');
        assert.match(actionRequestId, /^[0-9a-f]{32}$/);
        actionCount += 1;
        return { ok: true, json: async () => ({ ok: true, requestId: actionRequestId }) };
      }
      if (String(input) === '/dsh-restart/status') {
        statusReads += 1;
        assert.equal(actionCount, 1, 'the restart request must be accepted before status polling begins');
        return { ok: true, json: async () => ({
          ok: true,
          instanceId: 'new',
          restartRequestId: actionRequestId,
          launchUrl: 'http://127.0.0.1:3080/?token=fresh',
        }) };
      }
      assert.equal(String(input), 'http://127.0.0.1:3080/?token=fresh');
      tokenExchanged = true;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    },
    Blob,
    crypto: { getRandomValues: (bytes) => { bytes.fill(26); return bytes; } },
    URL,
    AbortController,
    console,
    setTimeout,
    clearTimeout,
  });
  const source = await readFile(join(root, 'lib/client.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'lib/client.js' });
  assert.equal(loaderDefinition.id, 'dsh-session-resilience');
  assert.equal(source.includes('dshAcModuleBar'), true);
  assert.equal(source.includes('dshAcSectionIndex'), true);
  assert.equal(source.includes('dshAcRelayMark'), false);
  assert.equal(source.includes('--dsh-ac-violet'), false);

  const registrations = [];
  const effects = [];
  const scope = snapshotStore({
    status: 'ready',
    writable: true,
    mode: 'host',
    value: { locale: 'en' },
  });
  const modules = {
    react: {
      useEffect: (effect) => { effect(); },
      useRef: (current) => ({ current }),
      useState: (initial) => [initial, () => {}],
    },
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    '@deepseek-ai/dsh-client-store': { createSnapshotStore: snapshotStore },
    '@deepseek-ai/dsh-client-store-legacy': { createSnapshotStore: snapshotStore },
  };
  const plugin = loaderDefinition.factory((id) => {
    if (id in modules) return modules[id];
    throw new Error(`Unexpected client dependency: ${id}`);
  });
  plugin.apply({
    effect(effect, label) {
      effects.push(effect);
      if (label === 'auto-continue: settings page' || label === 'auto-continue: DSH connection') return effect();
      return () => {};
    },
    locale: {
      register: () => () => {},
      getLocale: () => ({ active: 'en' }),
      bind: () => (key) => key,
    },
    configForms: {
      get(namespace) {
        assert.equal(namespace, 'dsh-session-resilience');
        return scope;
      },
      whileServed(_namespaces, register) { return register(); },
    },
    on: () => () => {},
    get(name) {
      assert.equal(name, 'connection');
      return {
        reconnect() { reconnectCount += 1; },
        state: {
          getSnapshot: () => 'connected',
          subscribe: () => () => {},
        },
      };
    },
    slots: {
      inject: (_name, register) => { register(); return () => {}; },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  });

  assert.equal(effects.length, 5);
  const settings = registrations.find(({ options }) => options.name === 'plugins.item');
  assert.ok(settings);
  assert.equal(settings.options.id, 'restart-continue');
  assert.equal(settings.options.locale, 'auto-continue');
  const actions = registrations.find(({ options }) => options.name === 'sidebar.footer.action');
  assert.ok(actions);
  assert.equal(actions.options.id, 'dsh-session-resilience-actions');

  context.document = {
    body: { append: () => { formCount += 1; } },
    createElement: (name) => {
      assert.equal(name, 'form');
      return { submit() { this.submitted = true; } };
    },
  };
  const tree = actions.component({ t: (key) => key });
  const findAction = (node, action) => {
    if (node === null || typeof node !== 'object') return undefined;
    if (node.props?.['data-dsh-restart-action'] === action) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findAction(child, action);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const restart = findAction(tree, 'restart');
  assert.ok(restart);
  restart.props.onClick();
  restart.props.onClick();
  await waitFor(() => tokenExchanged);
  await waitFor(() => reconnectCount > 0);
  assert.equal(actionCount, 1);
  assert.equal(statusReads, 1);
  assert.equal(reconnectCount, 1);
  assert.equal(formCount, 0);
  assert.equal(context.window.location.href, 'http://127.0.0.1:3080/');
});

test('published restart helper waits for readiness before declaring relaunch success', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'dsh-session-resilience-test-'));
  const markerPath = join(tempDir, 'marker.json');
  const logOut = join(tempDir, 'stdout.log');
  const logErr = join(tempDir, 'stderr.log');
  await writeFile(markerPath, JSON.stringify({ test: true }));

  const blocker = createServer((_request, response) => response.end('blocked'));
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const port = blocker.address().port;
  const hostCode = [
    'const http=require("node:http")',
    'const port=Number(process.argv.at(-1))',
    'process.stdout.write("dsh web: http://127.0.0.1:"+port+"\\n")',
    'const server=http.createServer((_request,response)=>{response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({instanceId:"replacement-runtime-42"}))})',
    'server.listen(port,"127.0.0.1")',
    'setTimeout(()=>server.close(()=>process.exit(0)),5000)',
  ].join(';');
  const helper = spawn(process.execPath, [
    join(root, 'lib/restart-helper.cjs'),
    JSON.stringify({
      oldPid: 123,
      port,
      markerPath,
      logOut,
      logErr,
      relaunch: {
        file: process.execPath,
        args: ['-e', hostCode, String(port)],
        cwd: tempDir,
      },
    }),
  ], { stdio: 'ignore', windowsHide: true });

  try {
    await new Promise((resolve) => blocker.close(resolve));
    await waitFor(async () => (await readFile(logOut, 'utf8').catch(() => '')).includes('http200=true and launchUrl=true'));
    const marker = await readJson(markerPath);
    assert.equal(typeof marker.newPid, 'number');
    assert.equal(marker.newInstanceId, 'replacement-runtime-42');
    assert.notEqual(marker.newInstanceId, String(marker.newPid));
    assert.match(marker.launchUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  } finally {
    const marker = await readJson(markerPath).catch(() => ({}));
    if (typeof marker.newPid === 'number') {
      try { process.kill(marker.newPid, 'SIGTERM'); } catch {}
      await waitFor(async () => {
        try {
          process.kill(marker.newPid, 0);
          return false;
        } catch {
          return true;
        }
      }, 8_000).catch(() => {});
    }
    if (helper.exitCode === null) {
      helper.kill();
      await once(helper, 'exit').catch(() => {});
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
