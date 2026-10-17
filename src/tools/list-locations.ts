import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { CITY_CODES, CITY_KEYS, CITY_LABELS, type CityKey } from "../finna/helmet.js";
import { KNOWN_BRANCHES } from "../holdings/branch-registry.js";
import { runTool } from "./helpers.js";

export function registerListLocations(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_locations",
    {
      title: "List Helmet libraries and cities",
      description:
        "List the Helmet-kirjastot member cities and their known branches, with the Finna building " +
        "codes used for filtering searches.",
      inputSchema: {
        city: z.enum(CITY_KEYS).optional().describe("Limit the branch list to one city"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const cities = (Object.keys(CITY_CODES) as CityKey[]).map((key) => ({
          city: key,
          name: CITY_LABELS[key],
          buildingCode: CITY_CODES[key],
        }));
        const branches = KNOWN_BRANCHES.filter(
          (branch) => !args.city || branch.city === args.city,
        ).map((branch) => ({
          name: branch.name,
          city: branch.city,
          ...(branch.buildingCode ? { buildingCode: branch.buildingCode } : {}),
        }));
        return { scope: ctx.org, cities, branches };
      }),
  );
}
