import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { searchCatalogue, FACET_FIELDS, type FacetField } from "../finna/search.js";
import { SEARCH_TYPES } from "../finna/helmet.js";
import { runTool } from "./helpers.js";

export function registerGetFacets(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_facets",
    {
      title: "Get catalogue facets for a query",
      description:
        "Return facet counts (format, language, building, author) for a Helmet search query. " +
        "Use this to disambiguate an open-ended request before searching.",
      inputSchema: {
        query: z
          .string()
          .describe("Search terms to facet on; use an empty string for the whole scope"),
        searchType: z.enum(SEARCH_TYPES).optional(),
        facetFields: z
          .array(z.enum(FACET_FIELDS))
          .optional()
          .describe("Facets to return (default: format, language)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const facetFields: FacetField[] = args.facetFields ?? ["format", "language"];
        const result = await searchCatalogue(
          ctx.finna,
          {
            query: args.query,
            searchType: args.searchType,
            limit: 0,
            includeFacets: facetFields,
          },
          ctx.org,
        );
        return { query: args.query, resultCount: result.resultCount, facets: result.facets };
      }),
  );
}
