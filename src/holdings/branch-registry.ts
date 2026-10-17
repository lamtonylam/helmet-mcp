import type { CityKey } from "../finna/helmet.js";
import { GENERATED_BRANCHES } from "./branch-registry.generated.js";

/**
 * Aliases (Swedish names, common misspellings, ASCII spellings) -> canonical registry name.
 * The canonical entry supplies the city and, when available, the Finna building code.
 */
const ALIASES: Record<string, string> = {
  "keskustakirjasto oodi": "oodi",
  toolo: "töölö",
  itakeskus: "itäkeskus",
  jakomaki: "jakomäki",
  kapyla: "käpylä",
  kannelmaki: "kannelmäki",
  oulunkyla: "oulunkylä",
  pukinmaki: "pukinmäki",
  jatkasaari: "jätkäsaari",
  noykkio: "nöykkiö",
  matinkyla: "iso omena",
  kalajarvi: "kalajärvi",
  myyrmaki: "myyrmäki",
  koivukyla: "koivukylä",
  lansimaki: "länsimäki",
  pahkinarinne: "pähkinärinne",
  kauniaisten: "kauniainen",
  grani: "kauniainen",
};

/** Recognised locations that exist only as service points (no Finna branch code). */
const EXTRA_CITY_ALIASES: Array<[name: string, city: CityKey]> = [
  ["helmet-kirjastoauto", "helsinki"],
  ["lakkitori", "espoo"],
  ["ita-hakkila", "vantaa"],
  ["hameenkyla", "vantaa"],
  ["myllymaki", "vantaa"],
  ["kivisto", "vantaa"],
  ["rajakyla", "vantaa"],
  ["ylasto", "vantaa"],
];

/** A Helmet library, optionally with the Finna building code used for filtering. */
export interface BranchRef {
  name: string;
  city: CityKey;
  buildingCode?: string;
}

interface RegistryEntry {
  normalized: string;
  name: string;
  city: CityKey;
  buildingCode?: string;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(name: string): string {
  return name.replace(/(^|\s)(\S)/g, (_, space, char) => `${space}${char.toUpperCase()}`);
}

const ENTRIES: RegistryEntry[] = GENERATED_BRANCHES.map(([name, city, ...codes]) => {
  const normalized = normalize(name);
  return {
    normalized,
    name: titleCase(normalized),
    city,
    ...(codes[0] ? { buildingCode: codes[0] } : {}),
  };
});

const BY_NAME = new Map(ENTRIES.map((entry) => [entry.normalized, entry]));

const CITY_PREFIXES: Array<[prefix: string, city: CityKey]> = (() => {
  const prefixes: Array<[string, CityKey]> = ENTRIES.map((entry) => [entry.normalized, entry.city]);
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const entry = BY_NAME.get(canonical);
    if (entry) prefixes.push([alias, entry.city]);
  }
  prefixes.push(...EXTRA_CITY_ALIASES);
  return prefixes;
})();

function canonicalEntry(query: string): RegistryEntry | undefined {
  const normalized = normalize(query);
  const direct = BY_NAME.get(normalized);
  if (direct) return direct;
  const alias = ALIASES[normalized];
  return alias ? BY_NAME.get(alias) : undefined;
}

function toRef(entry: RegistryEntry): BranchRef {
  return {
    name: entry.name,
    city: entry.city,
    ...(entry.buildingCode ? { buildingCode: entry.buildingCode } : {}),
  };
}

/** The named library plus its collection branches (e.g. "oodi" -> "oodi", "oodi lapset"). */
function libraryMembers(base: string): RegistryEntry[] {
  return ENTRIES.filter(
    (entry) => entry.normalized === base || entry.normalized.startsWith(`${base} `),
  );
}

/** Resolve a human-readable holdings location to a member city, or undefined. */
export function resolveCity(location: string): CityKey | undefined {
  const normalized = normalize(location);
  let best: { length: number; city: CityKey } | undefined;
  for (const [prefix, city] of CITY_PREFIXES) {
    if (normalized.startsWith(prefix) && (!best || prefix.length > best.length)) {
      best = { length: prefix.length, city };
    }
  }
  return best?.city;
}

/** Strip trailing collection qualifiers for a cleaner branch label. */
export function cleanLocationName(location: string): string {
  return location
    .replace(/\s+/g, " ")
    .replace(/\s+(aik|las|mon|nuo|mus|kirjasto|salo|selko)\b.*$/i, "")
    .trim();
}

/**
 * Resolve a user-provided branch reference — a name ("Oodi", "Tikkurila") or a full Finna
 * building code — to the library and its collection codes. A plain library name also pulls in
 * its collections (e.g. "Oodi" -> Oodi + Oodi lapset); a more specific name
 * ("Oodi lapset", "Tikkurila musiikkivarasto") resolves to just that collection.
 *
 * Returns an empty array when nothing matches.
 */
export function resolveBranchGroup(query: string): BranchRef[] {
  const raw = query.trim();
  if (raw.length === 0) return [];

  if (/^\d+\/Helmet\//.test(raw)) {
    const code = raw.endsWith("/") ? raw : `${raw}/`;
    const entry = ENTRIES.find((candidate) => candidate.buildingCode === code);
    return entry ? libraryMembers(entry.normalized).map(toRef) : [];
  }

  const normalized = normalize(raw);

  const canonical = canonicalEntry(raw);
  if (canonical) return libraryMembers(canonical.normalized).map(toRef);

  const prefixed = ENTRIES.filter((entry) => entry.normalized.startsWith(`${normalized} `));
  if (prefixed.length > 0) return prefixed.map(toRef);

  const base = ENTRIES.find((entry) => normalized.startsWith(`${entry.normalized} `));
  return base ? [toRef(base)] : [];
}

/** True when a holdings branch name belongs to any library in the resolved group. */
export function branchInGroup(holdingName: string, group: BranchRef[]): boolean {
  const name = normalize(holdingName);
  return group.some((ref) => {
    const candidate = normalize(ref.name);
    return name === candidate || name.startsWith(`${candidate} `);
  });
}

/** Best-effort suggestions for a branch name that did not resolve. */
export function suggestBranches(query: string, limit = 8): string[] {
  const normalized = normalize(query);
  if (normalized.length === 0) return [];
  const starts = ENTRIES.filter((entry) => entry.normalized.startsWith(normalized));
  const contains = ENTRIES.filter(
    (entry) => !entry.normalized.startsWith(normalized) && entry.normalized.includes(normalized),
  );
  return [...starts, ...contains].slice(0, limit).map((entry) => entry.name);
}

/** Deduplicated branch list, generated entries take precedence. */
export const KNOWN_BRANCHES: ReadonlyArray<BranchRef> = ENTRIES.map(toRef);
