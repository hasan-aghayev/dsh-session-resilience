/** Host-side restart controller shared by the restart buttons and the model tool. */
import type { Context } from '@deepseek-ai/cordis';
import type { AutoContinueConfig } from './shared/core.ts';
type RestartResult = {
    ok: true;
    action: 'restart';
    instanceId: string;
    oldPid: number;
    port: number;
    helperPid?: number;
    sessionIds: string[];
    logOut: string;
    logErr: string;
};
type ShutdownResult = {
    ok: true;
    action: 'shutdown';
    instanceId: string;
    pid: number;
    port: number;
};
/** Resolve the active Web port without making 3080 a second profile. */
export declare function resolvePort(ctx: Context, fallback?: number): number;
type LocalRequest = {
    socket?: {
        remoteAddress?: string | undefined;
    };
    headers: Record<string, string | string[] | undefined>;
};
/** Accept requests that reached the host directly from the local machine. */
export declare function isLoopbackRequest(req: LocalRequest): boolean;
/** Accept a local request only when its browser origin matches the host. */
export declare function trustedLoopback(req: LocalRequest): boolean;
/** Owns the public restart routes and the durable post-restart handoff. */
export declare class RestartController {
    private readonly ctx;
    private readonly getConfig;
    private readonly routeDisposers;
    private readonly resumeDisposer;
    private resumeTimer;
    private pending;
    private resumeDeadline;
    private disposed;
    constructor(ctx: Context, getConfig: () => AutoContinueConfig);
    mountRoutes(): void;
    /** Restart the active web host for a model-facing tool call. */
    restartForTool(): RestartResult;
    /** Stop the active web host without scheduling a replacement process. */
    shutdownForTool(): ShutdownResult;
    dispose(): void;
    private startResume;
    private deliver;
    private finishResume;
}
export {};
//# sourceMappingURL=restart.d.ts.map
