export type HoldingStatus =
  "available" | "on_loan" | "in_transit" | "overdue" | "lost" | "reserved" | "unknown";

export interface ParsedStatus {
  status: HoldingStatus;
  availableCount?: number;
  dueDate?: string;
  rawStatus: string;
}

function normalize(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a Finna holdings status string (Finnish or English) to a machine-readable status.
 * Examples: "1 saatavissa", "Lähin eräpäivä 29.10.2026", "Kuljetuksessa", "Kadonnut",
 * "Paljon myöhässä", "Lainassa", "Varattu".
 */
export function parseStatusText(input: string): ParsedStatus {
  const rawStatus = normalize(input);
  // Negated statuses ("Ei hyllyssä", "Not available", "Not on shelf") must never
  // report a copy as on the shelf.
  // No trailing \b: \b is ASCII-based and would not fire after a non-ASCII letter like "ä".
  const negated = /\b(?:ei|not)\s+(?:hyllyssä|saatavissa|saatavilla|available|on shelf)/i.test(
    rawStatus,
  );

  const available = rawStatus.match(/(\d+)\s*(?:kpl\s*)?(?:saatavissa|available)/i);
  if (available && Number(available[1]) > 0 && !negated) {
    return { status: "available", availableCount: Number(available[1]), rawStatus };
  }
  if (!negated && /(?:^|\s)hyllyssä(?:\s|$)|on shelf/i.test(rawStatus)) {
    return { status: "available", rawStatus };
  }
  if (!negated && /\bavailable\b/i.test(rawStatus)) {
    return { status: "available", rawStatus };
  }

  const due = rawStatus.match(/(?:eräpäivä|due(?: date)?)[:\s]*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (due) {
    return { status: "on_loan", dueDate: due[1], rawStatus };
  }
  if (/myöhässä|overdue/i.test(rawStatus)) {
    return { status: "overdue", rawStatus };
  }
  if (/lainassa|on loan/i.test(rawStatus)) {
    return { status: "on_loan", rawStatus };
  }
  if (/kuljetuksessa|in transit/i.test(rawStatus)) {
    return { status: "in_transit", rawStatus };
  }
  if (/kadonnut|lost|puuttuu/i.test(rawStatus)) {
    return { status: "lost", rawStatus };
  }
  if (/varattu|reserved|requested/i.test(rawStatus)) {
    return { status: "reserved", rawStatus };
  }

  return { status: "unknown", rawStatus };
}
