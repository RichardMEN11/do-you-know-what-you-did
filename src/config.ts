import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Config, DEFAULTS } from "./types";

export function loadConfig(repoRoot: string, debug = false): Config {
  const configPath = join(repoRoot, ".do-you-know-what-you-did.json");
  if (!existsSync(configPath)) return { ...DEFAULTS };
  const raw = readFileSync(configPath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      model: typeof parsed.model === "string" ? parsed.model : DEFAULTS.model,
      passScore: typeof parsed.passScore === "number" ? parsed.passScore : DEFAULTS.passScore,
      maxDiffChars:
        typeof parsed.maxDiffChars === "number" ? parsed.maxDiffChars : DEFAULTS.maxDiffChars,
      allowFailOpen:
        typeof parsed.allowFailOpen === "boolean" ? parsed.allowFailOpen : DEFAULTS.allowFailOpen,
      excludeFiles: Array.isArray(parsed.excludeFiles) ? parsed.excludeFiles : DEFAULTS.excludeFiles
    };
  } catch (err) {
    if (debug) console.error(`[debug] Failed to parse config: ${String(err)}`);
    return { ...DEFAULTS };
  }
}

export function loadEnvFile(repoRoot: string, debug = false): void {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, "utf8");
    const lines = raw.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    if (debug) console.error(`[debug] Failed to read .env: ${String(err)}`);
  }
}
