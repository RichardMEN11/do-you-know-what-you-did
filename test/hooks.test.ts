import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { installPrePushHook } from '../src/hooks';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dyd-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('installPrePushHook', () => {
  it('creates a new hook when none exists', () => {
    const dir = makeTempDir();
    const hookPath = join(dir, 'pre-push');
    const result = installPrePushHook(hookPath);
    const contents = readFileSync(hookPath, 'utf8');
    expect(result.action).toBe('created');
    expect(contents).toContain('#!/bin/sh');
    expect(contents).toContain('do-you-know-what-you-did run "$@"');
  });

  it('appends to an existing hook without a shebang and preserves content', () => {
    const dir = makeTempDir();
    const hookPath = join(dir, 'pre-push');
    writeFileSync(hookPath, 'echo hello\n', 'utf8');
    const result = installPrePushHook(hookPath);
    const contents = readFileSync(hookPath, 'utf8');
    expect(result.action).toBe('updated');
    expect(contents.startsWith('#!')).toBe(false);
    expect(contents).toContain('echo hello');
    expect(contents).toContain('do-you-know-what-you-did run "$@"');
    expect(existsSync(`${hookPath}.bak`)).toBe(true);
  });

  it('does nothing if the marker already exists', () => {
    const dir = makeTempDir();
    const hookPath = join(dir, 'pre-push');
    const original = '#!/bin/sh\n# do-you-know-what-you-did\ndo-you-know-what-you-did run "$@"\n';
    writeFileSync(hookPath, original, 'utf8');
    const result = installPrePushHook(hookPath);
    const contents = readFileSync(hookPath, 'utf8');
    expect(result.action).toBe('already');
    expect(contents).toBe(original);
    expect(existsSync(`${hookPath}.bak`)).toBe(false);
  });
});
