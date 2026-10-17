import { describe, expect, it } from "vitest";
import { buildFilters } from "../src/finna/filters.js";
import { HELMET_ORG } from "../src/finna/helmet.js";

describe("buildFilters", () => {
  it("defaults to the Helmet scope", () => {
    expect(buildFilters({})).toEqual([`building:"${HELMET_ORG}"`]);
  });

  it("ORs multiple cities", () => {
    expect(buildFilters({ cities: ["helsinki", "espoo"] })).toEqual([
      '~building:"1/Helmet/h/"',
      '~building:"1/Helmet/e/"',
    ]);
  });

  it("prefers an explicit branch code over the scope", () => {
    expect(buildFilters({ branch: "2/Helmet/h/h01/" })).toEqual(['building:"2/Helmet/h/h01/"']);
  });

  it("ORs multiple branch codes (a library and its collections)", () => {
    expect(buildFilters({ branchCodes: ["2/Helmet/h/h00/", "2/Helmet/h/h00l/"] })).toEqual([
      '~building:"2/Helmet/h/h00/"',
      '~building:"2/Helmet/h/h00l/"',
    ]);
  });

  it("prefers branch codes over an explicit branch", () => {
    expect(buildFilters({ branch: "2/Helmet/h/h01/", branchCodes: ["2/Helmet/h/h00/"] })).toEqual([
      'building:"2/Helmet/h/h00/"',
    ]);
  });

  it("ignores an empty branch code list", () => {
    expect(buildFilters({ branchCodes: [], cities: ["espoo"] })).toEqual([
      '~building:"1/Helmet/e/"',
    ]);
  });

  it("maps a single format alias", () => {
    expect(buildFilters({ formats: ["audiobook"] })).toEqual([
      `building:"${HELMET_ORG}"`,
      'format:"1/Book/AudioBook/"',
    ]);
  });

  it("ORs multiple format aliases", () => {
    expect(buildFilters({ formats: ["book", "dvd"] })).toEqual([
      `building:"${HELMET_ORG}"`,
      '~format:"0/Book/"',
      '~format:"1/Video/DVD/"',
    ]);
  });

  it("treats the ebook alias as online-only", () => {
    const filters = buildFilters({ formats: ["ebook"] });
    expect(filters).toContain('format:"0/Book/"');
    expect(filters).toContain('online_boolean:"1"');
  });

  it("ORs multiple languages", () => {
    expect(buildFilters({ languages: ["fin", "swe"] })).toEqual([
      `building:"${HELMET_ORG}"`,
      '~language:"fin"',
      '~language:"swe"',
    ]);
  });

  it("builds an open-ended year range", () => {
    expect(buildFilters({ yearFrom: 2020 })).toContain('publishDate:"[2020 TO *]"');
    expect(buildFilters({ yearTo: 1999 })).toContain('publishDate:"[* TO 1999]"');
    expect(buildFilters({ yearFrom: 2000, yearTo: 2010 })).toContain(
      'publishDate:"[2000 TO 2010]"',
    );
  });

  it("combines author and online filters", () => {
    const filters = buildFilters({ author: "Lönnrot, Elias", onlineOnly: true });
    expect(filters).toContain('author:"Lönnrot, Elias"');
    expect(filters).toContain('online_boolean:"1"');
  });

  it("escapes quotes and backslashes so a value cannot break out of its filter", () => {
    expect(buildFilters({ author: 'a"b' })).toContain('author:"a\\"b"');
    expect(buildFilters({ subject: "a\\b" })).toContain('subject:"a\\\\b"');
  });
});
