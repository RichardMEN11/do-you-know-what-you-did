#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  mkdirSync,
  unlinkSync,
  openSync
} from "fs";
import { join } from "path";
import readline from "readline";
import tty from "tty";
import { quizSchema, Quiz } from "./schema";
import { buildCacheKey, isAllZeroSha, truncateDiff } from "./lib";

const DEFAULTS = {
  model: "gpt-4o-mini",
  passScore: 2,
  maxDiffChars: 25000,
  allowFailOpen: true,
  excludeFiles: [] as string[]
};

type Config = typeof DEFAULTS;

type PrePushLine = {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
};

type DiffBundle = {
  rangeLabel: string;
  diffText: string;
  files: string[];
  truncated: boolean;
};

function runGit(args: string[], debug = false): string {
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

function getRepoRoot(debug = false): string {
  return runGit(["rev-parse", "--show-toplevel"], debug).trim();
}

function isInsideWorkTree(debug = false): boolean {
  try {
    const out = runGit(["rev-parse", "--is-inside-work-tree"], debug).trim();
    return out === "true";
  } catch {
    return false;
  }
}

function getGitPath(path: string, debug = false): string {
  return runGit(["rev-parse", "--git-path", path], debug).trim();
}

function loadConfig(repoRoot: string, debug = false): Config {
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

function loadEnvFile(repoRoot: string, debug = false): void {
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

function parsePrePushStdin(input: string): PrePushLine[] {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha } as PrePushLine;
  });
}

