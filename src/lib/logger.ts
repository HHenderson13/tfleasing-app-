// Tiny structured-logger wrapper. Vercel captures stderr as logs; we just want
// the lines to be JSON with a consistent envelope so they're queryable rather
// than free-text. Use this instead of console.error so we get:
//   {"ts":"…","level":"error","msg":"…","at":"…","err":"…","stack":"…", …context}

export type LogContext = Record<string, unknown>;

function emit(level: "error" | "warn" | "info", msg: string, ctx: LogContext) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// Use at the catch site. Pass the original error and any context (IDs, route,
// inputs) that would help triage. Stack is only included when env LOG_STACK=1
// — keep production logs compact by default.
export function logError(at: string, err: unknown, ctx: LogContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && process.env.LOG_STACK === "1" ? err.stack : undefined;
  emit("error", message, { at, ...ctx, ...(stack ? { stack } : {}) });
}

export function logWarn(at: string, msg: string, ctx: LogContext = {}): void {
  emit("warn", msg, { at, ...ctx });
}

export function logInfo(at: string, msg: string, ctx: LogContext = {}): void {
  emit("info", msg, { at, ...ctx });
}
