import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import {
  CITY_CODES,
  CITY_LABELS,
  FORMATS,
  SEARCH_TYPES,
  SORT_KEYS,
  type CityKey,
} from "../finna/helmet.js";
import { KNOWN_BRANCHES } from "../holdings/branch-registry.js";
import { ATTRIBUTION } from "../lib/errors.js";

const MIME = "text/markdown";

function markdown(text: string): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  return { contents: [{ uri: "", mimeType: MIME, text }] };
}

export function registerResources(server: McpServer, ctx: ServerContext): void {
  const resource = (
    name: string,
    uri: string,
    title: string,
    description: string,
    body: () => string,
  ): void => {
    server.registerResource(name, uri, { title, description, mimeType: MIME }, async (url) => {
      const result = markdown(body());
      result.contents[0]!.uri = url.href;
      return result;
    });
  };

  resource(
    "about",
    "helmet://about",
    "About the Helmet libraries",
    "What Helmet is, coverage and licensing.",
    () =>
      [
        "# Helmet-kirjastot",
        "",
        "Helmet is the shared public library network of the Helsinki metropolitan area:",
        "Helsinki, Espoo, Vantaa and Kauniainen. Its online catalogue is at https://helmet.finna.fi",
        "(helmet.fi redirects there) and is powered by Finna.",
        "",
        `Search scope: \`${ctx.org}\` (Helmet-kirjastot).`,
        "",
        "Catalogue data comes from the Finna open API (api.finna.fi). Availability comes from the",
        "Finna record holdings tab and is reported as observed at fetch time.",
        "",
        `Licensing: ${ATTRIBUTION}. Metadata is CC0; linked images/resources have their own terms.`,
        "",
        "Not available via this server: loans, renewals, holds (account actions) and opening hours.",
      ].join("\n"),
  );

  resource(
    "formats",
    "helmet://formats",
    "Format aliases and Finna codes",
    "Format aliases accepted by search_catalogue mapped to Finna format codes.",
    () =>
      [
        "# Formats",
        "",
        "| alias | Finna code | Finnish | English |",
        "| --- | --- | --- | --- |",
        ...Object.entries(FORMATS).map(
          ([alias, def]) => `| ${alias} | \`${def.code}\` | ${def.fi} | ${def.en} |`,
        ),
        "",
        "For online/e-materials use `onlineOnly: true` — Helmet e-books mostly live outside the",
        'indexed catalogue, so `online_boolean:"1"` is the reliable signal.',
      ].join("\n"),
  );

  resource(
    "locations",
    "helmet://locations",
    "Helmet cities and branches",
    "Member cities with building codes, plus known branches.",
    () => {
      const byCity = new Map<CityKey, string[]>();
      for (const branch of KNOWN_BRANCHES) {
        const list = byCity.get(branch.city) ?? [];
        list.push(
          branch.buildingCode ? `${branch.name} — \`${branch.buildingCode}\`` : branch.name,
        );
        byCity.set(branch.city, list);
      }
      return [
        "# Helmet locations",
        "",
        "## Cities",
        "",
        ...(Object.keys(CITY_CODES) as CityKey[]).map(
          (key) => `- **${CITY_LABELS[key]}** — building code \`${CITY_CODES[key]}\``,
        ),
        "",
        "## Known branches",
        "",
        ...(Object.keys(CITY_CODES) as CityKey[]).flatMap((key) => [
          `### ${CITY_LABELS[key]}`,
          "",
          (byCity.get(key) ?? []).map((line) => `- ${line}`).join("\n"),
          "",
        ]),
        "Branch names in availability results may include collection suffixes (aik = adults,",
        "las = children, mon = music). Unrecognised names are returned without a city.",
        "",
        "Pass a branch name (or its building code) to `search_catalogue.availableAt` to return",
        "only items currently on the shelf there.",
      ].join("\n");
    },
  );

  resource(
    "search-syntax",
    "helmet://search-syntax",
    "Search syntax reference",
    "Search types, sort keys and filter grammar.",
    () =>
      [
        "# Search syntax",
        "",
        `Search types: ${SEARCH_TYPES.map((type) => `\`${type}\``).join(", ")}.`,
        "",
        `Sort keys: ${SORT_KEYS.map((sort) => `\`${sort}\``).join(", ")}.`,
        "",
        'Filters are built for you. Values within one field are OR-ed (`~field:"v"`); different',
        "fields are AND-ed. Examples of the underlying Finna filters:",
        "",
        '- `building:"0/Helmet/"` — whole network; `1/Helmet/h/` Helsinki, `e/` Espoo, `v/` Vantaa, `k/` Kauniainen',
        '- `format:"0/Book/"`, `format:"1/Book/AudioBook/"`, `format:"1/Sound/CD/"`, `format:"1/Video/DVD/"`',
        '- `language:"fin"`, `author:"Lönnrot, Elias"`',
        '- `online_boolean:"1"` — online resources',
        '- `publishDate:"[2020 TO 2025]"` — publication year range',
        "",
        "Pagination: `page` (1-based) and `limit` (max 100). Large result sets expose a",
        "resumption token via the API, but this server caps results per call.",
        "",
        "## On the shelf at one library",
        "",
        '`search_catalogue.availableAt` accepts a branch name ("Oodi", "Tikkurila") or a full',
        "building code. It narrows the query with that library's `building:` codes (plus its child",
        "collections) and keeps only hits with a copy on the shelf there. See `helmet://locations`",
        "for the branch names and codes. The response's `availableAt` block reports `matching`",
        "(records the query matched), `candidates`/`checked` (page hits considered vs. holdings",
        "fetched), `pages`, `truncated` and `unconfirmed`.",
        "",
        "By default only the current page is checked (page size capped at 40). Add",
        "`scanAllPages: true` to keep paging until every matching record has been checked (up to",
        '`maxChecks`, default 200) — that is the only way to answer "which of these does this',
        'library have on the shelf?" for a whole result set. It costs one holdings request per',
        "record. When the budget runs out, `availableAt.truncated` is true and `resumeFrom` names",
        "the page to continue from.",
      ].join("\n"),
  );

  resource(
    "api-notes",
    "helmet://api-notes",
    "Data sources, terms and caveats",
    "Terms of use, attribution, rate limits and known gaps.",
    () =>
      [
        "# API notes",
        "",
        "## Sources",
        "",
        "- Catalogue: `https://api.finna.fi/api/v1/` (search, record, authority, list)",
        "- Availability: `https://helmet.finna.fi/Record/<id>/AjaxTab?tab=holdings` (HTML fragment)",
        "",
        "## Terms & attribution",
        "",
        `${ATTRIBUTION}. Finna metadata is licensed CC0 1.0. The licence does not cover linked`,
        "images or resources (`images`, `urls`, `onlineUrls`) — check `imageRights` and",
        "`accessRestrictions`. Mention Finna and the producing organisations when reusing data.",
        "",
        "## Polite use",
        "",
        "This server identifies itself with a descriptive User-Agent and caches responses.",
        "By default it runs aggressively towards the shared Finna services (high concurrency,",
        "no minimum interval, short cache); the operator can tune this via",
        "--concurrency/--min-interval/--cache-ttl/--timeout or restore the gentle posture with",
        "--polite. Availability data is real-time, so a short TTL trades politeness for",
        "freshness, not correctness.",
        "",
        "## Known gaps",
        "",
        "- No account actions: loans, renewals and holds require login and have no public API.",
        "- No opening hours in the open API.",
        "- Availability is best-effort parsing; read the `confidence` field. `link-only` means the",
        "  fragment could not be parsed — use `recordUrl` to check manually.",
      ].join("\n"),
  );
}
