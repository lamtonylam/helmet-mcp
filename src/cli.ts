import { parseArgs } from "node:util";
import { HELMET_ORG } from "./finna/helmet.js";
import { SERVER_NAME, SERVER_VERSION } from "./server.js";

export const HELP = `${SERVER_NAME} ${SERVER_VERSION} — MCP server for the Finnish Helmet-kirjastot libraries.

Usage:
  helmet-mcp [options]

Options:
  --http                 Serve MCP over Streamable HTTP instead of stdio
  --port <number>        HTTP port (default 3000)
  --org <buildingCode>   Finna building code to scope searches (default ${HELMET_ORG})
  --no-availability      Disable real-time availability lookups
  --user-agent <value>   Custom User-Agent sent to Finna
  --log-level <level>    Log level: debug | info | warn | error (default info)
  --concurrency <n>      Max concurrent requests to Finna (default 16)
  --min-interval <ms>    Min interval between requests in ms (default 0)
  --cache-ttl <seconds>  Response cache TTL in seconds (default 5)
  --timeout <ms>         Upstream request timeout in ms (default 12000)
  --polite               Gentle preset: concurrency 2, 200ms interval, 60s cache
  -h, --help             Show this help
`;

// Aggressive towards the shared Finna services by default (operator's choice);
// --polite restores the gentle posture.
export const RUDE_DEFAULTS = {
  concurrency: 16,
  minIntervalMs: 0,
  cacheTtlMs: 5_000,
  timeoutMs: 12_000,
};
export const POLITE_PRESET = {
  concurrency: 2,
  minIntervalMs: 200,
  cacheTtlMs: 60_000,
  timeoutMs: 12_000,
};

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface CliOptions {
  http: boolean;
  port: number;
  org: string;
  availability: boolean;
  userAgent?: string;
  logLevel: LogLevel;
  polite: boolean;
  concurrency?: number;
  minIntervalMs?: number;
  cacheTtlMs?: number;
  timeoutMs?: number;
}

/** Tuning values passed to the upstream clients after preset/flag resolution. */
export interface ClientTuning {
  concurrency: number;
  minIntervalMs: number;
  cacheTtlMs: number;
  timeoutMs: number;
}

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Parse CLI arguments. Returns `undefined` when `--help` was requested
 * (the caller should print {@link HELP} and exit).
 * @throws Error with a user-facing message on invalid values.
 */
export function parseCliOptions(argv: string[]): CliOptions | undefined {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      http: { type: "boolean", default: false },
      port: { type: "string" },
      org: { type: "string" },
      "no-availability": { type: "boolean", default: false },
      "user-agent": { type: "string" },
      "log-level": { type: "string" },
      concurrency: { type: "string" },
      "min-interval": { type: "string" },
      "cache-ttl": { type: "string" },
      timeout: { type: "string" },
      polite: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) return undefined;

  const port = values.port ? Number(values.port) : 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port value: ${values.port}`);
  }

  const logLevelValue = values["log-level"] ?? "info";
  if (!isLogLevel(logLevelValue)) {
    throw new Error(
      `Invalid --log-level value: ${logLevelValue}. Expected: ${LOG_LEVELS.join(", ")}`,
    );
  }

  const concurrency = parsePositiveInt("--concurrency", values.concurrency);
  const minIntervalMs = parseNonNegativeInt("--min-interval", values["min-interval"]);
  const cacheTtlSeconds = parseNonNegativeInt("--cache-ttl", values["cache-ttl"]);
  const timeoutMs = parsePositiveInt("--timeout", values.timeout);

  return {
    http: values.http ?? false,
    port,
    org: values.org ?? HELMET_ORG,
    availability: !(values["no-availability"] ?? false),
    ...(values["user-agent"] ? { userAgent: values["user-agent"] } : {}),
    logLevel: logLevelValue,
    polite: values.polite ?? false,
    ...(concurrency !== undefined ? { concurrency } : {}),
    ...(minIntervalMs !== undefined ? { minIntervalMs } : {}),
    ...(cacheTtlSeconds !== undefined ? { cacheTtlMs: cacheTtlSeconds * 1000 } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

/**
 * Resolve the effective client tuning: rude by default, `--polite` for the gentle
 * posture, explicit flags always win over the preset.
 */
export function resolveClientTuning(options: CliOptions): ClientTuning {
  const preset = options.polite ? POLITE_PRESET : RUDE_DEFAULTS;
  return {
    concurrency: options.concurrency ?? preset.concurrency,
    minIntervalMs: options.minIntervalMs ?? preset.minIntervalMs,
    cacheTtlMs: options.cacheTtlMs ?? preset.cacheTtlMs,
    timeoutMs: options.timeoutMs ?? preset.timeoutMs,
  };
}

function parsePositiveInt(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${flag} value: ${raw}. Expected a positive integer.`);
  }
  return value;
}

function parseNonNegativeInt(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${flag} value: ${raw}. Expected a non-negative integer.`);
  }
  return value;
}
