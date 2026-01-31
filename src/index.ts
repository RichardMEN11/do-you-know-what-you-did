#!/usr/bin/env node
/* eslint-disable no-console */
import { existsSync, unlinkSync } from 'fs';
import { buildCacheKey } from './lib';
import { loadConfig, loadEnvFile } from './config';
import { buildCombinedDiff, buildPrompt, parsePrePushStdin } from './diff';
import { cachePath, loadCache, saveCache } from './cache';
import { callLLM } from './llm';
import { runQuiz, startSpinner } from './ui';
import { getRepoRoot, isInsideWorkTree, runGit, getGitPath } from './git';
import { Config, PrePushLine } from './types';
import { Quiz } from './schema';
import { installPrePushHook } from './hooks';

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

function handleInstall(debug = false): number {
  const hookPath = getGitPath('hooks/pre-push', debug);
  const result = installPrePushHook(hookPath);
  if (result.action === 'created') {
    console.log(`Installed pre-push hook at ${hookPath}`);
  } else if (result.action === 'updated') {
    console.warn(`Existing pre-push hook backed up to ${result.backupPath}`);
    console.log(`Updated pre-push hook at ${hookPath}`);
  } else {
    console.log('Pre-push hook already contains # do-you-know-what-you-did');
  }
  return 0;
}

function handleClearCache(debug = false): number {
  const file = cachePath(debug);
  if (existsSync(file)) {
    unlinkSync(file);
  }
  console.log('Cache cleared.');
  return 0;
}

function fallbackRef(config: Config, debug = false): PrePushLine[] {
  console.warn(
    'No pre-push refs provided. Falling back to HEAD..@{u} if available.',
  );
  try {
    let localSha = '';
    try {
      localSha = runGit(['rev-parse', 'HEAD'], debug);
    } catch {
      if (config.allowFailOpen) {
        console.warn('No commits found. Skipping quiz.');
        return [];
      }
      throw new Error('No commits found.');
    }

    let remoteSha = '';
    try {
      remoteSha = runGit(['rev-parse', '@{u}'], debug);
    } catch {
      remoteSha = '';
    }

    if (!remoteSha) {
      if (config.allowFailOpen) {
        console.warn('No upstream found. Skipping quiz.');
        return [];
      }
      throw new Error('No upstream found.');
    }

    return [{ localRef: 'HEAD', localSha, remoteRef: '@{u}', remoteSha }];
  } catch (err) {
    if (config.allowFailOpen) {
      console.warn('Unable to determine diff. Skipping quiz.');
      return [];
    }
    throw err;
  }
}

async function handleRun(debug = false): Promise<number> {
  if (!isInsideWorkTree(debug)) {
    console.warn('Not inside a git worktree. Skipping quiz.');
    return 0;
  }

  const repoRoot = getRepoRoot(debug);
  loadEnvFile(repoRoot, debug);
  const config = loadConfig(repoRoot, debug);

  const stdin = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
  let lines = parsePrePushStdin(stdin);
  if (!lines.length) {
    lines = fallbackRef(config, debug);
    if (!lines.length) return config.allowFailOpen ? 0 : 1;
  }

  const diffBundle = await buildCombinedDiff(lines, config, debug);
  const prompt = buildPrompt(diffBundle);
  const key = buildCacheKey({
    range: diffBundle.rangeLabel,
    model: config.model,
    maxDiffChars: config.maxDiffChars,
    excludeFiles: config.excludeFiles,
  });

  const cacheFile = cachePath(debug);
  const cached = loadCache(cacheFile, debug);
  let quiz: Quiz;

  if (cached && cached.key === key) {
    quiz = cached.quiz;
    if (debug) console.error('[debug] Using cached quiz');
  } else {
    try {
      const stop = startSpinner('Generating quiz...');
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
    console.error(
      `\nFailed quiz (required ${config.passScore}/${quiz.questions.length}).`,
    );
    return 1;
  }

  console.log('\nQuiz passed. Proceeding with push.');
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes('--debug');
  const command = args.find((a) => !a.startsWith('-'));

  try {
    if (
      !command ||
      command === 'help' ||
      command === '--help' ||
      command === '-h'
    ) {
      printHelp();
      process.exit(0);
    }

    if (command === 'install') {
      process.exit(handleInstall(debug));
    }

    if (command === 'clear-cache') {
      process.exit(handleClearCache(debug));
    }

    if (command === 'run') {
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
