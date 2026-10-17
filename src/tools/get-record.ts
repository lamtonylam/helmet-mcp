import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { getRecord } from "../finna/record.js";
import { runTool } from "./helpers.js";

export function registerGetRecord(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_record",
    {
      title: "Get a Helmet catalogue record",
      description:
        "Fetch full bibliographic details for a Helmet record by its id (e.g. helmet.2416183): " +
        "authors, subjects, summary, ISBNs, series, table of contents and online links.",
      inputSchema: {
        id: z.string().min(1).describe("Helmet record id, e.g. helmet.2416183"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Optional explicit Finna field[] list to override the curated default set"),
        includeMarc: z.boolean().optional().describe("Include the raw MARC XML record"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const record = await getRecord(ctx.finna, args.id, {
          fields: args.fields,
          includeMarc: args.includeMarc,
        });
        return { record };
      }),
  );
}
