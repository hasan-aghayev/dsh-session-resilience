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
const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8');
if (!patch.includes('id: dsh-session-resilience') || !patch.includes("name: 'dsh-session-resilience'")) {
  throw new Error('Bundle patch does not point to the standalone package.');
}

const clientBundle = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
if (!clientBundle.includes('id: "dsh-session-resilience"') || clientBundle.includes('@deepseek-ai/dsh-restart-continue')) {
  throw new Error('Client bundle still carries the upstream package identity.');
}

const { resolveConfig } = await import('../lib/types/shared/core.js');
const safe = resolveConfig({ recoveryPreset: 'safe' });
if (safe.restartResumeWindowMs !== 5 * 60 * 1000 || safe.maxConsecutive !== 2) {
  throw new Error('Safe recovery policy did not resolve its coordinated defaults.');
}
const manual = resolveConfig({ recoveryPreset: 'manual', cooldownMs: 12345 });
if (manual.cooldownMs !== 12345) throw new Error('Manual recovery policy ignored an individual override.');

for (const file of ['lib/index.js', 'lib/client.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('dsh-session-resilience publication files and JavaScript syntax are valid.');
