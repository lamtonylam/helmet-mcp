import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { jsonResult, toolError, withSource } from "../lib/errors.js";
import type { HoldingsClient, AvailabilityResult } from "../holdings/client.js";
import type { HoldingBranch } from "../holdings/parse.js";
import type { HoldingStatus } from "../holdings/status.js";
import { branchInGroup, type BranchRef } from "../holdings/branch-registry.js";
import type { CityKey } from "../finna/helmet.js";
import type { CatalogueHit } from "../finna/normalize.js";

export async function runTool(
  scope: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return jsonResult(withSource(await fn(), scope));
  } catch (error) {
    return toolError(error);
  }
}

export interface AvailabilitySummary {
  confidence: AvailabilityResult["confidence"];
  available: boolean;
  availableCount: number;
  totalCount: number;
  reservations: number;
  branchesWithAvailable: number;
  recordUrl: string;
}

/** Attach availability summaries to catalogue hits, capped to avoid request storms. */
export async function enrichWithAvailability(
  holdings: HoldingsClient,
  hits: CatalogueHit[],
  max = 10,
): Promise<Array<CatalogueHit & { availability?: AvailabilitySummary }>> {
  const toEnrich = hits.slice(0, max);
  const results = await Promise.all(
    toEnrich.map(async (hit) => {
      const availability = await holdings.get(hit.id);
      return { ...hit, availability: toSummary(availability) };
    }),
  );
  return [...results, ...hits.slice(max)];
}

export function toSummary(availability: AvailabilityResult): AvailabilitySummary {
  return {
    confidence: availability.confidence,
    available: availability.summary.availableCount > 0,
    availableCount: availability.summary.availableCount,
    totalCount: availability.summary.totalCount,
    reservations: availability.summary.reservations,
    branchesWithAvailable: availability.summary.branchesWithAvailable,
    recordUrl: availability.recordUrl,
  };
}

export interface AvailableBranchDetail {
  name: string;
  city?: CityKey;
  status: HoldingStatus;
  availableCount?: number;
  dueDate?: string;
}

export type AvailableHit = CatalogueHit & {
  availability: AvailabilitySummary;
  availableBranches: AvailableBranchDetail[];
};

export interface AvailabilityAtResult {
  hits: AvailableHit[];
  /** Hits whose holdings were fetched. */
  checked: number;
  /** Candidate hits before availability filtering. */
  candidates: number;
  /** True when the candidate list was longer than the check cap. */
  truncated: boolean;
  /** Hits whose holdings fragment could not be parsed (availability unknown). */
  unconfirmed: number;
}

/** Minimal shape of one catalogue page, as returned by `searchCatalogue`. */
interface CataloguePage {
  hits: CatalogueHit[];
  resultCount: number;
  hasMore: boolean;
}

export interface ScanAvailabilityOptions {
  /** Branches a hit must be on the shelf at to be kept. */
  group: BranchRef[];
  /** Records per catalogue page. */
  pageSize: number;
  /** First catalogue page to inspect (1-based, default 1). */
  startPage?: number;
  /** Maximum number of holdings lookups for the whole scan. */
  maxChecks: number;
  /** Maximum number of catalogue pages to inspect (default: all). */
  maxPages?: number;
  /** Already-fetched first page, to avoid a duplicate lookup. */
  firstPage?: CataloguePage;
  /** Fetches one page of catalogue hits. */
  fetchPage: (page: number, limit: number) => Promise<CataloguePage>;
}

export interface AvailabilityAtScanResult extends AvailabilityAtResult {
  /** Catalogue pages inspected. */
  pages: number;
  /** Total records matching the query upstream (not the number checked). */
  matching: number;
  /** True when matching records remain that were never checked. */
  exhausted: boolean;
  /** Catalogue page to pass as `page` to continue the scan where it stopped. */
  resumeFrom?: number;
}

/**
 * Check availability for catalogue pages until the whole result set is covered or the
 * check budget runs out. Pages are inspected whole, so `resumeFrom` is always the first
 * page whose hits were not (fully) checked.
 */
