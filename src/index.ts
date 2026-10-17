#!/usr/bin/env node
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { FinnaClient, DEFAULT_USER_AGENT } from "./finna/client.js";
import { HoldingsClient } from "./holdings/client.js";
import { HELMET_ORG, DEFAULT_SCOPE_LABEL } from "./finna/helmet.js";
import type { ServerContext } from "./context.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import {
  HELP,
  LOG_LEVELS,
  parseCliOptions,
  resolveClientTuning,
  type CliOptions,
  type LogLevel,
} from "./cli.js";

let logLevel: LogLevel = "info";

function log(level: LogLevel, message: string): void {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(logLevel)) return;
  // Never write to stdout: in stdio mode it would corrupt the JSON-RPC stream.
  process.stderr.write(`[${SERVER_NAME}] ${level}: ${message}\n`);
}

function buildContext(options: CliOptions): ServerContext {
  const tuning = resolveClientTuning(options);
  const clientOptions = {
    ...tuning,
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  };
  const finna = new FinnaClient(clientOptions);
  const holdings = new HoldingsClient({ ...clientOptions, enabled: options.availability });
  if (!options.polite) {
    log(
      "warn",
      "Running aggressively towards the shared Finna services by default " +
        `(concurrency ${tuning.concurrency}, min interval ${tuning.minIntervalMs}ms, ` +
        `cache ${Math.round(tuning.cacheTtlMs / 1000)}s). ` +
        "Expect 429s or WAF blocks; pass --polite for the gentle posture.",
    );
  }
  return {
    finna,
    holdings,
    org: options.org,
    scopeLabel: options.org === HELMET_ORG ? DEFAULT_SCOPE_LABEL : options.org,
    availabilityEnabled: options.availability,
  };
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

class HttpRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpRequestError(413, "Request body too large.");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpRequestError(400, "Request body is not valid JSON.");
  }
}

function methodNotAllowed(res: ServerResponse): void {
  res.writeHead(405, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
  );
}

function startHttp(ctx: ServerContext, port: number): Promise<void> {
  const httpServer = createHttpServer((req, res) => {
    void (async () => {
      const path = req.url?.split("?")[0] ?? "";
      if (path === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION }));
        return;
      }
      if (path !== "/mcp") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      if (req.method !== "POST") {
        methodNotAllowed(res);
        return;
      }

      try {
        const body = await readJsonBody(req);
        const server = createServer(ctx);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (error) {
        log(
          "error",
          `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (!res.headersSent) {
          const status = error instanceof HttpRequestError ? error.status : 500;
          const code = status === 500 ? -32603 : -32600;
          const message =
            error instanceof HttpRequestError ? error.message : "Internal server error";
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
        }
      }
    })();
  });

  return new Promise<void>((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, "127.0.0.1", () => {
      const address = httpServer.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      log("info", `listening on http://127.0.0.1:${actualPort}/mcp`);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  let options: CliOptions | undefined;
  try {
    options = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    log("error", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!options) {
    process.stdout.write(HELP);
    return;
  }

  logLevel = options.logLevel;

  const ctx = buildContext(options);

  if (options.http) {
    await startHttp(ctx, options.port);
    log("info", `User-Agent: ${options.userAgent ?? DEFAULT_USER_AGENT}`);
    return;
  }

  const server = createServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "connected over stdio");
}

main().catch((error) => {
  log("error", error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
