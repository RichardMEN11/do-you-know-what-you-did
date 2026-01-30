import { spawnSync } from "child_process";

export function runGit(args: string[], debug = false): string {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (debug) {
    console.error(`[debug] git ${args.join(" ")}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trimEnd();
}

export function getRepoRoot(debug = false): string {
  return runGit(["rev-parse", "--show-toplevel"], debug).trim();
}

export function isInsideWorkTree(debug = false): boolean {
  try {
    const out = runGit(["rev-parse", "--is-inside-work-tree"], debug).trim();
    return out === "true";
  } catch {
    return false;
  }
}

export function getGitPath(path: string, debug = false): string {
  return runGit(["rev-parse", "--git-path", path], debug).trim();
}

export function getDefaultBranch(debug = false): string | null {
  try {
    const sym = runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], debug);
    const match = sym.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match) return `origin/${match[1]}`;
  } catch {}
  try {
    const ref = runGit(["rev-parse", "--abbrev-ref", "origin/HEAD"], debug);
    if (ref) return ref.trim();
  } catch {}
  try {
    runGit(["rev-parse", "--verify", "main"], debug);
    return "main";
  } catch {}
  try {
    runGit(["rev-parse", "--verify", "master"], debug);
    return "master";
  } catch {}
  return null;
}
