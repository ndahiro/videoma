import { createConnection, type Socket } from "net";

/**
 * Minimal Redis client over raw RESP — no npm dependency.
 *
 * Only what the app needs: PING, AUTH, INCR, PEXPIRE (fixed-window rate
 * limiting). Used when REDIS_URL is set (scaled deployments); otherwise the
 * callers fall back to in-memory stores. Pipelines INCR+PEXPIRE per call;
 * a dropped connection fails open (returns null) and reconnects lazily.
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  connectTimeoutMs: number;
}

export function redisConfigFromUrl(url: string): RedisConfig | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "redis:") return null;
    return {
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port ? Number(parsed.port) : 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      connectTimeoutMs: 2000,
    };
  } catch {
    return null;
  }
}

type Reply = string | number | null;

function encodeCommand(args: Array<string | number>): Buffer {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const s = String(arg);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return Buffer.from(out, "utf8");
}

class RespReader {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  /** Returns a reply, or undefined when more bytes are needed. */
  read(): Reply | undefined {
    const line = this.readLine();
    if (line === undefined) return undefined;
    const type = line[0];
    const payload = line.slice(1);
    if (type === "+") return payload;
    if (type === "-") throw new Error(`Redis error: ${payload}`);
    if (type === ":") return Number(payload);
    if (type === "$") {
      const length = Number(payload);
      if (length === -1) return null;
      if (this.buffer.length < length + 2) return undefined;
      const data = this.buffer.subarray(0, length).toString("utf8");
      this.buffer = this.buffer.subarray(length + 2);
      return data;
    }
    throw new Error(`Unsupported Redis reply type: ${type}`);
  }

  private readLine(): string | undefined {
    const idx = this.buffer.indexOf("\r\n");
    if (idx === -1) return undefined;
    const line = this.buffer.subarray(0, idx).toString("utf8");
    this.buffer = this.buffer.subarray(idx + 2);
    return line;
  }
}

export class MiniRedis {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private reader = new RespReader();
  private pending: Array<{
    resolve: (value: Reply) => void;
    reject: (err: Error) => void;
  }> = [];
  private warned = false;

  constructor(private readonly config: RedisConfig) {}

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[redis] ${message}`);
  }

  private ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = createConnection(
        { host: this.config.host, port: this.config.port },
        () => resolve(),
      );
      const timer = setTimeout(() => {
        socket.destroy(new Error("connect timeout"));
      }, this.config.connectTimeoutMs);
      socket.once("connect", () => clearTimeout(timer));
      socket.once("error", (err) => {
        clearTimeout(timer);
        this.failPending(err);
        reject(err);
      });
      socket.once("close", () => {
        if (this.socket === socket) this.socket = null;
      });
      socket.on("data", (chunk: Buffer) => {
        this.reader.push(chunk);
        this.drain();
      });
      this.socket = socket;
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private failPending(err: Error): void {
    const pending = this.pending;
    this.pending = [];
    for (const p of pending) p.reject(err);
  }

  private drain(): void {
    try {
      for (;;) {
        const reply = this.reader.read();
        if (reply === undefined) return;
        const next = this.pending.shift();
        if (!next) return;
        next.resolve(reply);
      }
    } catch (err) {
      const next = this.pending.shift();
      if (next) next.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private command(args: Array<string | number>): Promise<Reply> {
    return new Promise<Reply>((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error("not connected"));
        return;
      }
      this.pending.push({ resolve, reject });
      this.socket.write(encodeCommand(args), (err) => {
        if (err) {
          const idx = this.pending.findIndex((p) => p.resolve === resolve);
          if (idx !== -1) this.pending.splice(idx, 1);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  /** Connect + AUTH + PING. Returns false (fail open) instead of throwing. */
  async ready(): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (this.config.password) {
        await this.command(["AUTH", this.config.password]);
      }
      await this.command(["PING"]);
      return true;
    } catch (err) {
      this.warnOnce(
        `unavailable at ${this.config.host}:${this.config.port} — callers fall back (${err instanceof Error ? err.message : String(err)})`,
      );
      try {
        this.socket?.destroy();
      } catch {}
      this.socket = null;
      return false;
    }
  }

  /**
   * Fixed-window counter: INCR key, PEXPIRE on first hit. Returns the new
   * count, or null when Redis is unreachable (caller falls back).
   */
  async incrWithExpiry(key: string, windowMs: number): Promise<number | null> {
    try {
      await this.ensureConnected();
      const count = (await this.command(["INCR", key])) as number;
      if (count === 1) {
        await this.command(["PEXPIRE", key, Math.max(1, windowMs)]);
      }
      return count;
    } catch {
      try {
        this.socket?.destroy();
      } catch {}
      this.socket = null;
      return null;
    }
  }

  close(): void {
    try {
      this.socket?.destroy();
    } catch {}
    this.socket = null;
  }
}

let shared: MiniRedis | null = null;

/** Shared client when REDIS_URL is set, else null (use in-memory stores). */
export function sharedRedis(): MiniRedis | null {
  const url = (process.env.REDIS_URL ?? "").trim();
  if (!url) return null;
  if (!shared) {
    const config = redisConfigFromUrl(url);
    if (!config) {
      console.warn("[redis] ignoring malformed REDIS_URL");
      return null;
    }
    shared = new MiniRedis(config);
  }
  return shared;
}
