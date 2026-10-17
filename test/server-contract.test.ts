import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { FinnaClient } from "../src/finna/client.js";
import { HoldingsClient } from "../src/holdings/client.js";
import type { ServerContext } from "../src/context.js";

const SEARCH_RESPONSE = {
  status: "OK",
  resultCount: 1,
  records: [
    {
      id: "helmet.1",
      title: "Testikirja",
      year: "2020",
      nonPresenterAuthors: [{ name: "Testaaja, Teuvo" }],
      formats: [{ value: "0/Book/", translated: "Kirja" }],
      buildings: [
        { value: "0/Helmet/", translated: "Helmet-kirjastot" },
        { value: "1/Helmet/h/", translated: "Helsinki" },
      ],
      languages: ["fin"],
      onlineUrls: [],
    },
  ],
  facets: { format: [{ value: "0/Book/", translated: "Kirja", count: 1 }] },
};

const AUTHORITY_RESPONSE = {
  status: "OK",
  resultCount: 1,
  records: [{ id: "authority.1", title: "Testaaja, Teuvo", institutions: ["Helmet"] }],
};

function stubContext(): ServerContext {
  const finna = new FinnaClient();
  (finna as unknown as { get: unknown }).get = async (path: string) => {
    if (path === "search") return SEARCH_RESPONSE;
    if (path === "record") return { status: "OK", records: SEARCH_RESPONSE.records };
    if (path === "authority/search") return AUTHORITY_RESPONSE;
    throw new Error(`unexpected Finna path: ${path}`);
  };

  const holdings = new HoldingsClient();
  (holdings as unknown as { get: unknown }).get = async (id: string) => ({
    id,
    recordUrl: `https://helmet.finna.fi/Record/${id}`,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    confidence: "parsed",
    summary: { availableCount: 1, totalCount: 2, reservations: 0, branchesWithAvailable: 1 },
    branches: [
      {
        name: "Oodi",
        city: "helsinki",
        status: "available",
        availableCount: 1,
        copies: [{ status: "available" }],
      },
    ],
  });

  return {
    finna,
    holdings,
    org: "0/Helmet/",
    scopeLabel: "Helmet-kirjastot",
    availabilityEnabled: true,
  };
}

async function connect(
  ctx: ServerContext = stubContext(),
): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

let active: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (active) await active();
  active = undefined;
});

function parseResult(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const first = result.content[0];
  return first?.text ? JSON.parse(first.text) : undefined;
}

