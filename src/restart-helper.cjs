// Detached helper for the combined DSH restart plugin.
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');

const spec = JSON.parse(process.argv[2]);
const { oldPid, port, markerPath, logOut, logErr, relaunch } = spec;
const note = (message) => { try { fs.appendFileSync(logOut, `${new Date().toISOString()} ${message}\n`); } catch {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portFree() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(true); });
  });
}

function httpOk() {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/dsh-restart/status', timeout: 3000 }, (response) => {
      response.destroy();
      resolve(response.statusCode === 200);
    });
    request.once('error', () => resolve(false));
    request.once('timeout', () => { request.destroy(); resolve(false); });
  });
}

function launchUrlFromLog() {
  try {
    const text = fs.readFileSync(logOut, 'utf8');
    const matches = [...text.matchAll(/^dsh web: (https?:\/\/\S+)/gm)];
    return matches.at(-1)?.[1] ?? null;
  } catch {
    return null;
  }
}

function updateMarker(fields) {
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    fs.writeFileSync(markerPath, JSON.stringify({ ...marker, ...fields }, null, 2));
  } catch (error) {
    note(`marker update failed: ${error.message}`);
  }
}

(async () => {
  note(`helper up pid=${process.pid} oldPid=${oldPid} port=${port}`);
  let freed = false;
  for (let i = 0; i < 180; i += 1) {
    if (await portFree()) { freed = true; break; }
    await sleep(500);
  }
  if (!freed) { note(`TIMEOUT: port ${port} never freed`); return; }
  note(`port ${port} free, relaunching`);

  let file = relaunch.file;
  let args = relaunch.args;
  let detached = true;
  if (process.platform === 'win32') {
    const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
    file = 'powershell.exe';
    args = ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', [`& ${quote(relaunch.file)}`, ...relaunch.args.map(quote)].join(' ')];
    detached = false;
  }

  let out;
  let err;
  try { out = fs.openSync(logOut, 'a'); err = fs.openSync(logErr, 'a'); } catch (error) { note(`log open failed: ${error.message}`); return; }
  let spawnedPid = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let child;
    try {
      child = spawn(file, args, { cwd: relaunch.cwd, detached, stdio: ['ignore', out, err], env: process.env, windowsHide: true });
    } catch (error) {
      note(`spawn threw (attempt ${attempt}): ${error.message}`);
      await sleep(attempt * 800);
      continue;
    }
    const started = await new Promise((resolve) => { child.once('spawn', () => resolve(true)); child.once('error', () => resolve(false)); });
    if (started) { spawnedPid = child.pid; child.unref(); note(`spawned pid=${child.pid} (attempt ${attempt})`); break; }
    note(`spawn error (attempt ${attempt}), retrying`);
    await sleep(attempt * 800);
  }
  if (spawnedPid === null) { note('relaunch FAILED after 3 attempts'); return; }
  updateMarker({ newPid: spawnedPid, spawnedAt: new Date().toISOString() });
  for (let i = 0; i < 60; i += 1) {
    await sleep(1000);
    const ready = await httpOk();
    const launchUrl = launchUrlFromLog();
    if (launchUrl !== null) updateMarker({ launchUrl });
    if (ready && launchUrl !== null) {
      note(`http200=true and launchUrl=true at ${new Date().toISOString()}`);
      return;
    }
    if (ready) note(`http200=true; waiting for launch URL at ${new Date().toISOString()}`);
  }
  note('http verify timed out (new host may still be booting)');
})();
