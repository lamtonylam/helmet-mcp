/** Helmet-kirjastot = Helsinki, Espoo, Vantaa and Kauniainen public libraries. */

export const HELMET_ORG = "0/Helmet/";
export const DEFAULT_SCOPE_LABEL = "Helmet-kirjastot";

export const CITY_KEYS = ["helsinki", "espoo", "vantaa", "kauniainen"] as const;
export type CityKey = (typeof CITY_KEYS)[number];

/** Finna building codes for the Helmet member cities. */
export const CITY_CODES: Record<CityKey, string> = {
  helsinki: "1/Helmet/h/",
  espoo: "1/Helmet/e/",
  vantaa: "1/Helmet/v/",
  kauniainen: "1/Helmet/k/",
};

export const CITY_LABELS: Record<CityKey, string> = {
  helsinki: "Helsinki",
  espoo: "Espoo",
  vantaa: "Vantaa",
  kauniainen: "Kauniainen",
};

/** Reverse lookup from a `1/Helmet/x/` code to a city key. */
export const CITY_BY_CODE: Record<string, CityKey> = {
  "1/Helmet/h/": "helsinki",
  "1/Helmet/e/": "espoo",
  "1/Helmet/v/": "vantaa",
  "1/Helmet/k/": "kauniainen",
};

export interface FormatDef {
  /** Finna `format` filter value. */
  code: string;
  fi: string;
  en: string;
  /** Extra filters implied by this format alias. */
  extraFilters?: string[];
}

/**
 * Friendly format aliases -> Finna `format` codes, verified against api.finna.fi.
 * Use `onlineOnly` for e-materials: Helmet e-books live outside the indexed catalogue,
 * so `online_boolean:"1"` is the reliable signal.
 */
export const FORMATS: Record<string, FormatDef> = {
  book: { code: "0/Book/", fi: "Kirja", en: "Book" },
  audiobook: { code: "1/Book/AudioBook/", fi: "Äänikirja", en: "Audiobook" },
  ebook: { code: "0/Book/", fi: "E-kirja", en: "E-book", extraFilters: ['online_boolean:"1"'] },
  music: { code: "0/Sound/", fi: "Äänite", en: "Music" },
  cd: { code: "1/Sound/CD/", fi: "CD", en: "CD" },
  video: { code: "0/Video/", fi: "Video", en: "Video" },
  dvd: { code: "1/Video/DVD/", fi: "DVD", en: "DVD" },
  bluray: { code: "1/Video/BluRay/", fi: "Blu-ray", en: "Blu-ray" },
  game: { code: "0/Game/", fi: "Peli", en: "Game" },
  magazine: { code: "0/Journal/", fi: "Lehti", en: "Magazine" },
  score: { code: "0/MusicalScore/", fi: "Nuotti", en: "Sheet music" },
  map: { code: "0/Map/", fi: "Kartta", en: "Map" },
  image: { code: "0/Image/", fi: "Kuva", en: "Image" },
  other: { code: "0/Other/", fi: "Muu", en: "Other" },
};

export const FORMAT_ALIASES = Object.keys(FORMATS);

export const SEARCH_TYPES = ["AllFields", "Title", "Author", "Subject"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SORT_KEYS = [
  "relevance",
  "year",
  "year asc",
  "author",
  "title",
  "main_date_str desc",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Curated subset of record fields returned by default (keeps payloads readable). */
export const CURATED_RECORD_FIELDS = [
  "id",
  "title",
  "subTitle",
  "shortTitle",
  "authors",
  "nonPresenterAuthors",
  "primaryAuthors",
  "year",
  "formats",
  "languages",
  "subjects",
  "genres",
  "series",
  "summary",
  "isbns",
  "issns",
  "publishers",
  "physicalDescriptions",
  "toc",
  "buildings",
  "images",
  "imageRights",
  "onlineUrls",
  "urls",
] as const;

export const DEFAULT_RECORD_URL = (id: string): string => `https://helmet.finna.fi/Record/${id}`;
