import { describe, expect, it } from "vitest";
import { parseCliOptions, resolveClientTuning, RUDE_DEFAULTS, POLITE_PRESET } from "../src/cli.js";

describe("parseCliOptions", () => {
  it("returns undefined for --help so the caller prints help and exits", () => {
    expect(parseCliOptions(["--help"])).toBeUndefined();
    expect(parseCliOptions(["-h"])).toBeUndefined();
  });

  it("defaults to rude tuning with availability enabled", () => {
    const options = parseCliOptions([]);
    expect(options).toBeDefined();
    expect(options!.polite).toBe(false);
    expect(options!.availability).toBe(true);
    expect(options!.concurrency).toBeUndefined();
    expect(resolveClientTuning(options!)).toEqual(RUDE_DEFAULTS);
  });

  it("--polite resolves to the gentle preset", () => {
    const options = parseCliOptions(["--polite"])!;
    expect(options.polite).toBe(true);
    expect(resolveClientTuning(options)).toEqual(POLITE_PRESET);
  });

  it("converts --cache-ttl seconds to milliseconds", () => {
    const options = parseCliOptions(["--cache-ttl", "30"])!;
    expect(options.cacheTtlMs).toBe(30_000);
    expect(resolveClientTuning(options).cacheTtlMs).toBe(30_000);
  });

  it("explicit flags override the preset", () => {
    const options = parseCliOptions(["--polite", "--min-interval", "0"])!;
    expect(resolveClientTuning(options)).toMatchObject({ minIntervalMs: 0 });
    const rudeWithCap = parseCliOptions(["--concurrency", "4"])!;
    expect(resolveClientTuning(rudeWithCap)).toMatchObject({ concurrency: 4 });
  });

  it("rejects invalid numeric values with a flag-specific message", () => {
    expect(() => parseCliOptions(["--concurrency", "0"])).toThrow(/--concurrency/);
    expect(() => parseCliOptions(["--concurrency", "1.5"])).toThrow(/positive integer/);
    expect(() => parseCliOptions(["--min-interval", "-1"])).toThrow(/--min-interval/);
    expect(() => parseCliOptions(["--cache-ttl", "x"])).toThrow(/--cache-ttl/);
    expect(() => parseCliOptions(["--timeout", "0"])).toThrow(/--timeout/);
    expect(() => parseCliOptions(["--port", "99999"])).toThrow(/--port/);
    expect(() => parseCliOptions(["--log-level", "loud"])).toThrow(/--log-level/);
  });

  it("keeps existing flags working", () => {
    const options = parseCliOptions([
      "--http",
      "--port",
      "8080",
      "--org",
      "0/Nelio/",
      "--no-availability",
      "--user-agent",
      "test-agent",
      "--log-level",
      "debug",
    ])!;
    expect(options).toMatchObject({
      http: true,
      port: 8080,
      org: "0/Nelio/",
      availability: false,
      userAgent: "test-agent",
      logLevel: "debug",
    });
  });
});
