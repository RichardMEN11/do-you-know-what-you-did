import { describe, expect, it } from "vitest";
import { filterDiffByExcluded, filterExcludedFiles } from "../src/exclude";

describe("filterExcludedFiles", () => {
  it("filters files by minimatch patterns", async () => {
    const files = ["src/index.ts", "dist/index.js", "README.md"];
    const result = await filterExcludedFiles(files, ["dist/**"]);
    expect(result).toEqual(["src/index.ts", "README.md"]);
  });

  it("normalizes Windows paths for matching", async () => {
    const files = ["src\\index.ts", "dist\\index.js"];
    const result = await filterExcludedFiles(files, ["dist/**"]);
    expect(result).toEqual(["src\\index.ts"]);
  });
});

describe("filterDiffByExcluded", () => {
  it("removes diff hunks for excluded files", async () => {
    const diff = [
      "diff --git a/src/index.ts b/src/index.ts",
      "index 123..456 100644",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "+console.log('hi');",
      "diff --git a/dist/index.js b/dist/index.js",
      "index 111..222 100644",
      "--- a/dist/index.js",
      "+++ b/dist/index.js",
      "+console.log('build');"
    ].join("\n");

    const filtered = await filterDiffByExcluded(diff, ["dist/**"]);
    expect(filtered).toContain("src/index.ts");
    expect(filtered).not.toContain("dist/index.js");
  });
});
