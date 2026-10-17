import { describe, expect, it } from "vitest";
import { FinnaClient } from "../src/finna/client.js";
import { searchCatalogue } from "../src/finna/search.js";
import { getRecord } from "../src/finna/record.js";
import { HoldingsClient } from "../src/holdings/client.js";
import { branchInGroup, resolveBranchGroup } from "../src/holdings/branch-registry.js";

const live = process.env.HELMET_MCP_LIVE === "1";

describe.skipIf(!live)("live Finna API", () => {
  const finna = new FinnaClient();
  const holdings = new HoldingsClient();

  it("searches the Helmet catalogue", async () => {
    const result = await searchCatalogue(finna, {
      query: "Tuntematon sotilas",
      searchType: "Title",
      limit: 3,
    });
    expect(result.resultCount).toBeGreaterThan(0);
    expect(result.hits[0]?.id).toMatch(/^helmet\./);
    expect(result.hits[0]?.recordUrl).toContain("helmet.finna.fi");
  });

  it("fetches a record", async () => {
    const record = await getRecord(finna, "helmet.2326140");
    expect(record.title.length).toBeGreaterThan(0);
  });

  it("narrows a search to a branch's building codes", async () => {
    const group = resolveBranchGroup("Oodi");
    const branchCodes = group.flatMap((ref) => (ref.buildingCode ? [ref.buildingCode] : []));
    expect(branchCodes).toEqual(["2/Helmet/h/h00/", "2/Helmet/h/h00l/"]);

    const result = await searchCatalogue(finna, {
      query: "Tuntematon sotilas",
      searchType: "Title",
      branchCodes,
      limit: 5,
    });
    expect(result.hits.length).toBeGreaterThan(0);

    const withOodi = await Promise.all(result.hits.map((hit) => holdings.get(hit.id)));
    expect(
      withOodi.some((availability) =>
        availability.branches.some((branch) => branchInGroup(branch.name, group)),
      ),
    ).toBe(true);
  });

  it("parses availability with cities", async () => {
    const availability = await holdings.get("helmet.2326140");
    expect(availability.confidence).toBe("parsed");
    expect(availability.summary.totalCount).toBeGreaterThan(0);
    expect(availability.branches.some((branch) => branch.city !== undefined)).toBe(true);
  });
});
