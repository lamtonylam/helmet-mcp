#!/usr/bin/env node
/**
 * Generate the Helmet branch registry (branch name -> city + building codes) from the Finna API.
 *
 * The Finna holdings fragment exposes only human-readable branch names, while the search API
 * filters by `building` code. This samples Helmet records and reads their `buildings` field,
 * which pairs a `2/Helmet/<city>/<code>/` code with a translated branch name, so we can map a
 * user-facing branch name to the codes used for server-side filtering.
 *
 * Pages are fetched through a small concurrency pool (default 6) rather than one at a time, so a
 * full run takes seconds instead of minutes. The pool size is intentionally modest to stay polite
 * to the shared Finna API; lower it with HELMET_MCP_CONCURRENCY=1 if you are rate-limited.
 *
 * Usage: node scripts/generate-branch-registry.mjs [maxPages] [concurrency]
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { format, resolveConfig } from "prettier";

const CITY_BY_CODE = {
  "1/Helmet/h/": "helsinki",
  "1/Helmet/e/": "espoo",
  "1/Helmet/v/": "vantaa",
  "1/Helmet/k/": "kauniainen",
};

const UA = "helmet-mcp/0.1 (library catalogue assistant)";
const BASE = "https://api.finna.fi/api/v1/search";
const PAGE_SIZE = 100;
const MAX_PAGES = Number(process.argv[2] ?? 200);
const CONCURRENCY = Math.max(1, Number(process.env.HELMET_MCP_CONCURRENCY ?? process.argv[3] ?? 6));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(page) {
  const url = new URL(BASE);
  url.searchParams.append("lookfor", "");
  url.searchParams.append("type", "AllFields");
  url.searchParams.append("limit", String(PAGE_SIZE));
  url.searchParams.append("page", String(page));
  url.searchParams.append("filter[]", 'building:"0/Helmet/"');
  url.searchParams.append("field[]", "buildings");
  return url.toString();
}

/** Fetch one page, retrying transient errors (429/5xx, network) with backoff. */
async function fetchPage(page, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(buildUrl(page), {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === attempts) return { error: `HTTP ${response.status}`, page };
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      if (!response.ok) return { error: `HTTP ${response.status}`, page, fatal: true };
      const body = await response.json();
      if (body.status !== "OK") {
        return { error: body.statusMessage ?? "ERROR status", page, fatal: true };
      }
      return { records: body.records ?? [], resultCount: body.resultCount, page };
    } catch (error) {
      if (attempt === attempts) {
        return { error: error instanceof Error ? error.message : String(error), page };
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  return { error: `page ${page} failed`, page };
}

/** Run `worker` over `items` with at most `limit` in flight, preserving result order. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function collect(records, branches) {
  for (const record of records) {
    for (const building of record.buildings ?? []) {
      const match = /^2\/Helmet\/([hevk])\/([^/]+)\/$/.exec(building.value);
      if (!match) continue;
      const city = CITY_BY_CODE[`1/Helmet/${match[1]}/`];
      const name = building.translated?.trim();
      if (!city || !name) continue;
      const key = name.toLowerCase();
      const existing = branches.get(key);
      if (existing) {
        if (existing.city !== city) {
          console.error(`duplicate name across cities: ${name} (${existing.city} vs ${city})`);
        }
        existing.codes.add(building.value);
      } else {
        branches.set(key, { name, city, codes: new Set([building.value]) });
      }
    }
  }
}

async function main() {
  const branches = new Map(); // normalized name -> { name, city, codes: Set<string> }
  let pages = 0;

  // Probe page 1 first: it also tells us how many pages actually exist.
  const first = await fetchPage(1);
  if (first.error) {
    console.error(`page 1: ${first.error}`);
    process.exit(1);
  }
  collect(first.records, branches);
  pages += 1;

  const totalPages = first.resultCount
    ? Math.min(MAX_PAGES, Math.ceil(first.resultCount / PAGE_SIZE))
    : MAX_PAGES;
  const remaining = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2);

  console.error(`sampling up to ${MAX_PAGES} of ${totalPages} pages, concurrency ${CONCURRENCY}`);

  let done = 1;
  const results = await mapLimit(remaining, CONCURRENCY, async (page) => {
    const result = await fetchPage(page);
    if (!result.error) collect(result.records, branches);
    done += 1;
    if (done % 25 === 0 || done === totalPages) {
      console.error(`page ${done}/${totalPages}: ${branches.size} branches`);
    }
    return result;
  });

  for (const result of results) {
    if (result.error) {
      if (result.fatal) break;
      console.error(`page ${result.page}: ${result.error}, skipping`);
      continue;
    }
    if (result.records.length < PAGE_SIZE) break;
    pages += 1;
  }

  const sorted = [...branches.values()].sort(
    (a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name),
  );

  const lines = sorted.map((branch) => {
    const codes = [...branch.codes].sort();
    return `  [${[branch.name.toLowerCase(), branch.city, ...codes]
      .map((part) => JSON.stringify(part))
      .join(", ")}],`;
  });

  const raw = `// Generated by scripts/generate-branch-registry.mjs — do not edit by hand.
// ${sorted.length} Helmet branches sampled from ${pages} pages of the Finna API.
import type { CityKey } from "../finna/helmet.js";

/** Each entry is [name, city, ...buildingCodes]. */
export const GENERATED_BRANCHES: ReadonlyArray<[name: string, city: CityKey, ...codes: string[]]> = [
${lines.join("\n")}
];
`;

  const target = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "holdings",
    "branch-registry.generated.ts",
  );
  // Keep the committed file formatted so `prettier --check` stays green after a refresh.
  const prettierOptions = (await resolveConfig(target)) ?? {};
  const content = await format(raw, { ...prettierOptions, parser: "typescript" });
  writeFileSync(target, content, "utf8");
  console.error(`wrote ${sorted.length} branches to ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
