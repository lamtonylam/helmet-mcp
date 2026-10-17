import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
import { registerSearchCatalogue } from "./tools/search-catalogue.js";
import { registerGetRecord } from "./tools/get-record.js";
import { registerGetAvailability } from "./tools/get-availability.js";
import { registerGetFacets } from "./tools/get-facets.js";
import { registerListLocations } from "./tools/list-locations.js";
import { registerFormatCitation } from "./tools/format-citation.js";
import { registerSearchAuthor } from "./tools/search-author.js";
import { registerGetOnlineAccess } from "./tools/get-online-access.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

export const SERVER_NAME = "helmet-mcp";
export const SERVER_VERSION = "0.1.0";

export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      title: "Helmet-kirjastot MCP",
    },
    { capabilities: { logging: {} } },
  );

  registerSearchCatalogue(server, ctx);
  registerGetRecord(server, ctx);
  registerGetAvailability(server, ctx);
  registerGetFacets(server, ctx);
  registerListLocations(server, ctx);
  registerFormatCitation(server, ctx);
  registerSearchAuthor(server, ctx);
  registerGetOnlineAccess(server, ctx);

  registerResources(server, ctx);
  registerPrompts(server);

  return server;
}
