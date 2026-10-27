import path from 'node:path';
import type { PolicyAction, RiskLevel } from '../../shared/types';

export interface CommandRequest {
  executable: string;
  args: string[];
  cwd: string;
  workspace: string;
}

export interface PolicyDecision {
  action: PolicyAction;
  risk: RiskLevel;
  reason: string;
  needsNetwork: boolean;
  writesFiles: boolean;
  normalizedCommand: string;
}

const SHELLS = new Set(['cmd', 'command', 'powershell', 'pwsh', 'bash', 'sh', 'wscript', 'cscript', 'mshta']);
const CRITICAL = new Set([
  'reg', 'sc', 'net', 'shutdown', 'format', 'diskpart', 'bcdedit', 'runas',
  'takeown', 'icacls', 'attrib', 'cipher', 'wmic', 'schtasks', 'taskkill',
]);
const VERSION_FLAGS = new Set(['--version', '-v', '-V']);
const LOW_GIT = new Set(['status', 'diff', 'log', 'show', 'rev-parse']);
const MEDIUM_GIT = new Set(['add', 'commit', 'init', 'checkout', 'switch']);
const HIGH_GIT = new Set(['push', 'pull', 'fetch', 'remote', 'submodule']);
const PACKAGE_MANAGERS = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun']);
const NETWORK = new Set(['curl', 'wget', 'invoke-webrequest', 'ssh', 'scp']);
const DELETE = new Set(['rm', 'rmdir', 'del', 'erase']);
const MUTATE = new Set(['mkdir', 'cp', 'copy', 'mv', 'move', 'rename', 'tar', 'zip']);

const isInside = (root: string, target: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const isUnsafePath = (candidate: string, workspace: string): boolean => {
  if (/^https?:\/\//i.test(candidate)) return false;
  if (path.isAbsolute(candidate)) return !isInside(workspace, candidate);
  return candidate.split(/[\\/]/).includes('..');
};

const hasUnsafePathArg = (args: string[], workspace: string): boolean =>
  args.some(
    (arg) =>
      isUnsafePath(arg, workspace) ||
      arg.split('=').slice(1).some((segment) => isUnsafePath(segment, workspace)),
  );

const normalize = (executable: string): string =>
  executable.trim().toLowerCase().replace(/\.(exe|com)$/, '');

const result = (
  action: PolicyAction,
  risk: RiskLevel,
  reason: string,
  options: { needsNetwork?: boolean; writesFiles?: boolean } = {},
): PolicyDecision => ({
  action,
  risk,
  reason,
  needsNetwork: options.needsNetwork ?? false,
  writesFiles: options.writesFiles ?? false,
  normalizedCommand: '',
});

export function classifyCommand(input: CommandRequest): PolicyDecision {
  const raw = input.executable.trim();
  const executable = normalize(raw);
  const command = [raw, ...input.args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(' ');

  if (!executable) return { ...result('block', 'critical', 'POLICY: executable is required'), normalizedCommand: command };
  if (raw.includes('/') || raw.includes('\\')) {
    return { ...result('block', 'critical', 'POLICY: executable path is not allowed'), normalizedCommand: command };
  }
  if (!isInside(input.workspace, input.cwd)) {
    return { ...result('block', 'critical', 'POLICY: working directory is outside the workspace'), normalizedCommand: command };
  }
  if (hasUnsafePathArg(input.args, input.workspace)) {
    return { ...result('block', 'critical', 'POLICY: argument references a path outside the workspace'), normalizedCommand: command };
  }
  if (SHELLS.has(executable) || CRITICAL.has(executable)) {
    return { ...result('block', 'critical', `POLICY: ${executable} is blocked`), normalizedCommand: command };
  }
  if (VERSION_FLAGS.has(input.args[0] ?? '') && input.args.length === 1) {
    return { ...result('allow', 'low', 'version check'), normalizedCommand: command };
  }
  if (executable === 'git') {
    const sub = (input.args[0] ?? '').toLowerCase();
    if (LOW_GIT.has(sub) || (sub === 'branch' && input.args.length === 1)) {
      return { ...result('allow', 'low', 'read-only git command'), normalizedCommand: command };
    }
    if (HIGH_GIT.has(sub)) {
      return { ...result('approval', 'high', 'git network or repository mutation', { needsNetwork: true, writesFiles: true }), normalizedCommand: command };
    }
    if (MEDIUM_GIT.has(sub)) {
      return { ...result('approval', 'medium', 'git workspace mutation', { writesFiles: true }), normalizedCommand: command };
    }
    return { ...result('approval', 'medium', 'git command requires review'), normalizedCommand: command };
  }
  if (PACKAGE_MANAGERS.has(executable)) {
    const sub = (input.args[0] ?? '').toLowerCase();
    if (sub === 'install' || sub === 'i' || sub === 'ci' || sub === 'add') {
      return { ...result('approval', 'medium', 'dependency installation', { needsNetwork: true, writesFiles: true }), normalizedCommand: command };
    }
    if (sub === 'run' || sub === 'test' || sub === 'start') {
      return { ...result('approval', 'medium', 'project script execution', { writesFiles: true }), normalizedCommand: command };
    }
    if (sub === 'publish') {
      return { ...result('approval', 'high', 'package publication', { needsNetwork: true, writesFiles: true }), normalizedCommand: command };
    }
    return { ...result('approval', 'medium', 'package manager command requires review'), normalizedCommand: command };
  }
  if (NETWORK.has(executable)) {
    return { ...result('approval', 'high', 'network access', { needsNetwork: true }), normalizedCommand: command };
  }
  if (DELETE.has(executable)) {
    return { ...result('approval', 'high', 'file deletion', { writesFiles: true }), normalizedCommand: command };
  }
  if (MUTATE.has(executable)) {
    return { ...result('approval', 'medium', 'file mutation', { writesFiles: true }), normalizedCommand: command };
  }
  if (['node', 'python', 'py', 'php', 'pytest', 'vitest', 'tsc'].includes(executable)) {
    return { ...result('approval', 'medium', 'code execution requires review', { writesFiles: true }), normalizedCommand: command };
  }
  return { ...result('approval', 'medium', 'unknown executable requires review'), normalizedCommand: command };
}
