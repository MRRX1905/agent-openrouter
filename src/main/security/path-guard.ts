import { realpath as fsRealpath } from 'node:fs/promises';
import path from 'node:path';

export type RealpathFn = (value: string) => Promise<string>;

const assertInside = (root: string, target: string): void => {
  const relative = path.relative(root, target);
  if (relative === '') return;
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('POLICY: path outside workspace');
  }
};

export async function resolveInWorkspace(
  root: string,
  relative: string,
  realpathFn: RealpathFn = fsRealpath,
): Promise<string> {
  if (!relative.trim()) throw new Error('VALIDATION: path is required');
  if (relative.includes('\0')) throw new Error('VALIDATION: invalid path');

  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relative);
  assertInside(absoluteRoot, absolute);

  const realRoot = await realpathFn(absoluteRoot);
  let realTarget: string;
  try {
    realTarget = await realpathFn(absolute);
  } catch {
    const segments = [path.basename(absolute)];
    let ancestor = path.dirname(absolute);
    for (;;) {
      try {
        realTarget = path.join(await realpathFn(ancestor), ...segments);
        break;
      } catch {
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw new Error('POLICY: path outside workspace');
        segments.unshift(path.basename(ancestor));
        ancestor = parent;
      }
    }
  }
  assertInside(realRoot, realTarget);
  return absolute;
}
