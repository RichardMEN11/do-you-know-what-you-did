import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { Quiz, quizSchema } from "./schema";
import { getGitPath } from "./git";

export function cachePath(debug = false): string {
  return getGitPath("do-you-know-what-you-did-cache.json", debug);
}

export function loadCache(path: string, debug = false): { key: string; quiz: Quiz } | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    const quiz = quizSchema.parse(raw.quiz);
    return { key: raw.key, quiz };
  } catch (err) {
    if (debug) console.error(`[debug] Cache invalid: ${String(err)}`);
    return null;
  }
}

export function saveCache(path: string, key: string, quiz: Quiz): void {
  const dir = path.split("/").slice(0, -1).join("/");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify({ key, quiz }, null, 2), "utf8");
}
