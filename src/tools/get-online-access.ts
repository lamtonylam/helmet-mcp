import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { getRecord } from "../finna/record.js";
import { runTool } from "./helpers.js";

export function registerGetOnlineAccess(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_online_access",
    {
      title: "Get online access links for a record",
      description:
        "Return the online/e-resource links for a Helmet record, plus usage-rights notes. Useful " +
        "for answering whether an item can be accessed online.",
      inputSchema: {
        id: z.string().min(1).describe("Helmet record id"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runTool(ctx.scopeLabel, async () => {
        const record = await getRecord(ctx.finna, args.id);
        const links = [...record.onlineUrls, ...record.urls]
          .filter((link) => link.url)
          .map((link) => ({ url: link.url, label: link.text ?? link.title ?? link.url }));
        return {
          id: args.id,
          recordUrl: record.recordUrl,
          online: record.online,
          links,
          imageRights: record.imageRights,
        };
      }),
  );
}
