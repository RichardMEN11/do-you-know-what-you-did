import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Config, DEFAULTS } from './types';

export function loadConfig(repoRoot: string, debug = false): Config {
  const configPath = join(repoRoot, '.do-you-know-what-you-did.json');
  if (!existsSync(configPath)) return { ...DEFAULTS };
  const raw = readFileSync(configPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    const passScoreRaw =
      typeof parsed.passScore === 'number'
        ? parsed.passScore
        : DEFAULTS.passScore;
    const maxDiffRaw =
      typeof parsed.maxDiffChars === 'number'
        ? parsed.maxDiffChars
        : DEFAULTS.maxDiffChars;
    const excludeRaw = Array.isArray(parsed.excludeFiles)
      ? parsed.excludeFiles
      : DEFAULTS.excludeFiles;
    const passScore = Number.isFinite(passScoreRaw)
      ? Math.min(3, Math.max(1, Math.round(passScoreRaw)))
      : DEFAULTS.passScore;
    const maxDiffChars =
      Number.isFinite(maxDiffRaw) && maxDiffRaw > 0
        ? Math.floor(maxDiffRaw)
        : DEFAULTS.maxDiffChars;
    const excludeFiles = excludeRaw.filter(
      (value: any) => typeof value === 'string',
    );
    return {
      model: typeof parsed.model === 'string' ? parsed.model : DEFAULTS.model,
      passScore,
      maxDiffChars,
      allowFailOpen:
        typeof parsed.allowFailOpen === 'boolean'
          ? parsed.allowFailOpen
          : DEFAULTS.allowFailOpen,
      excludeFiles,
    };
  } catch (err) {
    if (debug) console.error(`[debug] Failed to parse config: ${String(err)}`);
    return { ...DEFAULTS };
  }
}

export function loadEnvFile(repoRoot: string, debug = false): void {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, 'utf8');
    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const normalized = trimmed.startsWith('export ')
        ? trimmed.slice(7).trim()
        : trimmed;
      const idx = normalized.indexOf('=');
      if (idx === -1) continue;
      const key = normalized.slice(0, idx).trim();
      let value = normalized.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '').trim();
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    if (debug) console.error(`[debug] Failed to read .env: ${String(err)}`);
  }
}
