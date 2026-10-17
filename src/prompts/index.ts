import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "find_book",
    {
      title: "Find a book or item in Helmet",
      description: "Search the Helmet catalogue and present a shortlist with availability.",
      argsSchema: {
        description: z.string().describe("What to find (title, author, topic, or a mix)"),
        format: z.string().optional().describe("Preferred format, e.g. book, audiobook, cd, dvd"),
        branch: z
          .string()
          .optional()
          .describe("Library the item must be on the shelf at, e.g. Oodi"),
      },
    },
    ({ description, format, branch }) =>
      userMessage(
        [
          `Find "${description}" in the Finnish Helmet-kirjastot collection${format ? ` (prefer format: ${format})` : ""}${
            branch ? `, on the shelf at ${branch}` : ""
          }.`,
          "",
          "Steps:",
          "1. Call get_facets to understand available formats/languages if the request is broad.",
          branch
            ? `2. Call search_catalogue with the best query and availableAt="${branch}" to get only items on the shelf there. When the request is 'what does this library have on X?', add scanAllPages=true — one page is not the full answer.`
            : "2. Call search_catalogue with the best query and filters; set includeAvailability=true.",
          "3. Present the top 3-5 matches with title, author, year, format, and per-branch availability.",
          "4. Be honest about availability (report the retrievedAt status); include recordUrl links.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "reading_recommendation",
    {
      title: "Recommend reading from Helmet",
      description: "Suggest items from Helmet for a mood/genre/topic and refine with facets.",
      argsSchema: {
        mood: z.string().describe("Mood, genre, theme or audience"),
        format: z.string().optional(),
      },
    },
    ({ mood, format }) =>
      userMessage(
        [
          `Recommend library items from Helmet for: ${mood}${format ? ` (format: ${format})` : ""}.`,
          "",
          "Use get_facets and search_catalogue (with several varied queries), then suggest 5 items",
          "with a one-line reason each and note availability where relevant.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "cite_this",
    {
      title: "Cite a Helmet record",
      description: "Resolve a record and produce a citation in a requested style.",
      argsSchema: {
        queryOrId: z.string().describe("A Helmet record id (helmet.NNN) or a search description"),
        style: z.string().optional().describe("apa, mla, chicago, bibtex, ris, or endnote"),
      },
    },
    ({ queryOrId, style }) =>
      userMessage(
        [
          `Cite this Helmet item: ${queryOrId}${style ? ` in ${style} style` : ""}.`,
          "",
          "If it is not already a helmet.NNN id, use search_catalogue to resolve it first, then call",
          "format_citation. Return the citation text and the recordUrl.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "check_availability",
    {
      title: "Check whether an item is available",
      description: "Resolve an item and report real-time branch availability.",
      argsSchema: {
        titleOrId: z.string().describe("A Helmet record id or a title/author description"),
        branch: z.string().optional().describe("Branch name to focus on, e.g. Oodi"),
      },
    },
    ({ titleOrId, branch }) =>
      userMessage(
        [
          `Is this available at Helmet${branch ? ` (prefer branch: ${branch})` : ""}? ${titleOrId}`,
          "",
          branch
            ? [
                `If it is a title, call search_catalogue with availableAt="${branch}" first; if that returns nothing, the item is not on the shelf there — say so.`,
                "A single page of hits is checked by default, so compare `availableAt.checked` with",
                "`availableAt.matching`; while they differ, continue with `page` (or set",
                'scanAllPages=true) before concluding the branch has none. For "does it have any X?"',
                "questions prefer scanAllPages=true.",
              ].join("\n")
            : "Resolve to a helmet.NNN id (search_catalogue) if needed.",
          "Then call get_availability for the full copy counts and branch statuses.",
          "Report the total/available copies, hold queue, and the status of relevant branches.",
          "If confidence is link-only, say so and give the recordUrl.",
        ].join("\n"),
      ),
  );
}
