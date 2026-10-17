import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const ATTRIBUTION = "Data: Finna / Helmet-kirjastot (CC0)";

/** An error that is safe and useful to surface to an MCP client. */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export function toolError(error: unknown): CallToolResult {
  const err =
    error instanceof ToolError
      ? error
      : new ToolError("internal_error", error instanceof Error ? error.message : String(error));
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { error: { code: err.code, message: err.message, hints: err.hints } },
          null,
          2,
        ),
      },
    ],
  };
}

export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function withSource<T extends Record<string, unknown>>(
  value: T,
  scope: string,
): T & { source: { api: string; scope: string; attribution: string } } {
  return {
    ...value,
    source: { api: "api.finna.fi", scope, attribution: ATTRIBUTION },
  };
}