describe("MCP server contract", () => {
  it("exposes the expected tools, resources and prompts", async () => {
    const { client, close } = await connect();
    active = close;

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        "format_citation",
        "get_availability",
        "get_facets",
        "get_online_access",
        "get_record",
        "list_locations",
        "search_author",
        "search_catalogue",
      ].sort(),
    );

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain("helmet://about");

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain("check_availability");
  });

  it("runs search_catalogue and returns normalized hits", async () => {
    const { client, close } = await connect();
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: { query: "test", includeAvailability: true },
    });
    const body = parseResult(result as never) as {
      resultCount: number;
      hits: Array<{ id: string; recordUrl: string; availability?: { availableCount: number } }>;
      source: { scope: string };
    };
    expect(body.resultCount).toBe(1);
    expect(body.hits[0]?.id).toBe("helmet.1");
    expect(body.hits[0]?.recordUrl).toBe("https://helmet.finna.fi/Record/helmet.1");
    expect(body.hits[0]?.availability?.availableCount).toBe(1);
    expect(body.source.scope).toBe("Helmet-kirjastot");
  });

  it("filters search results to items available at the requested library", async () => {
    const { client, close } = await connect();
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: { query: "test", availableAt: "Oodi" },
    });
    const body = parseResult(result as never) as {
      resultCount: number;
      availableCount: number;
      availableAt: {
        query: string;
        libraries: Array<{ name: string; buildingCode?: string }>;
        checked: number;
        truncated: boolean;
      };
      hits: Array<{
        id: string;
        availability: { availableCount: number };
        availableBranches: Array<{ name: string; status: string }>;
      }>;
    };
    expect(body.availableAt.libraries.map((library) => library.buildingCode)).toEqual([
      "2/Helmet/h/h00/",
      "2/Helmet/h/h00l/",
    ]);
    expect(body.availableAt.checked).toBe(1);
    expect(body.availableCount).toBe(1);
    expect(body.hits[0]?.id).toBe("helmet.1");
    expect(body.hits[0]?.availableBranches[0]?.name).toBe("Oodi");
  });

  it("drops hits that are not on the shelf at the requested library", async () => {
    const ctx = stubContext();
    (ctx.holdings as unknown as { get: unknown }).get = async (id: string) => ({
      id,
      recordUrl: `https://helmet.finna.fi/Record/${id}`,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      confidence: "parsed",
      summary: { availableCount: 0, totalCount: 2, reservations: 1, branchesWithAvailable: 0 },
      branches: [
        {
          name: "Oodi",
          city: "helsinki",
          status: "on_loan",
          copies: [{ status: "on_loan" }],
        },
      ],
    });
    const { client, close } = await connect(ctx);
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: { query: "test", availableAt: "Oodi" },
    });
    const body = parseResult(result as never) as { availableCount: number; hits: unknown[] };
    expect(body.availableCount).toBe(0);
    expect(body.hits).toEqual([]);
  });

  it("rejects an unknown availableAt branch", async () => {
    const { client, close } = await connect();
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: { query: "test", availableAt: "Atlantis" },
    });
    expect(result.isError).toBe(true);
    const body = parseResult(result as never) as { error: { code: string; hints: string[] } };
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.hints.join(" ")).toContain("list_locations");
  });

  it("runs get_availability", async () => {
    const { client, close } = await connect();
    active = close;

    const result = await client.callTool({
      name: "get_availability",
      arguments: { id: "helmet.1" },
    });
    const body = parseResult(result as never) as {
      results: Array<{
        id: string;
        confidence: string;
        branches: Array<{ name: string; city: string }>;
      }>;
    };
    expect(body.results[0]?.id).toBe("helmet.1");
    expect(body.results[0]?.confidence).toBe("parsed");
    expect(body.results[0]?.branches[0]?.city).toBe("helsinki");
  });

  it("validates get_availability input", async () => {
    const { client, close } = await connect();
    active = close;

    const result = await client.callTool({ name: "get_availability", arguments: {} });
    expect(result.isError).toBe(true);
    const body = parseResult(result as never) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_request");
  });

  it("reads a resource", async () => {
    const { client, close } = await connect();
    active = close;

    const resource = await client.readResource({ uri: "helmet://about" });
    expect(resource.contents[0]?.text).toContain("Helmet-kirjastot");
  });

  it("caps the checked page so `limit` never promises unchecked hits", async () => {
    const { client, close } = await connect();
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: { query: "test", availableAt: "Oodi", limit: 100 },
    });
    const body = parseResult(result as never) as {
      limit: number;
      availableAt: { matching: number; checked: number; pages: number; truncated: boolean };
    };
    expect(body.limit).toBe(40);
    expect(body.availableAt.matching).toBe(1);
    expect(body.availableAt.checked).toBe(1);
    expect(body.availableAt.pages).toBe(1);
    expect(body.availableAt.truncated).toBe(false);
  });

  it("scans every page of matching records with scanAllPages", async () => {
    const { ctx, checked } = pagingContext(3, new Set(["helmet.2"]));
    const { client, close } = await connect(ctx);
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: { query: "test", availableAt: "Oodi", limit: 2, scanAllPages: true },
    });
    const body = parseResult(result as never) as {
      availableCount: number;
      hasMore: boolean;
      hits: Array<{ id: string }>;
      availableAt: {
        matching: number;
        checked: number;
        candidates: number;
        pages: number;
        truncated: boolean;
        resumeFrom?: number;
        note?: string;
      };
    };
    // The second page is only reached because the scan keeps going past page 1.
    expect(body.hits.map((hit) => hit.id)).toEqual(["helmet.1", "helmet.3"]);
    expect(body.availableCount).toBe(2);
    expect(body.availableAt.matching).toBe(3);
    expect(body.availableAt.checked).toBe(3);
    expect(body.availableAt.candidates).toBe(3);
    expect(body.availableAt.pages).toBe(2);
    expect(body.availableAt.truncated).toBe(false);
    expect(body.availableAt.resumeFrom).toBeUndefined();
    expect(body.availableAt.note).toBeUndefined();
    expect(body.hasMore).toBe(false);
    expect(checked).toEqual(["helmet.1", "helmet.2", "helmet.3"]);
  });

  it("stops a scan at the check budget and says where to resume", async () => {
    const { ctx } = pagingContext(3);
    const { client, close } = await connect(ctx);
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: {
        query: "test",
        availableAt: "Oodi",
        limit: 1,
        scanAllPages: true,
        maxChecks: 2,
      },
    });
    const body = parseResult(result as never) as {
      hasMore: boolean;
      availableAt: {
        matching: number;
        checked: number;
        pages: number;
        truncated: boolean;
        resumeFrom?: number;
        note?: string;
      };
    };
    expect(body.availableAt.checked).toBe(2);
    expect(body.availableAt.matching).toBe(3);
    expect(body.availableAt.pages).toBe(2);
    expect(body.availableAt.truncated).toBe(true);
    expect(body.availableAt.resumeFrom).toBe(3);
    expect(body.availableAt.note).toContain("pass page: 3");
    expect(body.hasMore).toBe(true);
  });

  it("never sizes a scan page larger than the check budget", async () => {
    const { ctx } = pagingContext(3);
    const { client, close } = await connect(ctx);
    active = close;

    const result = await client.callTool({
      name: "search_catalogue",
      arguments: {
        query: "test",
        availableAt: "Oodi",
        limit: 100,
        scanAllPages: true,
        maxChecks: 1,
      },
    });
    const body = parseResult(result as never) as {
      limit: number;
      availableAt: { checked: number; pages: number; resumeFrom?: number; note?: string };
    };
    expect(body.limit).toBe(1);
    expect(body.availableAt.checked).toBe(1);
    expect(body.availableAt.pages).toBe(1);
    expect(body.availableAt.resumeFrom).toBe(2);
    expect(body.availableAt.note).toContain("Checked 1 of 3");
  });
});

