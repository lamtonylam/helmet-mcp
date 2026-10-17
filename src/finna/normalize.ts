import { CITY_BY_CODE, DEFAULT_RECORD_URL, type CityKey } from "./helmet.js";

export interface RawBuilding {
  value: string;
  translated?: string;
}

export interface RawFormat {
  value: string;
  translated?: string;
}

export interface RawAuthor {
  name: string;
  role?: string;
  type?: string;
}

export interface RawImage {
  url?: string;
  thumbUrl?: string;
  sizes?: Record<string, string>;
}

export interface RawUrl {
  url?: string;
  text?: string;
  title?: string;
}

export type RawRecord = Record<string, unknown>;

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface NormalizedBuilding {
  cities: CityKey[];
  /** Branch-level names, e.g. "Pasila lapset". */
  branches: string[];
}

export function normalizeBuildings(record: RawRecord): NormalizedBuilding {
  const cities = new Set<CityKey>();
  const branches = new Set<string>();
  for (const building of asArray<RawBuilding>(record.buildings)) {
    const city = CITY_BY_CODE[building.value];
    if (city) cities.add(city);
    else if (building.value.startsWith("2/Helmet/") && building.translated) {
      branches.add(building.translated);
    }
  }
  return { cities: [...cities], branches: [...branches] };
}

export function normalizeAuthors(record: RawRecord): string[] {
  const authors = new Set<string>();
  for (const key of ["authors", "primaryAuthors", "nonPresenterAuthors", "presenters"]) {
    for (const author of asArray<RawAuthor | string>(record[key])) {
      if (typeof author === "string") authors.add(author);
      else if (author?.name) authors.add(author.name);
    }
  }
  return [...authors];
}

export function normalizeFormats(record: RawRecord): Array<{ value: string; label: string }> {
  return asArray<RawFormat>(record.formats).map((format) => ({
    value: format.value,
    label: format.translated ?? format.value,
  }));
}

export function isOnline(record: RawRecord): boolean {
  return (
    asArray<RawUrl>(record.onlineUrls).length > 0 ||
    asArray<RawUrl>(record.urls).some((url) => /^https?:/i.test(url.url ?? ""))
  );
}

export interface CatalogueHit {
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  year?: string;
  formats: Array<{ value: string; label: string }>;
  languages: string[];
  cities: CityKey[];
  branches: string[];
  online: boolean;
  recordUrl: string;
}

export function toCatalogueHit(record: RawRecord): CatalogueHit {
  const id = asString(record.id) ?? "";
  const { cities, branches } = normalizeBuildings(record);
  const subtitle = asString(record.subTitle);
  const year = asString(record.year);
  return {
    id,
    title: asString(record.title) ?? id,
    ...(subtitle ? { subtitle } : {}),
    authors: normalizeAuthors(record),
    ...(year ? { year } : {}),
    formats: normalizeFormats(record),
    languages: asArray<string>(record.languages),
    cities,
    branches,
    online: isOnline(record),
    recordUrl: DEFAULT_RECORD_URL(id),
  };
}

export interface NormalizedRecord extends CatalogueHit {
  subjects: string[][];
  genres: string[][];
  series: string[];
  summary: string[];
  isbns: string[];
  issns: string[];
  publishers: string[];
  physicalDescriptions: string[];
  toc: string[];
  images: string[];
  imageRights: unknown;
  onlineUrls: RawUrl[];
  urls: RawUrl[];
}

function flattenNested(value: unknown): string[][] {
  return asArray<unknown>(value).map((item) =>
    Array.isArray(item) ? item.map((part) => String(part)) : [String(item)],
  );
}

function flattenList(value: unknown): string[] {
  return asArray<unknown>(value).map((item) =>
    Array.isArray(item) ? item.join(" ") : String(item),
  );
}

export function toNormalizedRecord(record: RawRecord): NormalizedRecord {
  const hit = toCatalogueHit(record);
  return {
    ...hit,
    subjects: flattenNested(record.subjects),
    genres: flattenNested(record.genres),
    series: flattenList(record.series),
    summary: flattenList(record.summary),
    isbns: flattenList(record.isbns),
    issns: flattenList(record.issns),
    publishers: flattenList(record.publishers),
    physicalDescriptions: flattenList(record.physicalDescriptions),
    toc: flattenList(record.toc),
    images: asArray<RawImage>(record.images)
      .map((image) => image.url ?? image.thumbUrl ?? "")
      .filter(Boolean),
    imageRights: record.imageRights ?? null,
    onlineUrls: asArray<RawUrl>(record.onlineUrls),
    urls: asArray<RawUrl>(record.urls),
  };
}

export function asRecordList(value: unknown): RawRecord[] {
  return asArray<RawRecord>(value);
}
