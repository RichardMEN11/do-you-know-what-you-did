import { createHash } from "crypto";

export function truncateDiff(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

export function buildCacheKey(input: {
  range: string;
  model: string;
  maxDiffChars: number;
  excludeFiles: string[];
}): string {
  const raw = `${input.range}|${input.model}|${input.maxDiffChars}|${input.excludeFiles.join(",")}`;
  return createHash("sha256").update(raw).digest("hex");
}

export function isAllZeroSha(sha: string): boolean {
  return /^0+$/.test(sha);
}
