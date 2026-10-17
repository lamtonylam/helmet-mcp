import type { FinnaClient } from "./client.js";
import { CURATED_RECORD_FIELDS } from "./helmet.js";
import {
  asRecordList,
  toNormalizedRecord,
  type NormalizedRecord,
  type RawRecord,
} from "./normalize.js";
import { ToolError } from "../lib/errors.js";

export interface GetRecordOptions {
  fields?: string[];
  includeMarc?: boolean;
}

const DEFAULT_TTL = 10 * 60_000;

export async function getRecord(
  client: FinnaClient,
  id: string,
  options: GetRecordOptions = {},
): Promise<NormalizedRecord & { marcXml?: string }> {
  const fields = [
    ...(options.fields && options.fields.length > 0 ? options.fields : CURATED_RECORD_FIELDS),
  ];
  if (options.includeMarc && !fields.includes("fullRecord")) fields.push("fullRecord");

  const response = await client.get<{ records?: unknown }>(
    "record",
    { id, "field[]": fields },
    { cacheTtlMs: DEFAULT_TTL },
  );
  const records = asRecordList(response.records);
  const record = records[0];
  if (!record) {
    throw new ToolError("not_found", `No record found with id "${id}".`, [
      "Helmet ids look like helmet.2416183.",
    ]);
  }

  const normalized = toNormalizedRecord(record);
  const marc = (record as RawRecord).fullRecord;
  return typeof marc === "string" ? { ...normalized, marcXml: marc } : normalized;
}
