async function isExcluded(path: string, patterns: string[]): Promise<boolean> {
  if (!patterns.length) return false;
  const { minimatch } = await import("minimatch");
  const normalized = path.replace(/\\/g, "/");
  return patterns.some((pattern) => minimatch(normalized, pattern, { dot: true }));
}

export async function filterExcludedFiles(files: string[], patterns: string[]): Promise<string[]> {
  if (!patterns.length) return files;
  const result: string[] = [];
  for (const file of files) {
    if (!(await isExcluded(file, patterns))) result.push(file);
  }
  return result;
}

export async function filterDiffByExcluded(diff: string, patterns: string[]): Promise<string> {
  if (!patterns.length) return diff;
  const lines = diff.split("\n");
  const output: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const file = match?.[2] || "";
      skip = file ? await isExcluded(file, patterns) : false;
    }
    if (!skip) output.push(line);
  }
  return output.join("\n");
}
