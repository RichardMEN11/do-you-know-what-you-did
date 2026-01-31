import { describe, expect, it } from "vitest";
import { buildCacheKey, isAllZeroSha, truncateDiff } from "../src/lib";

describe("truncateDiff", () => {
  it("does not truncate short strings", () => {
    const { text, truncated } = truncateDiff("abc", 10);
    expect(text).toBe("abc");
    expect(truncated).toBe(false);
  });

  it("truncates long strings", () => {
    const { text, truncated } = truncateDiff("abcdef", 3);
    expect(text).toBe("abc");
    expect(truncated).toBe(true);
  });
});

describe("buildCacheKey", () => {
  it("changes when excludeFiles changes", () => {
    const base = {
      range: "a..b",
      model: "gpt",
      maxDiffChars: 1000
    };
    const keyA = buildCacheKey({ ...base, excludeFiles: [] });
    const keyB = buildCacheKey({ ...base, excludeFiles: ["dist/**"] });
    expect(keyA).not.toBe(keyB);
  });
});

describe("isAllZeroSha", () => {
  it("detects all-zero SHAs", () => {
    expect(isAllZeroSha("0000000000")).toBe(true);
    expect(isAllZeroSha("000abc")).toBe(false);
  });
});
