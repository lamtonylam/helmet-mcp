import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHoldings } from "../src/holdings/parse.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

describe("parseHoldings", () => {
  it("parses totals, holds queue and statuses (available copy)", () => {
    const parsed = parseHoldings(fixture("holdings-available.html"));
    expect(parsed.hasTable).toBe(true);
    expect(parsed.summary).toMatchObject({
      availableCount: 10,
      totalCount: 14,
      reservations: 0,
      branchesWithAvailable: 8,
    });

    const oodi = parsed.branches.find((branch) => branch.name === "Oodi");
    expect(oodi).toBeDefined();
    expect(oodi?.city).toBe("helsinki");
    expect(oodi?.status).toBe("available");
    expect(oodi?.availableCount).toBe(1);

    const lansimaki = parsed.branches.find((branch) => branch.name === "Länsimäki");
    expect(lansimaki?.city).toBe("vantaa");
    expect(lansimaki?.status).toBe("in_transit");

    const noykkio = parsed.branches.find((branch) => branch.name === "Nöykkiö");
    expect(noykkio?.status).toBe("lost");
  });

  it("parses an on-loan/overdue record", () => {
    const parsed = parseHoldings(fixture("holdings-on-loan.html"));
    expect(parsed.summary).toMatchObject({ availableCount: 0, totalCount: 1 });
    expect(parsed.branches).toHaveLength(1);
    expect(parsed.branches[0]?.status).toBe("overdue");
    expect(parsed.branches[0]?.city).toBe("helsinki");
  });

  it("parses mixed availability with due dates and cities", () => {
    const parsed = parseHoldings(fixture("holdings-mixed.html"));
    expect(parsed.summary).toMatchObject({
      availableCount: 6,
      totalCount: 8,
      branchesWithAvailable: 6,
    });

    const isoOmena = parsed.branches.find((branch) => branch.name === "Iso Omena");
    expect(isoOmena?.city).toBe("espoo");
    expect(isoOmena?.status).toBe("on_loan");
    expect(isoOmena?.dueDate).toBe("19.10.2026");

    const ristikko = parsed.branches.find((branch) => branch.name === "Ristikko");
    expect(ristikko?.city).toBe("helsinki");
  });

  it("parses the hold queue", () => {
    const parsed = parseHoldings(fixture("holdings-reserved.html"));
    expect(parsed.summary.reservations).toBe(4);
    expect(parsed.summary.availableCount).toBe(0);
    expect(parsed.branches.every((branch) => branch.status !== "available")).toBe(true);
  });

  it("returns an empty result for a non-fragment page", () => {
    const parsed = parseHoldings(fixture("holdings-notfound.html"));
    expect(parsed.hasTable).toBe(false);
    expect(parsed.branches).toHaveLength(0);
  });
});
