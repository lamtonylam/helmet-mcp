import { describe, expect, it } from "vitest";
import { parseStatusText } from "../src/holdings/status.js";

describe("parseStatusText", () => {
  it.each([
    ["1 saatavissa", "available", 1],
    ["2 saatavissa", "available", 2],
    ["Hyllyssä", "available", undefined],
    ["Lähin eräpäivä 29.10.2026", "on_loan", undefined],
    ["Lainassa", "on_loan", undefined],
    ["Paljon myöhässä", "overdue", undefined],
    ["Kuljetuksessa", "in_transit", undefined],
    ["Kadonnut", "lost", undefined],
    ["Varattu", "reserved", undefined],
    ["something else", "unknown", undefined],
  ])("maps %j -> %s", (input, status, availableCount) => {
    const parsed = parseStatusText(input);
    expect(parsed.status).toBe(status);
    if (availableCount !== undefined) expect(parsed.availableCount).toBe(availableCount);
  });

  it("extracts the due date", () => {
    expect(parseStatusText("Lähin eräpäivä 19.10.2026").dueDate).toBe("19.10.2026");
  });

  it.each([
    "Not available",
    "Unavailable",
    "Ei saatavilla",
    "Ei saatavissa",
    "Ei hyllyssä",
    "Not on shelf",
    "0 saatavissa",
  ])("does not report the negated or zero-count status %j as available", (input) => {
    expect(parseStatusText(input).status).not.toBe("available");
  });

  it("handles non-breaking spaces from HTML", () => {
    expect(parseStatusText("1\u00a0saatavissa").availableCount).toBe(1);
  });
});
