import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { searchAuthority } from "../finna/authority.js";
import { runTool } from "./helpers.js";

export function registerSearchAuthor(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "search_author",
    {
      title: "Search the Finna authority index",
      description:
        "Look up authors, subjects and other authority headings to find the canonical form to " +
        "use as a `query` with searchType=Author.",
      inputSchema: {
        name: z.string().min(1).describe("Name or heading to look up"),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const result = await searchAuthority(ctx.finna, args.name, args.limit ?? 10);
        return { query: args.name, resultCount: result.resultCount, hits: result.hits };
      }),
  );
}
