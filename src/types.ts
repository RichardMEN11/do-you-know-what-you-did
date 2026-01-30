export const DEFAULTS = {
  model: "gpt-4o-mini",
  passScore: 2,
  maxDiffChars: 25000,
  allowFailOpen: true,
  excludeFiles: [] as string[]
};

export type Config = typeof DEFAULTS;

export type PrePushLine = {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
};

export type DiffBundle = {
  rangeLabel: string;
  diffText: string;
  files: string[];
  truncated: boolean;
};
