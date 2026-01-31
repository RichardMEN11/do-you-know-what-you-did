import { chmodSync, existsSync, readFileSync, writeFileSync } from 'fs';

export type InstallHookResult =
  | { action: 'created' }
  | { action: 'updated'; backupPath: string }
  | { action: 'already' };

export function installPrePushHook(hookPath: string): InstallHookResult {
  const marker = '# do-you-know-what-you-did';
  const header = '#!/bin/sh\n';
  const snippet = `${marker}\ndo-you-know-what-you-did run "$@"\n`;

  if (!existsSync(hookPath)) {
    writeFileSync(hookPath, `${header}${snippet}`, 'utf8');
    chmodSync(hookPath, 0o755);
    return { action: 'created' };
  }

  const existing = readFileSync(hookPath, 'utf8');
  if (existing.includes(marker)) {
    return { action: 'already' };
  }

  const backupPath = `${hookPath}.bak`;
  writeFileSync(backupPath, existing, 'utf8');

  const trimmed = existing.replace(/^\uFEFF?/, '');
  const hasShebang = trimmed.startsWith('#!');
  const updated = hasShebang
    ? `${trimmed.trimEnd()}\n\n${snippet}`
    : `${trimmed.trimEnd()}\n\n${snippet}`;
  writeFileSync(hookPath, updated, 'utf8');
  chmodSync(hookPath, 0o755);
  return { action: 'updated', backupPath };
}
