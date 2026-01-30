import { openSync } from "fs";
import tty from "tty";
import { select } from "@inquirer/prompts";
import { Config } from "./types";
import { Quiz } from "./schema";

export function startSpinner(label: string): () => void {
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

function getPromptIO(config: Config): { input: NodeJS.ReadStream; output: NodeJS.WriteStream } | null {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return { input: process.stdin, output: process.stdout };
  }
  try {
    const ttyIn = openSync("/dev/tty", "r");
    const ttyOut = openSync("/dev/tty", "w");
    return { input: new tty.ReadStream(ttyIn), output: new tty.WriteStream(ttyOut) };
  } catch {
    console.warn("Non-interactive terminal detected. Skipping quiz.");
    return null;
  }
}

function writeOut(output: NodeJS.WriteStream, text: string): void {
  if (output.writableEnded || output.destroyed) {
    process.stdout.write(text);
    return;
  }
  output.write(text);
}

export async function runQuiz(quiz: Quiz, config: Config): Promise<boolean> {
  const io = getPromptIO(config);
  if (!io) return config.allowFailOpen;
  const { input } = io;
  let output = io.output;
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

    writeOut(output, "\x1b[2J\x1b[H");
    writeOut(output, `Question ${index + 1}/${quiz.questions.length}\n`);
    writeOut(output, `${renderProgress(index + 1, quiz.questions.length)}\n\n`);

    const answer = await select<"A" | "B" | "C" | "D">(
      {
        message: q.question,
        choices: options.map(([key, text]) => ({ name: `${key}) ${text}`, value: key })),
        loop: false
      },
      { input, output }
    );

    if (output.writableEnded || output.destroyed) output = process.stdout;

    const correct = answer === correctKey;
    if (correct) score += 1;
    writeOut(output, `${correct ? "Correct!" : "Not quite."}\n`);
    writeOut(output, `Correct answer: ${correctKey}\n`);
    writeOut(output, `Explanation: ${q.explanation}\n\n`);
  }

  writeOut(output, `Score: ${score}/${quiz.questions.length}\n`);
  return score >= config.passScore;
}
