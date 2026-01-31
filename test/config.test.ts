import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, loadEnvFile } from "../src/config";
import { DEFAULTS } from "../src/types";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "dyd-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("returns defaults when config is missing", () => {
    const dir = makeTempDir();
    const config = loadConfig(dir);
    expect(config).toEqual(DEFAULTS);
  });

  it("validates and clamps config values", () => {
    const dir = makeTempDir();
    const configPath = join(dir, ".do-you-know-what-you-did.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        model: "gpt-test",
        passScore: 10,
        maxDiffChars: 0,
        allowFailOpen: false,
        excludeFiles: ["dist/**", 123, null]
      }),
      "utf8"
    );
    const config = loadConfig(dir);
    expect(config.model).toBe("gpt-test");
    expect(config.passScore).toBe(3);
    expect(config.maxDiffChars).toBe(DEFAULTS.maxDiffChars);
    expect(config.allowFailOpen).toBe(false);
    expect(config.excludeFiles).toEqual(["dist/**"]);
  });
});

describe("loadEnvFile", () => {
  it("loads env values including export and inline comments", () => {
    const dir = makeTempDir();
    const envPath = join(dir, ".env");
    writeFileSync(
      envPath,
      [
        "OPENAI_API_KEY=abc123 # comment",
        "export OPENAI_BASE_URL=https://example.test/v1",
        "QUOTED=\"hello world\""
      ].join("\n"),
      "utf8"
    );

    const originalKey = process.env.OPENAI_API_KEY;
    const originalBase = process.env.OPENAI_BASE_URL;
    const originalQuoted = process.env.QUOTED;

    try {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
      delete process.env.QUOTED;
      loadEnvFile(dir);
      expect(process.env.OPENAI_API_KEY).toBe("abc123");
      expect(process.env.OPENAI_BASE_URL).toBe("https://example.test/v1");
      expect(process.env.QUOTED).toBe("hello world");
    } finally {
      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalBase !== undefined) process.env.OPENAI_BASE_URL = originalBase;
      else delete process.env.OPENAI_BASE_URL;
      if (originalQuoted !== undefined) process.env.QUOTED = originalQuoted;
      else delete process.env.QUOTED;
    }
  });

  it("does not override existing env values", () => {
    const dir = makeTempDir();
    const envPath = join(dir, ".env");
    writeFileSync(envPath, "OPENAI_API_KEY=newvalue\n", "utf8");

    const originalKey = process.env.OPENAI_API_KEY;
    try {
      process.env.OPENAI_API_KEY = "existing";
      loadEnvFile(dir);
      expect(process.env.OPENAI_API_KEY).toBe("existing");
    } finally {
      if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });
});
