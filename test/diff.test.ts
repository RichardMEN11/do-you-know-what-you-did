import { describe, expect, it } from "vitest";
import { buildPrompt, parsePrePushStdin } from "../src/diff";

describe("parsePrePushStdin", () => {
  it("parses pre-push lines", () => {
    const input = "refs/heads/main abc123 refs/remotes/origin/main def456\n";
    const lines = parsePrePushStdin(input);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      localRef: "refs/heads/main",
      localSha: "abc123",
      remoteRef: "refs/remotes/origin/main",
      remoteSha: "def456"
    });
  });
});

describe("buildPrompt", () => {
  it("includes files and diff text", () => {
    const prompt = buildPrompt({
      rangeLabel: "a..b",
      files: ["src/index.ts", "README.md"],
      diffText: "diff --git a/src/index.ts b/src/index.ts",
      truncated: false
    });
    expect(prompt).toContain("Changed files (filtered):");
    expect(prompt).toContain("src/index.ts");
    expect(prompt).toContain("Diff (unified=3):");
    expect(prompt).toContain("diff --git a/src/index.ts b/src/index.ts");
  });
});
