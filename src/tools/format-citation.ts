import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { getRecord } from "../finna/record.js";
import { CITATION_STYLES, formatCitation } from "../finna/cite.js";
import { runTool } from "./helpers.js";

export function registerFormatCitation(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "format_citation",
    {
      title: "Format a citation for a Helmet record",
      description:
        "Produce a citation (APA, MLA, Chicago, BibTeX, RIS or EndNote) from a Helmet record's metadata.",
      inputSchema: {
        id: z.string().min(1).describe("Helmet record id"),
        style: z.enum(CITATION_STYLES).describe("Citation style"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const record = await getRecord(ctx.finna, args.id);
        return {
          id: args.id,
          style: args.style,
          citation: formatCitation(record, args.style),
          recordUrl: record.recordUrl,
        };
      }),
  );
}
