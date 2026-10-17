# AGENTS.md

Guidance for coding agents working in this repository. Keep it in sync with the code when
you change conventions, commands or structure.

## What this is

`helmet-mcp` is an [MCP](https://modelcontextprotocol.io) server (TypeScript, ESM, Node >= 18) for the
Finnish **Helmet-kirjastot** public library network (Helsinki / Espoo / Vantaa / Kauniainen).

It exposes two upstream data sources:

1. **Finna open API** (`https://api.finna.fi/api/v1/`) — catalogue search, records, authority.
2. **Finna record UI holdings fragment** (`helmet.finna.fi/Record/<id>/AjaxTab?tab=holdings`) —
   server-rendered HTML, the only source of real-time availability.

Not related to the Node.js `helmet` HTTP-header package.

## Commands

```bash
npm install
npm run dev            # tsx src/index.ts (stdio, live network)
npm run typecheck      # tsc --noEmit
npm test               # vitest run — unit + contract tests, no network
npm run build          # tsc -p tsconfig.build.json -> dist/
npm run format         # prettier --write .
npm run format:check   # what CI runs
HELMET_MCP_LIVE=1 npm test   # adds live smoke tests against api.finna.fi
node scripts/generate-branch-registry.mjs   # regenerate branch name -> city registry
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `typecheck`, `test`, `build` on Node 20. A
separate non-blocking job runs the live tests on pushes to `main`. Everything must pass before merge.

## Layout

```
src/
  index.ts                 CLI entry: stdio vs Streamable HTTP, logging (side effects only)
  cli.ts                   Pure CLI arg parsing, presets and client-tuning resolution
  server.ts                createServer(ctx) — registers every tool/resource/prompt
  context.ts               ServerContext (finna, holdings, org, scopeLabel, availabilityEnabled)
  finna/                   Open API layer: client, search, record, authority, filters, normalize, cite, helmet (constants)
  holdings/                Availability layer: client, parse (HTML), status, branch-registry(.generated)
  tools/                   One file per MCP tool; registerXxx(server, ctx)
  resources/index.ts       helmet://* resources
  prompts/index.ts         MCP prompts
  lib/                     errors, cache (TtlCache), ratelimit (RateLimiter)
test/                      vitest suites + test/fixtures/*.html holdings fragments
scripts/                   one-off generators (not shipped)
```

## Conventions

- **ESM + NodeNext.** All relative imports must carry the `.js` extension (`./finna/client.js`)
  even when the source is `.ts`. Type-only imports use `import type`.
- **Strict TS.** `strict` and `noUncheckedIndexedAccess` are on — handle `undefined` from index
  access. Match the existing `exactOptionalPropertyTypes: false` spread style when passing optional
  deps: `...(value ? { key: value } : {})`.
- **Prettier** is the formatter (`printWidth: 100`, double quotes, semicolons, trailing commas).
  Run `npm run format` rather than hand-formatting.
- **Adding a tool:** create `src/tools/<name>.ts` exporting `registerXxx(server, ctx)`, define the
  `inputSchema` with `zod`, set `title`, `description` and `annotations` (`readOnlyHint: true`,
  `openWorldHint: true` for network tools), wrap the handler body in
  `runTool(ctx.scopeLabel, async () => { ... })`, then register it in `src/server.ts`.
- **Result shape.** `runTool` adds `source: { api, scope, attribution }` via `withSource` and turns
  thrown errors into a JSON `{ error: { code, message, hints } }` payload. Throw `ToolError(code,
message, hints)` from `src/lib/errors.ts` for anything an MCP client should see; unexpected errors
  become `internal_error`.
- **Never write to stdout** outside the JSON-RPC transport (see the comment in `src/index.ts`) — in
  stdio mode it corrupts the stream. Log through the `log(level, msg)` helper, which writes to stderr.
- **User-Agent:** `helmet.finna.fi`'s WAF rejects User-Agents containing a URL. Keep the default
  URL-free UA format when adding a client or option.
- **Route requests through the clients.** Route outbound requests through `FinnaClient` /
  `HoldingsClient` so they inherit the shared `RateLimiter`, `TtlCache` and timeout. Don't call
  `fetch` directly from tools. The CLI defaults are deliberately aggressive (16 concurrent, 0 ms
  interval, 5 s cache — operator's explicit choice); `--polite` restores 2/200 ms/60 s. Class-level
  constructor defaults stay gentle (2/200/60 s) for library users. Note Finna is a shared public
  service and `helmet.finna.fi` sits behind a WAF — expect 429s or blocks when running rude.

## Data-source constraints

- The open API has **no holdings** — availability must go through the HTML fragment and
  `src/holdings/parse.ts`.
- Availability is best-effort: results carry `confidence: "parsed" | "link-only"` and a
  `retrievedAt`. Never present availability as a guarantee a copy is on the shelf.
- `includeAvailability` request storms are capped (`enrichWithAvailability`, default 10 hits).
- `availableAt` checks one catalogue page per call (page size capped at 40 so `limit` never promises
  unchecked hits); `scanAllPages` walks the whole result set within a `maxChecks` budget and reports
  `truncated` + `resumeFrom` when it stops early. Availability must never be presented as a
  library-wide inventory unless the scan ran to completion.
- Results are capped at 100 per call; there are no account actions (loans/holds) and no opening
  hours — don't invent tools for them.
- Attribution is required in responses: `Data: Finna / Helmet-kirjastot (CC0)`. Metadata is CC0;
  linked images/resources have their own terms (`imageRights`, `accessRestrictions`).

## Generated code

`src/holdings/branch-registry.generated.ts` is produced by
`scripts/generate-branch-registry.mjs` — **do not edit it by hand**. Change the script and re-run it
instead. `src/holdings/branch-registry.ts` is the hand-written layer on top of it.

## Testing

- Tests must not hit the network. Use `test/fixtures/*.html` and stub clients (see
  `test/server-contract.test.ts`, which drives the real MCP server over `InMemoryTransport`).
- Live tests are gated behind `describe.skipIf(!process.env.HELMET_MCP_LIVE)` — keep new network
  probes there and tolerant of upstream changes.
- Prefer contract-level tests (tool registration, input/output shape, error mapping) over
  implementation details, and add a fixture + parse test when touching HTML parsing.

## Skills

Repo-scoped skill: `.agents/skills/code-review-and-quality` (locked in `skills-lock.json`). Read it
before reviewing or merging a change.
