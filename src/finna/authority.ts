import type { FinnaClient } from "./client.js";
import { asRecordList, type RawRecord } from "./normalize.js";

export interface AuthorityHit {
  id: string;
  heading: string;
  institutions: string[];
}

export interface AuthoritySearchResult {
  resultCount: number;
  hits: AuthorityHit[];
}

/** Search the Finna authority index (authors, subjects, etc.). */
export async function searchAuthority(
  client: FinnaClient,
  query: string,
  limit = 10,
): Promise<AuthoritySearchResult> {
  const response = await client.get<{ resultCount?: number; records?: unknown }>(
    "authority/search",
    {
      lookfor: query,
      type: "AllFields",
      limit: Math.min(Math.max(limit, 1), 100),
      "field[]": ["id", "title", "institutions"],
    },
    { cacheTtlMs: 10 * 60_000 },
  );

  const hits = asRecordList(response.records).map((record: RawRecord) => ({
    id: String(record.id ?? ""),
    heading: String(record.title ?? ""),
    institutions: Array.isArray(record.institutions) ? (record.institutions as string[]) : [],
  }));

  return { resultCount: response.resultCount ?? hits.length, hits };
}
