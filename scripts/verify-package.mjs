import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const requiredFiles = [
  'lib/index.js',
  'lib/client.js',
  'lib/restart-helper.cjs',
  'lib/types/index.d.ts',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
  'LICENSE',
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing publication file: ${file}`);
}

if (manifest.name !== 'dsh-session-resilience') throw new Error('Package identity is not standalone.');
if (!manifest.dsh?.bundle?.patch || !manifest.dsh?.client?.platform) throw new Error('Incomplete DSH manifest.');
const DSH_COMPATIBILITY = '>=0.1.0-rc.7 <0.2.0 || >=0.1.7-alpha.1 <0.1.8 || 0.2.0-rc.2 || ^0.2.0';
if (manifest.engines?.dsh !== DSH_COMPATIBILITY) throw new Error('DSH engine range is missing or too broad.');
for (const name of [
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
]) {
  if (!manifest.peerDependencies?.[name]?.includes('0.2.0-rc.2')) {
    throw new Error(`Peer dependency ${name} does not support DSH 0.2.0-rc.2.`);
  }
}
if (!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-plugin-manager')
  || manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-plugins')) {
  throw new Error('Client manifest does not use the current Plugins page provider.');
}
if (manifest.scripts?.test !== 'node --test scripts/test-artifact.mjs') throw new Error('Artifact test script is missing.');
const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8');
if (!patch.includes('id: dsh-session-resilience') || !patch.includes("name: 'dsh-session-resilience'")) {
  throw new Error('Bundle patch does not point to the standalone package.');
}

const clientBundle = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
if (!clientBundle.includes('id: "dsh-session-resilience"') || clientBundle.includes('@deepseek-ai/dsh-restart-continue')) {
  throw new Error('Client bundle still carries the upstream package identity.');
}
if (!clientBundle.includes('plugins.item') || clientBundle.includes('settings.plugin.item') || clientBundle.includes('settingsScope')) {
  throw new Error('Client bundle does not use the current Plugins page and configuration forms.');
}
if (!clientBundle.includes('configForms')) throw new Error('Client bundle does not load the configuration form service.');
if (!clientBundle.includes('navigator.sendBeacon')
  || !clientBundle.includes('credentials: "same-origin"')
  || !clientBundle.includes('reconnectAndWaitForConnected')
  || !clientBundle.includes('createRestartRequestId')
  || !clientBundle.includes('status.restartRequestId === restartRequestId')
  || clientBundle.includes('STATUS_REFRESH_INTERVAL_MS')
  || clientBundle.includes('form.target = "_self"')) {
  throw new Error('Client bundle does not preserve the page while requesting a restart.');
}

const hostBundle = readFileSync(resolve(root, 'lib/index.js'), 'utf8');
for (const marker of [
  'const RECOVERY_PRESETS',
  'recoveryPreset === "safe"',
  'recoveryPreset === "manual"',
  'restartResumeWindowMs: 300 * 1e3',
  'maxConsecutive: 2',
  'function isLoopbackRequest',
  'invalid restart request id',
  'restartRequestId',
  'request body too large',
  'cannot prepare restart handoff',
  'bridgeRouteDisposers',
]) {
  if (!hostBundle.includes(marker)) throw new Error(`Built runtime is missing recovery policy marker: ${marker}`);
}

for (const file of ['lib/index.js', 'lib/client.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('dsh-session-resilience publication files and JavaScript syntax are valid.');
