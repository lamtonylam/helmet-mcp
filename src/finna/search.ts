import type { FinnaClient } from "./client.js";
import { buildFilters, type FilterInput } from "./filters.js";
import { HELMET_ORG, type SearchType, type SortKey } from "./helmet.js";
import { asRecordList, toCatalogueHit, type CatalogueHit } from "./normalize.js";

export const SEARCH_FIELDS = [
  "id",
  "title",
  "subTitle",
  "nonPresenterAuthors",
  "presenters",
  "year",
  "formats",
  "languages",
  "buildings",
  "onlineUrls",
];

export const FACET_FIELDS = ["format", "language", "building", "author"] as const;
export type FacetField = (typeof FACET_FIELDS)[number];

export interface SearchParams extends FilterInput {
  query: string;
  searchType?: SearchType;
  sort?: SortKey;
  page?: number;
  limit?: number;
  includeFacets?: FacetField[];
  fields?: string[];
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface FacetGroup {
  field: string;
  values: FacetValue[];
}

export interface SearchResult {
  resultCount: number;
  page: number;
  limit: number;
  hits: CatalogueHit[];
  facets: FacetGroup[];
  hasMore: boolean;
}

function normalizeFacets(raw: unknown): FacetGroup[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>).map(([field, values]) => ({
    field,
    values: Array.isArray(values)
      ? values.map((entry) => {
          const value = entry as { value?: string; translated?: string; count?: number };
          return {
            value: value.value ?? "",
            label: value.translated ?? value.value ?? "",
            count: value.count ?? 0,
          };
        })
      : [],
  }));
}

const MAX_LIMIT = 100;

export async function searchCatalogue(
  client: FinnaClient,
  params: SearchParams,
  org: string = HELMET_ORG,
): Promise<SearchResult> {
  const limit = Math.min(Math.max(params.limit ?? 20, 0), MAX_LIMIT);
  const page = Math.max(params.page ?? 1, 1);
  const fields = params.fields && params.fields.length > 0 ? params.fields : SEARCH_FIELDS;

  const response = await client.get<{
    resultCount?: number;
    records?: unknown;
    facets?: unknown;
    resumptionToken?: unknown;
  }>("search", {
    lookfor: params.query,
    type: params.searchType ?? "AllFields",
    sort: params.sort,
    page,
    limit,
    "field[]": fields,
    "filter[]": buildFilters(params, org),
    "facet[]": params.includeFacets,
  });

  const resultCount = response.resultCount ?? 0;
  const hits = asRecordList(response.records).map(toCatalogueHit);

  return {
    resultCount,
    page,
    limit,
    hits,
    facets: normalizeFacets(response.facets),
    hasMore: page * limit < resultCount,
  };
}
