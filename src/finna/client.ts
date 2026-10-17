import { TtlCache } from "../lib/cache.js";
import { RateLimiter } from "../lib/ratelimit.js";
import { ToolError } from "../lib/errors.js";

// Note: helmet.finna.fi's WAF rejects User-Agents containing a URL, so keep this URL-free.
export const DEFAULT_USER_AGENT = "helmet-mcp/0.1 (library catalogue assistant)";

export type ParamValue = string | number | boolean | Array<string | number> | undefined;

export interface FinnaClientOptions {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxRetries?: number;
  /** Max simultaneous in-flight requests (default 2). */
  concurrency?: number;
  /** Minimum interval between the start of consecutive requests, in ms (default 200). */
  minIntervalMs?: number;
}

export interface FinnaError {
  status: "ERROR";
  statusMessage?: string;
}

/**
 * Thin, polite wrapper around the Finna open API (api.finna.fi/api/v1).
 * Handles the repeated-key query syntax, caching, rate limiting, retries and Finna's
 * `status: "ERROR"` envelope.
 */
export class FinnaClient {
  readonly baseUrl: string;
  readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxRetries: number;
  private readonly cache = new TtlCache<unknown>(1000);
  private readonly limiter: RateLimiter;

  constructor(options: FinnaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://api.finna.fi/api/v1/";
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.limiter = new RateLimiter(options.concurrency ?? 2, options.minIntervalMs ?? 200);
  }

  buildUrl(path: string, params: Record<string, ParamValue> = {}): string {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
    return url.toString();
  }

  /** Perform a GET request and return the parsed JSON body. */
  async get<T = unknown>(
    path: string,
    params: Record<string, ParamValue> = {},
    options: { cacheTtlMs?: number; noCache?: boolean } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const ttl = options.cacheTtlMs ?? this.cacheTtlMs;
    if (options.noCache) return this.fetchJson<T>(url);
    return this.cache.wrap(url, ttl, () => this.fetchJson<T>(url));
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) await delay(250 * 2 ** (attempt - 1));
      try {
        const response = await this.limiter.run(() => this.request(url));
        if (response.status === 429 || response.status >= 500) {
          lastError = new ToolError(
            "upstream_error",
            `Finna API responded with HTTP ${response.status}.`,
            ["Try again shortly."],
          );
          continue;
        }
        if (!response.ok) {
          throw new ToolError(
            "upstream_error",
            `Finna API responded with HTTP ${response.status}.`,
          );
        }
        const body = (await response.json()) as T & FinnaError;
        if (body && typeof body === "object" && body.status === "ERROR") {
          throw new ToolError("invalid_request", body.statusMessage ?? "Finna reported an error.", [
            "Check the search parameters (query, filters, type, sort).",
          ]);
        }
        return body;
      } catch (error) {
        // ToolErrors thrown above are permanent (4xx responses, Finna's ERROR envelope);
        // retrying them would just repeat a request that cannot succeed. Transient
        // statuses (429/5xx) never reach this catch — they `continue` the loop instead.
        if (error instanceof ToolError) throw error;
        lastError = error;
      }
    }
    if (lastError instanceof ToolError) throw lastError;
    throw new ToolError(
      "network_error",
      `Could not reach the Finna API: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      ["Check network connectivity."],
    );
  }

  private async request(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
