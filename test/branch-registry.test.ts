import { describe, expect, it } from "vitest";
import {
  branchInGroup,
  resolveBranchGroup,
  resolveCity,
  suggestBranches,
} from "../src/holdings/branch-registry.js";

describe("resolveBranchGroup", () => {
  it("resolves a library name to its building codes, including child collections", () => {
    const group = resolveBranchGroup("Oodi");
    expect(group.map((ref) => ref.buildingCode)).toEqual(["2/Helmet/h/h00/", "2/Helmet/h/h00l/"]);
    expect(group.every((ref) => ref.city === "helsinki")).toBe(true);
  });

  it("resolves a specific collection instead of the whole library", () => {
    expect(resolveBranchGroup("Oodi lapset").map((ref) => ref.buildingCode)).toEqual([
      "2/Helmet/h/h00l/",
    ]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveBranchGroup("  oodi  ").map((ref) => ref.buildingCode)).toContain(
      "2/Helmet/h/h00/",
    );
    expect(resolveBranchGroup("SELLO").map((ref) => ref.buildingCode)).toContain("2/Helmet/e/e01/");
  });

  it("maps aliases and ASCII spellings to the canonical branch", () => {
    expect(resolveBranchGroup("toolo").map((ref) => ref.buildingCode)).toEqual([
      "2/Helmet/h/h25/",
      "2/Helmet/h/h25l/",
    ]);
    expect(resolveBranchGroup("grani").map((ref) => ref.name)).toEqual([
      "Kauniainen",
      "Kauniainen Lapset",
    ]);
    expect(resolveBranchGroup("matinkyla").map((ref) => ref.buildingCode)).toContain(
      "2/Helmet/e/e23/",
    );
  });

  it("accepts a full building code, with or without a trailing slash", () => {
    expect(resolveBranchGroup("2/Helmet/v/v30/").map((ref) => ref.name)).toEqual([
      "Tikkurila",
      "Tikkurila Lapset",
      "Tikkurila Musiikkivarasto",
    ]);
    expect(resolveBranchGroup("2/Helmet/v/v30").map((ref) => ref.name)).toContain("Tikkurila");
  });

  it("returns an empty list for unknown branches", () => {
    expect(resolveBranchGroup("Atlantis")).toEqual([]);
    expect(resolveBranchGroup("2/Helmet/h/zzz/")).toEqual([]);
  });
});

describe("branchInGroup", () => {
  it("matches the library and its collections", () => {
    const group = resolveBranchGroup("Oodi");
    expect(branchInGroup("Oodi", group)).toBe(true);
    expect(branchInGroup("Oodi lapset", group)).toBe(true);
  });

  it("does not match a sibling library or a parent name", () => {
    const group = resolveBranchGroup("Oodi lapset");
    expect(branchInGroup("Oodi lapset", group)).toBe(true);
    expect(branchInGroup("Oodi", group)).toBe(false);
    expect(branchInGroup("Töölö", group)).toBe(false);
  });
});

describe("resolveCity", () => {
  it("resolves holdings labels with collection suffixes", () => {
    expect(resolveCity("Oodi lapset")).toBe("helsinki");
    expect(resolveCity("Tikkurila musiikkivarasto")).toBe("vantaa");
    expect(resolveCity("Sello")).toBe("espoo");
  });

  it("returns undefined for unknown locations", () => {
    expect(resolveCity("Somewhere else")).toBeUndefined();
  });
});

describe("suggestBranches", () => {
  it("suggests near matches", () => {
    expect(suggestBranches("ood")).toContain("Oodi");
  });

  it("returns nothing for an empty query", () => {
    expect(suggestBranches("  ")).toEqual([]);
  });
});