function getDefaultBranch(debug = false): string | null {
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

function redactSecrets(input: string): string {
  let text = input;
  text = text.replace(
    /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
    "[REDACTED PRIVATE KEY]"
  );
  text = text.replace(/AKIA[0-9A-Z]{16}/g, "REDACTED_AWS_ACCESS_KEY");
  text = text.replace(
    /(api[_-]?key|token|secret|password)\s*[:=]\s*([^\s'"`]+)/gi,
    (_m, key) => `${key}=REDACTED`
  );
  text = text.replace(
    /(aws_secret_access_key)\s*[:=]\s*([^\s'"`]+)/gi,
    (_m, key) => `${key}=REDACTED`
  );
  text = text.replace(
    /authorization\s*:\s*bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    "authorization: bearer REDACTED"
  );
  return text;
}

async function isExcluded(path: string, patterns: string[]): Promise<boolean> {
  if (!patterns.length) return false;
  const { minimatch } = await import("minimatch");
  return patterns.some((pattern) => minimatch(path, pattern, { dot: true }));
}

async function filterExcludedFiles(files: string[], patterns: string[]): Promise<string[]> {
  if (!patterns.length) return files;
  const result: string[] = [];
  for (const file of files) {
    if (!(await isExcluded(file, patterns))) result.push(file);
  }
  return result;
}

async function filterDiffByExcluded(diff: string, patterns: string[]): Promise<string> {
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

function buildPrompt(bundle: DiffBundle): string {
  return [
    `Changed files (filtered):`,
    bundle.files.length ? bundle.files.join("\n") : "(none)",
    "",
    `Diff (unified=3)${bundle.truncated ? " [TRUNCATED]" : ""}:`,
    bundle.diffText
  ].join("\n");
}

async function callLLM(prompt: string, config: Config, debug = false): Promise<Quiz> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const system =
    "You are a code review assistant. Generate exactly 3 multiple-choice questions about the diff. " +
    "Return JSON only matching the provided schema. Each explanation must mention a filename and what changed.";

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content:
          `Return JSON that matches this schema strictly:\n` +
          `{\n  \"version\": 1,\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"question\": \"string\",\n      \"options\": { \"A\": \"string\", \"B\": \"string\", \"C\": \"string\", \"D\": \"string\" },\n      \"correct\": \"A\",\n      \"explanation\": \"string\"\n    }\n  ]\n}\n\n` +
          `Constraints:\n- questions.length must be 3\n- ids are q1, q2, q3\n- correct is one of A|B|C|D\n- explanation must cite filename + what changed\n` +
          (lastError ? `\nThe previous output failed because: ${lastError}\n` : "") +
          `\nHere is the diff context:\n${prompt}`
      }
    ];

    const body = {
      model: config.model,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM request failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (debug) console.error(`[debug] LLM raw content: ${String(content).slice(0, 2000)}`);

    try {
      const parsed = JSON.parse(content);
      const quiz = quizSchema.parse(parsed);
      return quiz;
    } catch (err) {
      lastError = (err as Error).message;
      if (debug) console.error(`[debug] Validation error: ${lastError}`);
    }
  }

  throw new Error(lastError || "LLM response invalid");
}

function startSpinner(label: string): () => void {
  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  process.stdout.write(`${frames[i]} ${label}`);
  const id = setInterval(() => {
    i = (i + 1) % frames.length;
    process.stdout.write(`\r${frames[i]} ${label}`);
  }, 80);
  return () => {
    clearInterval(id);
    process.stdout.write("\r");
    process.stdout.write(" ".repeat(label.length + 2));
    process.stdout.write("\r");
  };
}

async function getDiffForLine(
  line: PrePushLine,
  config: Config,
  debug = false
): Promise<DiffBundle> {
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

async function buildCombinedDiff(
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

  let filteredFiles = await filterExcludedFiles(combinedFiles, config.excludeFiles);
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

function cachePath(debug = false): string {
  return getGitPath("do-you-know-what-you-did-cache.json", debug);
}

function loadCache(path: string, debug = false): { key: string; quiz: Quiz } | null {
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

function saveCache(path: string, key: string, quiz: Quiz): void {
  const dir = path.split("/").slice(0, -1).join("/");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify({ key, quiz }, null, 2), "utf8");
}

function renderProgress(current: number, total: number): string {
  const width = 20;
  const filled = Math.round((current / total) * width);
  const bar = "#".repeat(filled) + "-".repeat(width - filled);
  return `Progress: [${bar}] ${current}/${total}`;
}

function shuffleOptions(values: string[]): string[] {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

async function runQuiz(quiz: Quiz, config: Config): Promise<boolean> {
  let input: NodeJS.ReadStream;
  let output: NodeJS.WriteStream;

  if (process.stdin.isTTY && process.stdout.isTTY) {
    input = process.stdin;
    output = process.stdout;
  } else {
    try {
      const ttyIn = openSync("/dev/tty", "r");
      const ttyOut = openSync("/dev/tty", "w");
      input = new tty.ReadStream(ttyIn);
      output = new tty.WriteStream(ttyOut);
    } catch {
      console.warn("Non-interactive terminal detected. Skipping quiz.");
      return config.allowFailOpen;
    }
  }

  readline.emitKeypressEvents(input);
  if (input.isTTY) input.setRawMode(true);
  const rl = readline.createInterface({ input, output });
  let score = 0;

  for (let index = 0; index < quiz.questions.length; index++) {
    const q = quiz.questions[index];
    const labels: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
    const baseTexts = [q.options.A, q.options.B, q.options.C, q.options.D];
    const shuffledTexts = shuffleOptions(baseTexts);
    const options: Array<["A" | "B" | "C" | "D", string]> = shuffledTexts.map((t, i) => [labels[i], t]);
    const correctText = q.options[q.correct];
    const correctIndex = shuffledTexts.findIndex((t) => t === correctText);
    const correctKey = correctIndex >= 0 ? labels[correctIndex] : q.correct;
    let idx = 0;

    const header = `Question ${index + 1}/${quiz.questions.length}`;
    const progressLine = renderProgress(index + 1, quiz.questions.length);

    const render = () => {
      output!.write("\x1b[2J\x1b[H");
      output!.write(`${header}\n`);
      output!.write(`${progressLine}\n\n`);
      output!.write(`${q.question}\n`);
      for (let i = 0; i < options.length; i++) {
        const [key, text] = options[i];
        const prefix = i === idx ? ">" : " ";
        output!.write(`${prefix} ${key}) ${text}\n`);
      }
      output!.write("Use ↑/↓ or A/B/C/D. Press Enter to lock in.\n");
    };

    render();

    const answer: "A" | "B" | "C" | "D" = await new Promise((resolve) => {
      const onKey = (_str: string, key: readline.Key) => {
        if (key.name === "up") {
          idx = (idx + options.length - 1) % options.length;
          render();
          return;
        }
        if (key.name === "down") {
          idx = (idx + 1) % options.length;
          render();
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          input!.off("keypress", onKey);
          resolve(options[idx][0]);
          return;
        }
        const upper = (_str || "").toUpperCase();
        const letterIdx = options.findIndex((o) => o[0] === upper);
        if (letterIdx >= 0) {
          idx = letterIdx;
          render();
          return;
        }
      };
      input!.on("keypress", onKey);
    });

    const correct = answer === correctKey;
    if (correct) score += 1;
    output!.write(`${correct ? "Correct!" : "Not quite."}\n`);
    output!.write(`Correct answer: ${correctKey}\n`);
    output!.write(`Explanation: ${q.explanation}\n`);
  }

  rl.close();
  if (input.isTTY) input.setRawMode(false);

  output!.write(`\nScore: ${score}/${quiz.questions.length}\n`);
  return score >= config.passScore;
}

async function handleRun(debug = false): Promise<number> {
  if (!isInsideWorkTree(debug)) {
    console.warn("Not inside a git worktree. Skipping quiz.");
    return 0;
  }

  const repoRoot = getRepoRoot(debug);
  loadEnvFile(repoRoot, debug);
  const config = loadConfig(repoRoot, debug);
  const stdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  const lines = parsePrePushStdin(stdin);

  if (!lines.length) {
    console.warn("No pre-push refs provided. Falling back to HEAD..@{u} if available.");
    try {
      let localSha = "";
      try {
        localSha = runGit(["rev-parse", "HEAD"], debug);
      } catch {
        if (config.allowFailOpen) {
          console.warn("No commits found. Skipping quiz.");
          return 0;
        }
        console.error("No commits found. Blocking push.");
        return 1;
      }
      let remoteSha = "";
      try {
        remoteSha = runGit(["rev-parse", "@{u}"], debug);
      } catch {
        remoteSha = "";
      }
      if (!remoteSha) {
        if (config.allowFailOpen) {
          console.warn("No upstream found. Skipping quiz.");
          return 0;
        }
        console.error("No upstream found. Blocking push.");
        return 1;
      }
      lines.push({ localRef: "HEAD", localSha, remoteRef: "@{u}", remoteSha });
    } catch (err) {
      if (config.allowFailOpen) {
        console.warn("Unable to determine diff. Skipping quiz.");
        return 0;
      }
      console.error(`Unable to determine diff: ${String(err)}`);
      return 1;
    }
  }

  const diffBundle = await buildCombinedDiff(lines, config, debug);
  const prompt = buildPrompt(diffBundle);
  const key = buildCacheKey({
    range: diffBundle.rangeLabel,
    model: config.model,
    maxDiffChars: config.maxDiffChars
  });

  const cacheFile = cachePath(debug);
  const cached = loadCache(cacheFile, debug);
  let quiz: Quiz;

  if (cached && cached.key === key) {
    quiz = cached.quiz;
    if (debug) console.error("[debug] Using cached quiz");
  } else {
    try {
      const stop = startSpinner("Generating quiz…");
      try {
        quiz = await callLLM(prompt, config, debug);
      } finally {
        stop();
      }
      saveCache(cacheFile, key, quiz);
    } catch (err) {
      const msg = `Quiz generation failed: ${String(err)}`;
      if (config.allowFailOpen) {
        console.warn(msg);
        return 0;
      }
      console.error(msg);
      return 1;
    }
  }

  const pass = await runQuiz(quiz, config);
  if (!pass) {
    console.error(`\nFailed quiz (required ${config.passScore}/${quiz.questions.length}).`);
    return 1;
  }

  console.log("\nQuiz passed. Proceeding with push.");
  return 0;
}

function handleInstall(debug = false): number {
  const hookPath = getGitPath("hooks/pre-push", debug);
  const contents = "#!/bin/sh\nexec do-you-know-what-you-did run \"$@\"\n";
  writeFileSync(hookPath, contents, "utf8");
  chmodSync(hookPath, 0o755);
  console.log(`Installed pre-push hook at ${hookPath}`);
  return 0;
}

function handleClearCache(debug = false): number {
  const file = cachePath(debug);
  if (existsSync(file)) {
    unlinkSync(file);
  }
  console.log("Cache cleared.");
  return 0;
}

function printHelp(): void {
  console.log(`do-you-know-what-you-did

Usage:
  do-you-know-what-you-did install
  do-you-know-what-you-did run
  do-you-know-what-you-did clear-cache

Options:
  --debug   Print diagnostics (no secrets)
`);
}

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const command = args.find((a) => !a.startsWith("-"));

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      process.exit(0);
    }

    if (command === "install") {
      process.exit(handleInstall(debug));
    }

    if (command === "clear-cache") {
      process.exit(handleClearCache(debug));
    }

    if (command === "run") {
      const code = await handleRun(debug);
      process.exit(code);
    }

    printHelp();
    process.exit(1);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}

main();