export async function scanAvailableAt(
  holdings: HoldingsClient,
  options: ScanAvailabilityOptions,
): Promise<AvailabilityAtScanResult> {
  const { group, pageSize, startPage = 1, maxChecks } = options;
  const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
  let pending = options.firstPage;

  const load = async (target: number): Promise<CataloguePage> => {
    if (pending && target === startPage) {
      const page = pending;
      pending = undefined;
      return page;
    }
    return options.fetchPage(target, pageSize);
  };

  const hits: AvailableHit[] = [];
  let page = startPage;
  let pages = 0;
  let checked = 0;
  let candidates = 0;
  let unconfirmed = 0;
  let matching = 0;
  let exhausted = false;
  let resumeFrom: number | undefined;
  let more = true;

  while (more) {
    const remaining = Math.max(maxChecks - checked, 0);
    // Records the previous page reported as still matching (unknown before the first fetch).
    const recordsLeft = pages > 0 ? Math.max(matching - checked, 0) : undefined;
    const needed = Math.min(pageSize, recordsLeft ?? pageSize);

    // Stop *before* a page that does not fit in the remaining budget (or is beyond `maxPages`)
    // so that the scan can resume from it without skipping or half-checking a page.
    if (pages >= maxPages || remaining < needed) {
      if (more && recordsLeft !== 0) {
        exhausted = true;
        resumeFrom = page;
      }
      break;
    }

    const result = await load(page);
    matching = result.resultCount;
    pages += 1;

    const batch = await filterAvailableAt(holdings, result.hits, group, remaining);
    hits.push(...batch.hits);
    candidates += batch.candidates;
    checked += batch.checked;
    unconfirmed += batch.unconfirmed;
    // Defensive: only possible if a page hands back more hits than it advertised.
    if (batch.truncated) exhausted = true;

    more = result.hasMore && result.hits.length > 0;
    page += 1;
  }

  return {
    hits,
    checked,
    candidates,
    truncated: exhausted,
    unconfirmed,
    pages,
    matching,
    exhausted,
    ...(resumeFrom !== undefined ? { resumeFrom } : {}),
  };
}

function hasOnShelf(branch: HoldingBranch): boolean {
  return (
    branch.status === "available" ||
    (branch.availableCount ?? 0) > 0 ||
    branch.copies.some((copy) => copy.status === "available")
  );
}

function toBranchDetail(branch: HoldingBranch): AvailableBranchDetail {
  return {
    name: branch.name,
    ...(branch.city ? { city: branch.city } : {}),
    status: branch.status,
    ...(branch.availableCount !== undefined ? { availableCount: branch.availableCount } : {}),
    ...(branch.dueDate ? { dueDate: branch.dueDate } : {}),
  };
}

/**
 * Keep the hits that have at least one copy on the shelf in one of the resolved libraries,
 * for a single page of results (checking at most `max` hits).
 */
export async function filterAvailableAt(
  holdings: HoldingsClient,
  hits: CatalogueHit[],
  group: BranchRef[],
  max = 40,
): Promise<AvailabilityAtResult> {
  const candidates = hits.slice(0, max);

  const results = await Promise.all(
    candidates.map(async (hit) => {
      const availability = await holdings.get(hit.id);
      const branches = availability.branches.filter(
        (branch) => branchInGroup(branch.name, group) && hasOnShelf(branch),
      );
      if (branches.length === 0)
        return { hit: undefined, unconfirmed: availability.confidence !== "parsed" };
      return {
        hit: {
          ...hit,
          availability: toSummary(availability),
          availableBranches: branches.map(toBranchDetail),
        },
        unconfirmed: false,
      };
    }),
  );

  return {
    hits: results.flatMap((result) => (result.hit ? [result.hit] : [])),
    checked: candidates.length,
    candidates: hits.length,
    truncated: hits.length > candidates.length,
    unconfirmed: results.filter((result) => result.unconfirmed).length,
  };
}
