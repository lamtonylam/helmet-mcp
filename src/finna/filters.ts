import { CITY_CODES, FORMATS, HELMET_ORG, type CityKey } from "./helmet.js";

export interface FilterInput {
  formats?: string[];
  languages?: string[];
  cities?: CityKey[];
  /** A full Finna building code, e.g. "2/Helmet/h/h01/". */
  branch?: string;
  /** Multiple branch building codes, OR-ed together (e.g. a library + its collections). */
  branchCodes?: string[];
  yearFrom?: number;
  yearTo?: number;
  onlineOnly?: boolean;
  author?: string;
  subject?: string;
}

/** Quote and escape a value for a Finna filter expression. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Build the `filter[]` list. Values within one field are OR-ed with `~`; different fields
 * are AND-ed by default (verified against api.finna.fi).
 */
export function buildFilters(input: FilterInput, org: string = HELMET_ORG): string[] {
  const filters: string[] = [];

  const branchCodes = input.branchCodes?.filter((code) => code.length > 0) ?? [];
  if (branchCodes.length === 1) {
    filters.push(`building:${quote(branchCodes[0]!)}`);
  } else if (branchCodes.length > 1) {
    for (const code of branchCodes) filters.push(`~building:${quote(code)}`);
  } else if (input.branch) {
    filters.push(`building:${quote(input.branch)}`);
  } else if (input.cities && input.cities.length > 0) {
    for (const city of input.cities) filters.push(`~building:${quote(CITY_CODES[city])}`);
  } else {
    filters.push(`building:${quote(org)}`);
  }

  const formatCodes = new Set<string>();
  let onlineOnly = input.onlineOnly ?? false;
  for (const alias of input.formats ?? []) {
    const def = FORMATS[alias.toLowerCase()];
    if (!def) continue;
    formatCodes.add(def.code);
    if (def.extraFilters?.some((f) => f.startsWith("online_boolean"))) onlineOnly = true;
  }
  const codes = [...formatCodes];
  if (codes.length === 1) {
    filters.push(`format:${quote(codes[0]!)}`);
  } else if (codes.length > 1) {
    for (const code of codes) filters.push(`~format:${quote(code)}`);
  }

  if (input.languages && input.languages.length === 1) {
    filters.push(`language:${quote(input.languages[0]!)}`);
  } else if (input.languages && input.languages.length > 1) {
    for (const lang of input.languages) filters.push(`~language:${quote(lang)}`);
  }

  if (onlineOnly) filters.push('online_boolean:"1"');

  if (input.author) filters.push(`author:${quote(input.author)}`);
  if (input.subject) filters.push(`subject:${quote(input.subject)}`);

  if (input.yearFrom !== undefined || input.yearTo !== undefined) {
    const from = input.yearFrom ?? "*";
    const to = input.yearTo ?? "*";
    filters.push(`publishDate:${quote(`[${from} TO ${to}]`)}`);
  }

  return filters;
}
