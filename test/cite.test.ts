import { describe, expect, it } from "vitest";
import { formatCitation } from "../src/finna/cite.js";
import { toNormalizedRecord, type RawRecord } from "../src/finna/normalize.js";

const raw: RawRecord = {
  id: "helmet.2416183",
  title: "Harry Potter",
  year: "2015",
  nonPresenterAuthors: [{ name: "Rowling, J. K." }],
  publishers: ["Aman Publisher"],
  isbns: ["9994858246"],
  formats: [{ value: "0/Book/", translated: "Kirja" }],
};

const record = toNormalizedRecord(raw);

describe("formatCitation", () => {
  it("formats APA", () => {
    expect(formatCitation(record, "apa")).toBe(
      "Rowling, J. K. (2015). Harry Potter. Aman Publisher.",
    );
  });

  it("formats MLA", () => {
    expect(formatCitation(record, "mla")).toBe(
      "Rowling, J. K. Harry Potter. Aman Publisher, 2015.",
    );
  });

  it("formats BibTeX with a stable key", () => {
    const bibtex = formatCitation(record, "bibtex");
    expect(bibtex).toContain("@book{Rowling2015Harry,");
    expect(bibtex).toContain("author = {Rowling, J. K.},");
    expect(bibtex).toContain("isbn = {9994858246},");
  });

  it("formats RIS", () => {
    const ris = formatCitation(record, "ris");
    expect(ris).toContain("TY - BOOK");
    expect(ris).toContain("AU - Rowling, J. K.");
    expect(ris.endsWith("ER -")).toBe(true);
  });

  it("falls back to placeholder words for a non-Latin BibTeX key", () => {
    const nonLatin = toNormalizedRecord({
      ...raw,
      title: "三体",
      nonPresenterAuthors: [{ name: "刘慈欣" }],
    });
    expect(formatCitation(nonLatin, "bibtex")).toContain("@book{helmet2015item,");
  });

  it("adds et al. for many authors", () => {
    const many = toNormalizedRecord({
      ...raw,
      nonPresenterAuthors: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    });
    expect(formatCitation(many, "apa")).toContain("A, B, C et al.");
  });
});
