import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { searchCatalogue, FACET_FIELDS } from "../finna/search.js";
import { CITY_KEYS, FORMAT_ALIASES, SORT_KEYS, SEARCH_TYPES } from "../finna/helmet.js";
import { resolveBranchGroup, suggestBranches } from "../holdings/branch-registry.js";
import { ToolError } from "../lib/errors.js";
import { enrichWithAvailability, scanAvailableAt, runTool } from "./helpers.js";

/** Records checked per call when `availableAt` is used without `scanAllPages`. */
const MAX_PAGE_CHECKS = 40;
/** Default and hard cap for a `scanAllPages` run — each check is one holdings request. */
const DEFAULT_SCAN_CHECKS = 200;
const MAX_SCAN_CHECKS = 500;
const DEFAULT_LIMIT = 20;

export function registerSearchCatalogue(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "search_catalogue",
    {
      title: "Search the Helmet library catalogue",
      description:
        "Search the Finnish Helmet-kirjastot (Helsinki, Espoo, Vantaa, Kauniainen) catalogue for " +
        "books, audiobooks, music, video, games, magazines, maps and online resources. " +
        "Optionally attach real-time branch availability to the top results, or set `availableAt` " +
        "to return only items that are currently on the shelf at a given library. With `availableAt`, " +
        "availability is checked for the current page only — add `scanAllPages: true` to walk the " +
        "whole result set (slower: one holdings request per record).",
      inputSchema: {
        query: z.string().min(1).describe("Search terms; supports AND/OR/NOT and quoted phrases"),
        searchType: z.enum(SEARCH_TYPES).optional(),
        formats: z
          .array(z.enum(FORMAT_ALIASES as [string, ...string[]]))
          .optional()
          .describe("Format aliases, e.g. book, audiobook, cd, dvd, game, magazine, score, map"),
        languages: z.array(z.string()).optional().describe("ISO 639-3 codes, e.g. fin, swe, eng"),
        cities: z
          .array(z.enum(CITY_KEYS))
          .optional()
          .describe("Restrict to one or more member cities (OR)"),
        branch: z.string().optional().describe("Full Finna building code, e.g. 2/Helmet/h/h01/"),
        availableAt: z
          .string()
          .optional()
          .describe(
            "Only return items currently on the shelf at this library, by name (e.g. 'Oodi', " +
              "'Tikkurila') or full building code. Pulls in the library's collections " +
              "(e.g. 'Oodi' also matches 'Oodi lapset'); ignores `branch` and `cities`.",
          ),
        yearFrom: z.number().int().optional(),
        yearTo: z.number().int().optional(),
        onlineOnly: z.boolean().optional().describe("Only items available online"),
        sort: z.enum(SORT_KEYS).optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default 20)"),
        page: z.number().int().min(1).optional(),
        includeFacets: z
          .array(z.enum(FACET_FIELDS))
          .optional()
          .describe("Return facet counts for the query"),
        includeAvailability: z
          .boolean()
          .optional()
          .describe("Attach real-time availability to the top results (extra requests)"),
        scanAllPages: z
          .boolean()
          .optional()
          .describe(
            "With `availableAt`: keep paging through the catalogue result set instead of " +
              "checking only the current page, so the returned items are all the matching records " +
              "on the shelf at that library (up to `maxChecks`). One holdings request per record, " +
              "so it can take tens of seconds on broad queries.",
          ),
        maxChecks: z
          .number()
          .int()
          .min(1)
          .max(MAX_SCAN_CHECKS)
          .optional()
          .describe(
            `Holdings lookups allowed during a scanAllPages run (default ${DEFAULT_SCAN_CHECKS}, max ${MAX_SCAN_CHECKS})`,
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const group = args.availableAt ? resolveBranchGroup(args.availableAt) : undefined;
        if (args.availableAt && (!group || group.length === 0)) {
          const suggestions = suggestBranches(args.availableAt);
          throw new ToolError(
            "invalid_request",
            `No Helmet branch matched "${args.availableAt}".`,
            [
              "Use list_locations to see branch names and building codes.",
              ...(suggestions.length > 0 ? [`Did you mean: ${suggestions.join(", ")}?`] : []),
            ],
          );
        }
        if (group && !ctx.availabilityEnabled) {
          throw new ToolError(
            "availability_disabled",
            "`availableAt` needs real-time availability, which is disabled (--no-availability).",
            ["Restart the server without --no-availability to use this filter."],
          );
        }

        const branchCodes = group
          ?.map((ref) => ref.buildingCode)
          .filter((code): code is string => Boolean(code));
        const usingBranchCodes = branchCodes !== undefined && branchCodes.length > 0;
        const fallbackCities = group ? [...new Set(group.map((ref) => ref.city))] : undefined;

        // Without `scanAllPages` only one page is checked, so keep the page small enough to
        // check it completely — otherwise `limit` would promise hits that were never looked at.
        const scanning = args.scanAllPages === true && group !== undefined;
        const maxChecks = group
          ? scanning
            ? Math.min(args.maxChecks ?? DEFAULT_SCAN_CHECKS, MAX_SCAN_CHECKS)
            : MAX_PAGE_CHECKS
          : 0;
        const pageSize = group
          ? Math.min(args.limit ?? DEFAULT_LIMIT, maxChecks)
          : (args.limit ?? DEFAULT_LIMIT);

        const searchParams = {
          query: args.query,
          searchType: args.searchType,
          formats: args.formats,
          languages: args.languages,
          branch: args.availableAt ? undefined : args.branch,
          branchCodes: usingBranchCodes ? branchCodes : undefined,
          cities: args.availableAt ? (usingBranchCodes ? undefined : fallbackCities) : args.cities,
          yearFrom: args.yearFrom,
          yearTo: args.yearTo,
          onlineOnly: args.onlineOnly,
          sort: args.sort,
          limit: pageSize,
          page: args.page,
          includeFacets: args.includeFacets,
        };

        const result = await searchCatalogue(ctx.finna, searchParams, ctx.org);

        if (group) {
          const available = await scanAvailableAt(ctx.holdings, {
            group,
            pageSize,
            startPage: result.page,
            maxChecks,
            ...(scanning ? {} : { maxPages: 1 }),
            firstPage: result,
            fetchPage: (page, limit) =>
              searchCatalogue(ctx.finna, { ...searchParams, page, limit }, ctx.org),
          });

          return {
            query: args.query,
            availableAt: {
              query: args.availableAt,
              libraries: group,
              matching: available.matching,
              candidates: available.candidates,
              checked: available.checked,
              pages: available.pages,
              truncated: available.truncated,
              unconfirmed: available.unconfirmed,
              ...(available.resumeFrom !== undefined ? { resumeFrom: available.resumeFrom } : {}),
              ...(available.exhausted
                ? {
                    note:
                      `Checked ${available.checked} of ${available.matching} matching records; ` +
                      `pass page: ${available.resumeFrom ?? 1} with scanAllPages: true to continue.`,
                  }
                : {}),
            },
            resultCount: result.resultCount,
            availableCount: available.hits.length,
            page: result.page,
            limit: pageSize,
            hasMore: scanning ? available.exhausted : result.hasMore,
            hits: available.hits,
            ...(result.facets.length > 0 ? { facets: result.facets } : {}),
          };
        }

        const hits =
          args.includeAvailability && ctx.availabilityEnabled
            ? await enrichWithAvailability(ctx.holdings, result.hits)
            : result.hits;

        return {
          query: args.query,
          resultCount: result.resultCount,
          page: result.page,
          limit: result.limit,
          hasMore: result.hasMore,
          hits,
          ...(result.facets.length > 0 ? { facets: result.facets } : {}),
        };
      }),
  );
}
