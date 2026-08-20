import path from 'node:path';
import fs from 'node:fs/promises';

function expandHome(p) {
  if (p === '~') return process.env.HOME || process.cwd();
  if (p.startsWith('~/')) return path.join(process.env.HOME || process.cwd(), p.slice(2));
  return p;
}

export function resolveRoot(rawRoot) {
  const root = path.resolve(expandHome(rawRoot || ''));
  if (!rawRoot) throw new Error('MCP_ROOT is required');
  return root;
}

export async function ensureRoot(root) {
  await fs.mkdir(root, { recursive: true });
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error(`MCP_ROOT is not a directory: ${root}`);
}

export function safePath(root, userPath = '.') {
  if (typeof userPath !== 'string' || userPath.includes('\0')) throw new Error('Invalid path');
  const normalized = path.normalize(userPath);
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Path escapes MCP_ROOT');
  }
  return absolute;
}

export async function assertFileSize(file, maxBytes) {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Path is not a file');
  if (stat.size > maxBytes) throw new Error(`File exceeds MCP_MAX_FILE_BYTES (${maxBytes})`);
  return stat;
}

export function displayPath(root, absolute) {
  const rel = path.relative(root, absolute);
  return rel || '.';
}
