import { afterEach, describe, expect, it, vi } from "vitest";
import { FinnaClient } from "../src/finna/client.js";
import { ToolError } from "../src/lib/errors.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(...responses: Response[]) {
  let calls = 0;
  const queue = [...responses];
  vi.stubGlobal("fetch", async () => {
    calls += 1;
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch call #${calls}`);
    return next;
  });
  return () => calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FinnaClient", () => {
  it("does not retry a permanent HTTP error", async () => {
    const calls = stubFetch(jsonResponse({ statusMessage: "bad" }, 400));
    const client = new FinnaClient({ maxRetries: 3 });

    await expect(client.get("search", { lookfor: "x" })).rejects.toMatchObject({
      code: "upstream_error",
    });
    expect(calls()).toBe(1);
  });

  it("retries a 5xx and then succeeds", async () => {
    const calls = stubFetch(
      jsonResponse({}, 500),
      jsonResponse({ status: "OK", resultCount: 0, records: [] }),
    );
    const client = new FinnaClient();

    const result = await client.get<{ resultCount: number }>("search", { lookfor: "x" });
    expect(result.resultCount).toBe(0);
    expect(calls()).toBe(2);
  });

  it("surfaces Finna's ERROR envelope as invalid_request without retrying", async () => {
    const calls = stubFetch(jsonResponse({ status: "ERROR", statusMessage: "Unknown field" }));
    const client = new FinnaClient();

    const error = await client.get("search").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ToolError);
    expect((error as ToolError).code).toBe("invalid_request");
    expect((error as ToolError).message).toBe("Unknown field");
    expect(calls()).toBe(1);
  });

  it("caches repeated GETs within the TTL", async () => {
    const calls = stubFetch(jsonResponse({ status: "OK", resultCount: 1, records: [] }));
    const client = new FinnaClient();

    await client.get("search", { lookfor: "x" });
    await client.get("search", { lookfor: "x" });
    expect(calls()).toBe(1);
  });

  it("bypasses the cache with noCache", async () => {
    const calls = stubFetch(
      jsonResponse({ status: "OK", resultCount: 1, records: [] }),
      jsonResponse({ status: "OK", resultCount: 2, records: [] }),
    );
    const client = new FinnaClient();

    await client.get("search", { lookfor: "x" });
    const second = await client.get<{ resultCount: number }>(
      "search",
      { lookfor: "x" },
      { noCache: true },
    );
    expect(second.resultCount).toBe(2);
    expect(calls()).toBe(2);
  });
});
