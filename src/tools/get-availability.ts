import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { CITY_KEYS } from "../finna/helmet.js";
import { ToolError } from "../lib/errors.js";
import { runTool, toSummary } from "./helpers.js";

export function registerGetAvailability(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_availability",
    {
      title: "Check real-time branch availability",
      description:
        "Return real-time availability for one or more Helmet records: total copies, copies " +
        "available, the hold queue, and per-branch status (available, on loan, in transit, lost, …). " +
        "Data is parsed from the Finna record's holdings tab; always read `confidence`.",
      inputSchema: {
        id: z.string().min(1).optional().describe("A single Helmet record id, e.g. helmet.2326140"),
        ids: z.array(z.string().min(1)).optional().describe("Multiple Helmet record ids"),
        city: z.enum(CITY_KEYS).optional().describe("Only return branches in this city"),
        branch: z
          .string()
          .optional()
          .describe("Only return branches whose name contains this string (case-insensitive)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const ids = [...(args.ids ?? []), ...(args.id ? [args.id] : [])];
        if (ids.length === 0) {
          throw new ToolError("invalid_request", "Provide `id` or `ids`.", [
            'Example: get_availability({ id: "helmet.2326140" })',
          ]);
        }
        if (ids.length > 10) {
          throw new ToolError("invalid_request", "At most 10 ids per call.", []);
        }

        const results = await Promise.all(
          ids.map(async (id) => {
            const availability = await ctx.holdings.get(id);
            let branches = availability.branches;
            if (args.city) branches = branches.filter((branch) => branch.city === args.city);
            if (args.branch) {
              const needle = args.branch.toLowerCase();
              branches = branches.filter((branch) => branch.name.toLowerCase().includes(needle));
            }
            return {
              id,
              recordUrl: availability.recordUrl,
              retrievedAt: availability.retrievedAt,
              confidence: availability.confidence,
              summary: toSummary(availability),
              branches,
              ...(availability.note ? { note: availability.note } : {}),
            };
          }),
        );

        return { results };
      }),
  );
}
