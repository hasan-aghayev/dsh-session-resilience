/** Host-side restart controller shared by the restart buttons and the model tool. */

import { spawn } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { AutoContinueConfig } from './shared/core.ts'

const PLUGIN_NAME = 'dsh-session-resilience'
const INSTANCE_ID = `${process.pid}-${Date.now()}`
const HELPER_FILE = fileURLToPath(new URL('./restart-helper.cjs', import.meta.url))

type RestartRecord = { sessionIds: string[]; restartAt: string; pid: number }
type RestartMarker = { newPid?: number; launchUrl?: string }
type RestartResult = {
  ok: true
  action: 'restart'
  instanceId: string
  oldPid: number
  port: number
  helperPid?: number
  sessionIds: string[]
  logOut: string
  logErr: string
}
type ShutdownResult = {
  ok: true
  action: 'shutdown'
  instanceId: string
  pid: number
  port: number
}

function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function resumePath(): string {
  return join(dshHome(), 'dsh-session-resilience-resume.json')
}

function markerPath(port: number): string {
  return join(dshHome(), `dsh-session-resilience-${port}.json`)
}

function flagPath(): string {
  return join(dshHome(), 'dsh-restarting.flag')
}

function stopFlagPath(): string {
  return join(dshHome(), 'dsh-stopped.flag')
}

function logPath(kind: 'out' | 'err'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return join(process.env.TEMP ?? '/tmp', `dsh-session-resilience-${stamp}.${kind}.log`)
}

function bestEffortWrite(path: string, value: unknown): void {
  try { writeFileSync(path, JSON.stringify(value, null, 2), 'utf8') } catch { /* diagnostics only */ }
}

function clear(path: string): void {
  try { unlinkSync(path) } catch { /* already absent */ }
}

function readRecord(): RestartRecord | undefined {
  try {
    const value = JSON.parse(readFileSync(resumePath(), 'utf8')) as Partial<RestartRecord>
    if (!Array.isArray(value.sessionIds)) return undefined
    const sessionIds = value.sessionIds.filter((id): id is string => typeof id === 'string' && id !== '')
    if (sessionIds.length === 0 || typeof value.restartAt !== 'string') return undefined
    const pid = typeof value.pid === 'number' ? value.pid : 0
    return { sessionIds, restartAt: value.restartAt, pid }
  } catch {
    return undefined
  }
}

function currentLaunchUrl(port: number): string | undefined {
  try {
    const marker = JSON.parse(readFileSync(markerPath(port), 'utf8')) as RestartMarker
    return marker.newPid === process.pid && typeof marker.launchUrl === 'string'
      ? marker.launchUrl
      : undefined
  } catch {
    return undefined
  }
}

function runningSessionIds(ctx: Context): string[] {
  try {
    return [...new Set(ctx.agents.roots()
      .filter((agent) => agent.status === 'running')
      .map((agent) => String(agent.id)))]
  } catch {
    return []
  }
}

function baseRelaunchArgs(): string[] {
  const args = [...process.argv.slice(1)]
  const index = args.indexOf('--port')
  if (index !== -1) args.splice(index, 2)
  return args
}

function relaunchSpec(port: number): { file: string; args: string[]; cwd: string } {
  return {
    file: process.execPath,
    args: [...process.execArgv, ...baseRelaunchArgs(), '--port', String(port)],
    cwd: process.cwd(),
  }
}

/** Resolve the active Web port without making 3080 a second profile. */
export function resolvePort(ctx: Context, fallback = 3080): number {
  const index = process.argv.indexOf('--port')
  const argument = index === -1 ? undefined : process.argv[index + 1]
  const value = argument === undefined ? undefined : Number(argument)
  if (value !== undefined && Number.isInteger(value) && value > 0) return value
  try {
    const bound = ctx.get('webServer')?.port
    if (typeof bound === 'number' && bound > 0) return bound
  } catch { /* webServer may not be mounted yet */ }
  return fallback
}

type LocalRequest = {
  socket?: { remoteAddress?: string | undefined }
  headers: Record<string, string | string[] | undefined>
}

