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
  assert.equal(manifest.version, '0.1.6');
  assert.equal(manifest.engines.dsh, '>=0.1.0-rc.7 <0.2.0 || >=0.1.7-alpha.1 <0.1.8 || 0.2.0-rc.2 || ^0.2.0');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal((await readFile(join(root, 'cordis.patch.yml'), 'utf8')).includes('dsh-session-resilience'), true);
  assert.equal(host.includes('restartResumeWindowMs: 300 * 1e3'), true);
  for (const marker of [
    'function isLoopbackRequest',
    'request body too large',
    'cannot prepare restart handoff',
    'bridgeRouteDisposers',
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

test('browser restart controls reconnect in place and the host keeps its legacy handoff route', async () => {
  const client = await readFile(join(root, 'lib/client.js'), 'utf8');
  const host = await readFile(join(root, 'lib/index.js'), 'utf8');
  assert.match(client, /navigator\.sendBeacon/);
  assert.match(client, /waitForReplacementHost/);
  assert.match(client, /credentials: "same-origin"/);
  assert.doesNotMatch(client, /form\.target = "_self"/);
  assert.doesNotMatch(client, /window\.location\.(?:assign|replace)\(/);
  assert.match(host, /function restartDocument/);
  assert.match(host, /content-security-policy/);
  assert.match(host, /window\.location\.replace\(launch\.href\)/);
  assert.match(host, /launch\.origin === window\.location\.origin/);
  assert.match(host, /function wantsHtml/);
});

test('published client registers the settings card and sidebar controls', async () => {
  let loaderDefinition;
  let beaconCount = 0;
  let tokenExchanged = false;
  let formCount = 0;
  const context = vm.createContext({
    window: {
      clearInterval() {},
      setInterval() { return 1; },
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
    navigator: {
      sendBeacon(url) {
        assert.equal(url, '/dsh-restart/restart');
        beaconCount += 1;
        return true;
      },
    },
    fetch: async (input) => {
      if (String(input) === '/dsh-restart/status') {
        return {
          ok: true,
          json: async () => beaconCount === 0
            ? { ok: true, instanceId: 'old' }
            : { ok: true, instanceId: 'new', launchUrl: 'http://127.0.0.1:3080/?token=fresh' },
        };
      }
      assert.equal(String(input), 'http://127.0.0.1:3080/?token=fresh');
      tokenExchanged = true;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    },
    Blob,
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
      if (label === 'auto-continue: settings page') return effect();
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
    slots: {
      inject: (_name, register) => { register(); return () => {}; },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  });

  assert.equal(effects.length, 4);
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
  assert.equal(beaconCount, 1);
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
    'const server=http.createServer((_request,response)=>{response.writeHead(200,{"content-type":"application/json"});response.end("{}")})',
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
