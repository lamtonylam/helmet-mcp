import { TtlCache } from "../lib/cache.js";
import { RateLimiter } from "../lib/ratelimit.js";
import { DEFAULT_RECORD_URL } from "../finna/helmet.js";
import { parseHoldings, type HoldingBranch, type HoldingsSummary } from "./parse.js";

export const HOLDINGS_BASE_URL = "https://helmet.finna.fi";
// helmet.finna.fi's WAF rejects User-Agents containing a URL; keep this URL-free.
const DEFAULT_UA = "Mozilla/5.0 (compatible; helmet-mcp/0.1; library catalogue assistant)";

export type AvailabilityConfidence = "parsed" | "link-only";

export interface AvailabilityResult {
  id: string;
  recordUrl: string;
  retrievedAt: string;
  confidence: AvailabilityConfidence;
  summary: HoldingsSummary;
  branches: HoldingBranch[];
  note?: string;
}

export interface HoldingsClientOptions {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  enabled?: boolean;
  /** Max simultaneous in-flight requests (default 2). */
  concurrency?: number;
  /** Minimum interval between the start of consecutive requests, in ms (default 200). */
  minIntervalMs?: number;
}

const EMPTY_SUMMARY: HoldingsSummary = {
  availableCount: 0,
  totalCount: 0,
  reservations: 0,
  branchesWithAvailable: 0,
};

/**
 * Fetches real-time availability from the Finna record UI's holdings fragment, which is
 * server-rendered HTML. This is the only source of holdings data (the open API omits it).
 * Falls back to a link-only result if the fragment cannot be parsed.
 */
export class HoldingsClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  readonly enabled: boolean;
  private readonly cache = new TtlCache<AvailabilityResult>(1000);
  private readonly limiter: RateLimiter;

  constructor(options: HoldingsClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? HOLDINGS_BASE_URL;
    this.userAgent = options.userAgent ?? DEFAULT_UA;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.enabled = options.enabled ?? true;
    this.limiter = new RateLimiter(options.concurrency ?? 2, options.minIntervalMs ?? 200);
  }

  buildUrl(id: string): string {
    return `${this.baseUrl}/Record/${encodeURIComponent(id)}/AjaxTab?tab=holdings`;
  }

  async get(id: string): Promise<AvailabilityResult> {
    const linkOnly = (note: string): AvailabilityResult => ({
      id,
      recordUrl: DEFAULT_RECORD_URL(id),
      retrievedAt: new Date().toISOString(),
      confidence: "link-only",
      summary: { ...EMPTY_SUMMARY },
      branches: [],
      note,
    });

    if (!this.enabled) {
      return linkOnly("Availability lookups are disabled (--no-availability).");
    }

    const url = this.buildUrl(id);
    const cached = this.cache.get(url);
    if (cached) return cached;

    let html: string;
    try {
      html = await this.fetchHtml(url);
    } catch (error) {
      return linkOnly(
        `Could not load availability: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const looksParsed =
      html.includes("record-holdings-table") || html.includes("holdingsils.phtml");
    if (!looksParsed || html.trimStart().startsWith("<!DOCTYPE html>")) {
      return linkOnly("Finna did not return a holdings fragment for this record.");
    }

    const parsed = parseHoldings(html);
    const result: AvailabilityResult = {
      id,
      recordUrl: DEFAULT_RECORD_URL(id),
      retrievedAt: new Date().toISOString(),
      confidence: "parsed",
      summary: parsed.summary,
      branches: parsed.branches,
    };
    this.cache.set(url, result, this.cacheTtlMs);
    return result;
  }

  private async fetchHtml(url: string): Promise<string> {
    return this.limiter.run(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": this.userAgent,
            "X-Requested-With": "XMLHttpRequest",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    });
  }
}
