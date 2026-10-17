# helmet-mcp

An [MCP](https://modelcontextprotocol.io) server for the **Finnish Helmet-kirjastot** public
libraries — the shared library network of Helsinki, Espoo, Vantaa and Kauniainen.

It lets an AI assistant search the catalogue (`helmet.finna.fi`) and check **real-time branch
availability**: how many copies exist, how many are on the shelf, the hold queue, and per-branch
status (available / on loan / in transit / lost / overdue).

## Data sources

- **Catalogue** — the [Finna open API](https://api.finna.fi/api/v1/) (`search`, `record`, `authority`).
  Metadata is CC0.
- **Availability** — the Finna record UI's holdings fragment
  (`helmet.finna.fi/Record/<id>/AjaxTab?tab=holdings`), parsed from server-rendered HTML. The open API
  does not expose holdings.

## Install & configure

```jsonc
{
  "mcpServers": {
    "helmet": {
      "command": "npx",
      "args": ["-y", "helmet-mcp"],
    },
  },
}
```

Or from a checkout:

```bash
npm install
npm run build
node dist/index.js
```

### CLI options

```
--http                 Serve MCP over Streamable HTTP instead of stdio
--port <number>        HTTP port (default 3000)
--org <buildingCode>   Finna building code to scope searches (default 0/Helmet/)
--no-availability      Disable real-time availability lookups
--user-agent <value>   Custom User-Agent sent to Finna
--log-level <level>    debug | info | warn | error (default info)
```

HTTP mode exposes `POST /mcp` (and `GET /health`) on `127.0.0.1`.

## Tools

| Tool                | Purpose                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_catalogue`  | Search books, audiobooks, music, video, games, magazines, maps, online resources. Filters by format, language, city, branch, year; optional facets; `availableAt` returns only items on the shelf at a given library (`scanAllPages` checks the whole result set, not just one page). |
| `get_record`        | Full bibliographic record: authors, subjects, summary, ISBN, series, table of contents, links.                                                                                                                                                                                        |
| `get_availability`  | Real-time availability for one or more records: totals, hold queue, per-branch status.                                                                                                                                                                                                |
| `get_facets`        | Facet counts (format, language, building, author) for a query.                                                                                                                                                                                                                        |
| `list_locations`    | Helmet cities and known branches with their building codes.                                                                                                                                                                                                                           |
| `search_author`     | Look up authors/subjects in the Finna authority index.                                                                                                                                                                                                                                |
| `get_online_access` | Online/e-resource links plus usage-rights notes.                                                                                                                                                                                                                                      |
| `format_citation`   | APA, MLA, Chicago, BibTeX, RIS or EndNote citation.                                                                                                                                                                                                                                   |

### Example

```jsonc
// search_catalogue
{
  "query": "Tuntematon sotilas",
  "searchType": "Title",
  "formats": ["audiobook"],
  "cities": ["espoo", "helsinki"],
  "includeAvailability": true,
}
```

```jsonc
// search_catalogue — only what is on the shelf right now at one library
{ "query": "Tuntematon sotilas", "searchType": "Title", "availableAt": "Oodi" }
// -> { availableAt: { libraries: [ { name: "Oodi", buildingCode: "2/Helmet/h/h00/" }, … ], checked: 5 },
//      availableCount: 1,
//      hits: [ { id: "helmet.2326140",
//                availableBranches: [ { name: "Oodi", status: "available", availableCount: 1 } ] } ] }
```

```jsonc
// get_availability
{ "id": "helmet.2326140" }
// -> { summary: { availableCount: 10, totalCount: 14, reservations: 0, branchesWithAvailable: 8 },
//      branches: [ { name: "Oodi", city: "helsinki", status: "available", availableCount: 1 }, ... ] }
```

## Resources

- `helmet://about` — what Helmet is, coverage, licensing
- `helmet://formats` — format aliases and Finna codes
- `helmet://locations` — cities and branches
- `helmet://search-syntax` — search types, sorts, filter grammar
- `helmet://api-notes` — terms, attribution, rate limits, known gaps

## Prompts

`find_book`, `reading_recommendation`, `cite_this`, `check_availability`.

### Finding what is on the shelf at one library

`search_catalogue` accepts `availableAt`, a branch **name** (`"Oodi"`, `"Tikkurila"`) or a full
Finna building code. This narrows the catalogue search to that library's building codes and then
returns only the hits with a copy on the shelf there right now. A library name also pulls in its
collections, e.g. `"Oodi"` matches both `2/Helmet/h/h00/` (Oodi) and `2/Helmet/h/h00l/`
(Oodi lapset); pass `"Oodi lapset"` to target just the children's collection.

Because availability is a second, per-record request, only one page of hits is checked by
default (the page size is capped at 40, so `limit` never promises unchecked hits). The response
reports this in `availableAt`:

- `libraries` — the resolved branch names and building codes
- `matching` — records the query matched upstream, i.e. the pool this page was drawn from
- `candidates` / `checked` — hits considered vs. holdings actually fetched
- `pages` — catalogue pages inspected
- `truncated` — `true` when matching records were left unchecked; `resumeFrom` is the page to
  continue from
- `unconfirmed` — hits whose holdings fragment could not be parsed (availability unknown)

A page can never answer "every book this library has on X". For that, add `scanAllPages: true`:
the tool keeps paging until the result set is covered, checking up to `maxChecks` records
(default 200, max 500) and returning every hit on the shelf at that library. Each check is one
holdings request and the client is rate-limited, so budget tens of seconds on broad queries; when
`maxChecks` runs out the response sets `truncated` and `resumeFrom`, and a follow-up call with
`page: <resumeFrom>` and `scanAllPages: true` continues where it stopped.

## Availability caveats

- Availability is parsed from HTML and reported **as observed**, with a `retrievedAt` timestamp.
- Every result carries a `confidence` field:
  - `parsed` — holdings were read successfully.
  - `link-only` — the fragment could not be parsed; a `recordUrl` is returned instead.
- Availability simply reflects the catalogue. It is not a guarantee that a copy is on the shelf.

## Known limitations

- **No account actions** (loans, renewals, holds) — these require login and have no public API.
- **No opening hours** in the open API.
- Results are capped at 100 per call.

## Development

```bash
npm run typecheck     # tsc --noEmit
npm test              # unit + contract tests (no network)
HELMET_MCP_LIVE=1 npm test   # also run live smoke tests against api.finna.fi
npm run build         # emit dist/
node scripts/generate-branch-registry.mjs   # refresh the branch name -> city registry
```

## Attribution

Data: Finna / Helmet-kirjastot. Finna metadata is licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); linked images and resources have
their own terms (see `imageRights` / `accessRestrictions`).

## License

MIT