/** Accept requests that reached the host directly from the local machine. */
export function isLoopbackRequest(req: LocalRequest): boolean {
  const address = req.socket?.remoteAddress
  return (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1') &&
    req.headers.forwarded === undefined &&
    req.headers['x-forwarded-for'] === undefined &&
    req.headers['x-real-ip'] === undefined
}

/** Accept a local request only when its browser origin matches the host. */
export function trustedLoopback(req: LocalRequest): boolean {
  if (!isLoopbackRequest(req)) return false
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function json(res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void }, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function scheduleExit(ctx: Context): void {
  setTimeout(() => {
    try {
      const exit = ctx.get('appExit')
      if (typeof exit === 'function') exit(0)
    } catch { /* the hard-kill backstop below still handles the process */ }
    setTimeout(() => {
      try { process.kill(process.pid, 'SIGTERM') } catch { /* already stopped */ }
    }, 12_000)
  }, 2_000)
}

function restart(ctx: Context, port: number): RestartResult {
  const sessionIds = runningSessionIds(ctx)
  const out = logPath('out')
  const err = logPath('err')
  const marker = markerPath(port)
  try {
    writeFileSync(flagPath(), String(Date.now()), 'utf8')
    writeFileSync(resumePath(), JSON.stringify({ sessionIds, restartAt: new Date().toISOString(), pid: process.pid }, null, 2), 'utf8')
    writeFileSync(marker, JSON.stringify({ from: INSTANCE_ID, oldPid: process.pid, port, requestedAt: new Date().toISOString() }, null, 2), 'utf8')
  } catch (error) {
    clear(flagPath())
    clear(resumePath())
    clear(marker)
    throw new Error(`cannot prepare restart handoff: ${error instanceof Error ? error.message : String(error)}`)
  }

  let helper: ReturnType<typeof spawn>
  try {
    helper = spawn(process.execPath, [
      HELPER_FILE,
      JSON.stringify({ oldPid: process.pid, port, markerPath: marker, logOut: out, logErr: err, relaunch: relaunchSpec(port) }),
    ], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env })
  } catch (error) {
    clear(flagPath())
    clear(resumePath())
    clear(marker)
    throw new Error(`cannot start restart helper: ${error instanceof Error ? error.message : String(error)}`)
  }
  helper.once('error', (error) => {
    console.error(`[${PLUGIN_NAME}] restart helper failed: ${error.message}`)
  })
  helper.unref()
  scheduleExit(ctx)
  return { ok: true, action: 'restart', instanceId: INSTANCE_ID, oldPid: process.pid, port, ...helper.pid === undefined ? {} : { helperPid: helper.pid }, sessionIds, logOut: out, logErr: err }
}

function shutdown(ctx: Context, port: number): ShutdownResult {
  bestEffortWrite(stopFlagPath(), String(Date.now()))
  clear(flagPath())
  scheduleExit(ctx)
  return { ok: true, instanceId: INSTANCE_ID, pid: process.pid, port, action: 'shutdown' }
}

/** Owns the public restart routes and the durable post-restart handoff. */
export class RestartController {
  private readonly routeDisposers: Array<() => void> = []
  private readonly resumeDisposer: () => void
  private resumeTimer: ReturnType<typeof setInterval> | undefined
  private pending = new Set<string>()
  private resumeDeadline = 0
  private disposed = false

  constructor(private readonly ctx: Context, private readonly getConfig: () => AutoContinueConfig) {
    this.resumeDisposer = ctx.on('agent/created', ({ agent }) => this.deliver(agent))
    this.startResume()
  }

  mountRoutes(): void {
    this.routeDisposers.push(this.ctx.webServer.register({
      kind: 'exact', path: '/dsh-restart/health',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'local requests only' }); return }
        json(res, 200, { ok: true, instanceId: INSTANCE_ID, ts: Date.now() })
      },
    }))
    this.routeDisposers.push(this.ctx.webServer.register({
      kind: 'exact', path: '/dsh-restart/status',
      handler: (req, res) => {
        if (!isLoopbackRequest(req)) { json(res, 403, { ok: false, error: 'local requests only' }); return }
        const marker = readRecord()
        const launchUrl = currentLaunchUrl(resolvePort(this.ctx))
        json(res, 200, {
          ok: true,
          instanceId: INSTANCE_ID,
          restarted: marker !== undefined && marker.pid !== process.pid,
          ...(launchUrl === undefined ? {} : { launchUrl }),
        })
      },
    }))
    this.routeDisposers.push(this.ctx.webServer.register({
      kind: 'exact', path: '/dsh-restart/restart',
      handler: (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
        if (!trustedLoopback(req)) { json(res, 403, { ok: false, error: 'untrusted origin' }); return }
        json(res, 200, restart(this.ctx, resolvePort(this.ctx)))
      },
    }))
    this.routeDisposers.push(this.ctx.webServer.register({
      kind: 'exact', path: '/dsh-restart/shutdown',
      handler: (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
        if (!trustedLoopback(req)) { json(res, 403, { ok: false, error: 'untrusted origin' }); return }
        json(res, 200, shutdown(this.ctx, resolvePort(this.ctx)))
      },
    }))
  }

  /** Restart the active web host for a model-facing tool call. */
  restartForTool(): RestartResult {
    return restart(this.ctx, resolvePort(this.ctx))
  }

  /** Stop the active web host without scheduling a replacement process. */
  shutdownForTool(): ShutdownResult {
    return shutdown(this.ctx, resolvePort(this.ctx))
  }

  dispose(): void {
    this.disposed = true
    this.resumeDisposer()
    if (this.resumeTimer !== undefined) clearInterval(this.resumeTimer)
    for (const dispose of this.routeDisposers.splice(0)) dispose()
  }

  private startResume(): void {
    const config = this.getConfig()
    if (!config.enabled || !config.restartAutoContinue) return
    const record = readRecord()
    if (record === undefined) return
    const startedAt = Date.parse(record.restartAt)
    this.resumeDeadline = (Number.isFinite(startedAt) ? startedAt : Date.now()) + config.restartResumeWindowMs
    this.pending = new Set(record.sessionIds)
    for (const agent of this.ctx.agents.list()) this.deliver(agent)
    if (this.pending.size === 0) { clear(resumePath()); return }
    this.resumeTimer = setInterval(() => {
      if (this.disposed) return
      const current = this.getConfig()
      if (!current.enabled || !current.restartAutoContinue || Date.now() >= this.resumeDeadline) {
        this.finishResume()
        return
      }
      for (const sessionId of [...this.pending]) {
        const agent = this.ctx.agents.get(SessionId(sessionId))
        if (agent !== undefined) this.deliver(agent)
      }
    }, 500)
  }

  private deliver(agent: Agent): void {
    const sessionId = String(agent.id)
    if (!this.pending.has(sessionId)) return
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: this.getConfig().continueText }],
        source: { kind: 'plugin', plugin: PLUGIN_NAME, form: 'instructions' },
      }))
      this.pending.delete(sessionId)
      if (this.pending.size === 0) this.finishResume()
    } catch { /* agent was published before its inbox became writable; retry */ }
  }

  private finishResume(): void {
    if (this.resumeTimer !== undefined) clearInterval(this.resumeTimer)
    this.resumeTimer = undefined
    clear(resumePath())
  }
}
