import type { NormalizedRecord } from "./normalize.js";

export const CITATION_STYLES = ["apa", "mla", "chicago", "bibtex", "ris", "endnote"] as const;
export type CitationStyle = (typeof CITATION_STYLES)[number];

function contributors(record: NormalizedRecord, max = 3): { list: string; suffix: string } {
  const authors = record.authors;
  if (authors.length === 0) return { list: "", suffix: "" };
  if (authors.length <= max) return { list: authors.join(", "), suffix: "" };
  return { list: authors.slice(0, max).join(", "), suffix: " et al." };
}

function year(record: NormalizedRecord): string {
  return record.year ?? "n.d.";
}

function human(record: NormalizedRecord, style: "apa" | "mla" | "chicago"): string {
  const { list, suffix } = contributors(record);
  const authorStr = list ? `${list}${suffix}` : "";
  const authorPart = authorStr
    ? /[.!?]$/.test(authorStr)
      ? `${authorStr} `
      : `${authorStr}. `
    : "";
  const title = record.title;
  const publisher = record.publishers[0] ?? "";
  const y = year(record);
  switch (style) {
    case "apa":
      return `${authorPart}(${y}). ${title}. ${publisher}.`.replace(/\s+/g, " ").trim();
    case "mla":
      return `${authorPart}${title}. ${publisher}, ${y}.`.replace(/\s+/g, " ").trim();
    case "chicago":
      return `${authorPart}${title}. ${publisher}, ${y}.`.replace(/\s+/g, " ").trim();
  }
}

function bibtexKey(record: NormalizedRecord): string {
  const firstAuthor = record.authors[0] ?? "helmet";
  const surname = firstAuthor.split(",")[0]?.replace(/[^A-Za-z]/g, "") || "helmet";
  const word = record.title.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") || "item";
  return `${surname}${year(record)}${word}`;
}

export function formatCitation(record: NormalizedRecord, style: CitationStyle): string {
  switch (style) {
    case "apa":
    case "mla":
    case "chicago":
      return human(record, style);
    case "bibtex": {
      const lines = [
        `@book{${bibtexKey(record)},`,
        record.authors.length ? `  author = {${record.authors.join(" and ")}},` : undefined,
        `  title = {${record.title}},`,
        `  year = {${year(record)}},`,
        record.publishers[0] ? `  publisher = {${record.publishers[0]}},` : undefined,
        record.isbns[0] ? `  isbn = {${record.isbns[0]}},` : undefined,
        `}`,
      ].filter((line): line is string => Boolean(line));
      return lines.join("\n");
    }
    case "ris": {
      const parts = ["TY - BOOK"];
      for (const author of record.authors) parts.push(`AU - ${author}`);
      parts.push(`TI - ${record.title}`);
      parts.push(`PY - ${year(record)}`);
      if (record.publishers[0]) parts.push(`PB - ${record.publishers[0]}`);
      if (record.isbns[0]) parts.push(`SN - ${record.isbns[0]}`);
      parts.push("ER -");
      return parts.join("\n");
    }
    case "endnote": {
      const parts = ["%0 Book"];
      for (const author of record.authors) parts.push(`%A ${author}`);
      parts.push(`%T ${record.title}`);
      parts.push(`%D ${year(record)}`);
      if (record.publishers[0]) parts.push(`%I ${record.publishers[0]}`);
      if (record.isbns[0]) parts.push(`%@ ${record.isbns[0]}`);
      return parts.join("\n");
    }
  }
}