/** Stub context whose catalogue holds `total` records, spread over 20-per-page-independent pages. */
function pagingContext(
  total: number,
  unavailable: Set<string> = new Set(),
): { ctx: ServerContext; checked: string[] } {
  const finna = new FinnaClient();
  (finna as unknown as { get: unknown }).get = async (
    path: string,
    params: { page?: number; limit?: number } = {},
  ) => {
    if (path !== "search") throw new Error(`unexpected Finna path: ${path}`);
    const page = Number(params.page ?? 1);
    const limit = Number(params.limit ?? 20);
    const start = (page - 1) * limit;
    const records = Array.from({ length: Math.max(Math.min(limit, total - start), 0) }, (_, i) => ({
      id: `helmet.${start + i + 1}`,
      title: `Test ${start + i + 1}`,
      year: "2020",
      formats: [{ value: "0/Game/", translated: "Peli" }],
      buildings: [{ value: "2/Helmet/h/h00/", translated: "Oodi" }],
      languages: ["fin"],
      onlineUrls: [],
    }));
    return { status: "OK", resultCount: total, records, facets: {} };
  };

  const checked: string[] = [];
  const holdings = new HoldingsClient();
  (holdings as unknown as { get: unknown }).get = async (id: string) => {
    checked.push(id);
    const onShelf = !unavailable.has(id);
    return {
      id,
      recordUrl: `https://helmet.finna.fi/Record/${id}`,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      confidence: "parsed",
      summary: {
        availableCount: onShelf ? 1 : 0,
        totalCount: 1,
        reservations: 0,
        branchesWithAvailable: onShelf ? 1 : 0,
      },
      branches: [
        {
          name: "Oodi",
          city: "helsinki",
          status: onShelf ? "available" : "on_loan",
          ...(onShelf ? { availableCount: 1 } : {}),
          copies: [{ status: onShelf ? "available" : "on_loan" }],
        },
      ],
    };
  };

  return {
    ctx: {
      finna,
      holdings,
      org: "0/Helmet/",
      scopeLabel: "Helmet-kirjastot",
      availabilityEnabled: true,
    },
    checked,
  };
}
