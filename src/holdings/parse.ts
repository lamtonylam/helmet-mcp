import { parse } from "node-html-parser";
import { resolveCity, cleanLocationName } from "./branch-registry.js";
import { parseStatusText, type HoldingStatus } from "./status.js";
import type { CityKey } from "../finna/helmet.js";

export interface HoldingCopy {
  shelf?: string;
  status: HoldingStatus;
  rawStatus?: string;
  dueDate?: string;
}

export interface HoldingBranch {
  name: string;
  city?: CityKey;
  shelf?: string;
  status: HoldingStatus;
  availableCount?: number;
  dueDate?: string;
  rawStatus?: string;
  copies: HoldingCopy[];
}

export interface HoldingsSummary {
  availableCount: number;
  totalCount: number;
  reservations: number;
  branchesWithAvailable: number;
}

export interface ParsedHoldings {
  summary: HoldingsSummary;
  branches: HoldingBranch[];
  /** True when the fragment contained a holdings table. */
  hasTable: boolean;
}

function text(node: { text: string } | null | undefined): string {
  return (node?.text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse the HTML fragment returned by
 * `GET https://helmet.finna.fi/Record/<id>/AjaxTab?tab=holdings`.
 */
export function parseHoldings(html: string): ParsedHoldings {
  const root = parse(html);
  const table = root.querySelector(".record-holdings-table");

  const totalText = text(root.querySelector(".totals-container .total"));
  const totalMatch = totalText.match(/(\d+)\s*\/\s*(\d+)/);
  const availableCount = totalMatch ? Number(totalMatch[1]) : 0;
  const totalCount = totalMatch ? Number(totalMatch[2]) : 0;

  const reservationsText = text(root.querySelector(".reservations"));
  const reservationsMatch = reservationsText.match(/(\d+)/);
  const reservations = reservationsMatch ? Number(reservationsMatch[1]) : 0;

  const branches: HoldingBranch[] = [];
  for (const group of root.querySelectorAll(".holdings-group")) {
    const locationText = text(group.querySelector(".location"));
    if (!locationText) continue;

    const statusText = text(group.querySelector(".holdings-details"));
    const parsed = parseStatusText(statusText);
    const shelf = text(group.querySelector(".location-link-text")) || undefined;

    const copies: HoldingCopy[] = group.querySelectorAll(".copy-details").map((copy) => {
      const copyShelf = text(copy.querySelector(".copy-title")) || undefined;
      const copyInfo = text(copy.querySelector(".copy-info"));
      const copyStatus = parseStatusText(copyInfo);
      return {
        ...(copyShelf ? { shelf: copyShelf } : {}),
        status: copyStatus.status,
        ...(copyStatus.rawStatus ? { rawStatus: copyStatus.rawStatus } : {}),
        ...(copyStatus.dueDate ? { dueDate: copyStatus.dueDate } : {}),
      };
    });

    const hasAvailableClass = group.querySelector(".status-available") !== null;
    const status: HoldingStatus =
      parsed.status !== "unknown"
        ? parsed.status
        : hasAvailableClass || copies.some((copy) => copy.status === "available")
          ? "available"
          : "unknown";

    const name = cleanLocationName(locationText);
    const city = resolveCity(locationText);

    branches.push({
      name,
      ...(city ? { city } : {}),
      ...(shelf ? { shelf } : {}),
      status,
      ...(parsed.availableCount !== undefined ? { availableCount: parsed.availableCount } : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
      ...(parsed.rawStatus ? { rawStatus: parsed.rawStatus } : {}),
      copies,
    });
  }

  const branchesWithAvailable = branches.filter(
    (branch) => branch.status === "available" || (branch.availableCount ?? 0) > 0,
  ).length;

  return {
    hasTable: table !== null,
    summary: { availableCount, totalCount, reservations, branchesWithAvailable },
    branches,
  };
}
