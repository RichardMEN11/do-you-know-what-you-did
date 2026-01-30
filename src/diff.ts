import { Config, DiffBundle, PrePushLine } from "./types";
import { getDefaultBranch, runGit } from "./git";
import { isAllZeroSha, truncateDiff } from "./lib";
import { redactSecrets } from "./redact";
import { filterDiffByExcluded, filterExcludedFiles } from "./exclude";

export function parsePrePushStdin(input: string): PrePushLine[] {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha } as PrePushLine;
  });
}

export function buildPrompt(bundle: DiffBundle): string {
  return [
    `Changed files (filtered):`,
    bundle.files.length ? bundle.files.join("\n") : "(none)",
    "",
    `Diff (unified=3)${bundle.truncated ? " [TRUNCATED]" : ""}:`,
    bundle.diffText
  ].join("\n");
}

async function getDiffForLine(line: PrePushLine, config: Config, debug = false): Promise<DiffBundle> {
  const { localSha, remoteSha } = line;
  if (!localSha) throw new Error("Missing local SHA");

  if (isAllZeroSha(remoteSha)) {
    const defaultBranch = getDefaultBranch(debug);
    if (defaultBranch) {
      const mergeBase = runGit(["merge-base", localSha, defaultBranch], debug);
      const range = `${mergeBase}..${localSha}`;
      const diffRaw = runGit(["diff", "--unified=3", range], debug);
      const filesRaw = runGit(["diff", "--name-only", range], debug);
      const files = filesRaw.split("\n").filter(Boolean);
      return { rangeLabel: range, diffText: diffRaw, files, truncated: false };
    }
    const diffRaw = runGit(["show", localSha], debug);
    const filesRaw = runGit(["show", "--name-only", "--pretty=", localSha], debug);
    const files = filesRaw.split("\n").filter(Boolean);
    return { rangeLabel: localSha, diffText: diffRaw, files, truncated: false };
  }

  const mergeBase = runGit(["merge-base", localSha, remoteSha], debug);
  const range = `${mergeBase}..${localSha}`;
  const diffRaw = runGit(["diff", "--unified=3", range], debug);
  const filesRaw = runGit(["diff", "--name-only", range], debug);
  const files = filesRaw.split("\n").filter(Boolean);
  return { rangeLabel: range, diffText: diffRaw, files, truncated: false };
}

export async function buildCombinedDiff(
  lines: PrePushLine[],
  config: Config,
  debug = false
): Promise<DiffBundle> {
  const bundles = [] as DiffBundle[];
  for (const line of lines) {
    bundles.push(await getDiffForLine(line, config, debug));
  }

  const combinedRange = bundles.map((b) => b.rangeLabel).join(";");
  const combinedFiles = Array.from(new Set(bundles.flatMap((b) => b.files)));
  const combinedDiff = bundles
    .map((b) => `# Range ${b.rangeLabel}\n${b.diffText}`)
    .join("\n\n");

  const filteredFiles = await filterExcludedFiles(combinedFiles, config.excludeFiles);
  let filteredDiff = await filterDiffByExcluded(combinedDiff, config.excludeFiles);

  filteredDiff = redactSecrets(filteredDiff);
  const { text: truncatedDiff, truncated } = truncateDiff(filteredDiff, config.maxDiffChars);

  return {
    rangeLabel: combinedRange,
    diffText: truncatedDiff,
    files: filteredFiles,
    truncated
  };
}
