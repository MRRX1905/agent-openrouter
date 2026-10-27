const PATTERNS: Array<[RegExp, string]> = [
  [/sk-or-v1-[A-Za-z0-9_-]{16,}/g, 'sk-or-v1-[REDACTED]'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh*_[REDACTED]'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_[REDACTED]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]'],
  [/(Authorization:\s*Bearer\s+)\S+/gi, '$1[REDACTED]'],
];

export const redact = (text: string): string =>
  PATTERNS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
