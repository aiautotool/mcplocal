import fs from 'node:fs/promises';
import path from 'node:path';
import { safePath, assertFileSize, displayPath } from './security.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'mcplocal', version: '0.1.0' };

export function createMcpHandler({ root, maxBytes, enableDelete }) {
  return async function handleRpc(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return error(message?.id ?? null, -32600, 'Invalid Request');
    }

    const id = message.id;
    const params = message.params || {};

    if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) {
      return null;
    }

    if (message.method === 'initialize') {
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: 'You can safely work with files only inside MCP_ROOT. Prefer read/search before modifying files. Do not invent file contents.'
      });
    }

    if (message.method === 'ping') return result(id, {});

    if (message.method === 'tools/list') {
      const tools = [
        { name: 'list_files', title: 'List local files', description: 'List files and directories inside the configured MCP root. Use this to discover project files.', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Relative directory path. Default: .' }, recursive: { type: 'boolean', description: 'Recursively list descendants. Default false.' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
        { name: 'read_file', title: 'Read local file', description: 'Read a UTF-8 text file from MCP_ROOT. Use before editing code.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
        { name: 'write_file', title: 'Write local file', description: 'Create or replace a UTF-8 text file inside MCP_ROOT. This modifies local files.', inputSchema: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' }, createDirs: { type: 'boolean', description: 'Create parent directories if needed.' } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
        { name: 'edit_file', title: 'Edit local file', description: 'Replace an exact text occurrence in a UTF-8 file. Fails if the old text is not found or is ambiguous unless replaceAll is true.', inputSchema: { type: 'object', required: ['path', 'oldText', 'newText'], properties: { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' }, replaceAll: { type: 'boolean' } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
        { name: 'search_files', title: 'Search local files', description: 'Search UTF-8 text files under MCP_ROOT for a literal or regular-expression pattern.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, path: { type: 'string', description: 'Relative directory or file path. Default: .' }, regex: { type: 'boolean' }, caseSensitive: { type: 'boolean' }, maxResults: { type: 'integer', minimum: 1, maximum: 500 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } },
        { name: 'create_directory', title: 'Create directory', description: 'Create a directory inside MCP_ROOT.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
        { name: 'file_info', title: 'File information', description: 'Get metadata for a file or directory.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }
      ];
      if (enableDelete) tools.push({ name: 'delete_file', title: 'Delete local file', description: 'Delete a file inside MCP_ROOT. This is destructive and is disabled by default.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } });
      return result(id, { tools });
    }

    if (message.method === 'tools/call') {
      const name = params.name;
      try {
        const output = await callTool(name, params.arguments || {});
        return result(id, { content: [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output, null, 2) }], isError: false });
      } catch (e) {
        return result(id, { content: [{ type: 'text', text: `ERROR: ${e.message}` }], isError: true });
      }
    }

    return error(id, -32601, `Method not found: ${message.method}`);
  };

  async function callTool(name, a) {
    if (name === 'list_files') {
      const dir = safePath(root, a.path || '.');
      const recursive = Boolean(a.recursive);
      const out = [];
      async function walk(current) {
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
          const abs = path.join(current, entry.name);
          const rel = displayPath(root, abs);
          out.push({ path: rel, type: entry.isDirectory() ? 'directory' : 'file' });
          if (recursive && entry.isDirectory()) await walk(abs);
          if (out.length >= 5000) return;
        }
      }
      await walk(dir);
      return { root: displayPath(root, dir), entries: out };
    }

    if (name === 'read_file') {
      const file = safePath(root, a.path);
      await assertFileSize(file, maxBytes);
      const text = await fs.readFile(file, 'utf8');
      const lines = text.split(/\r?\n/);
      const start = Math.max(1, Number(a.startLine || 1));
      const end = Math.min(lines.length, Number(a.endLine || lines.length));
      return { path: displayPath(root, file), startLine: start, endLine: end, content: lines.slice(start - 1, end).join('\n') };
    }

    if (name === 'write_file') {
      const file = safePath(root, a.path);
      const content = String(a.content ?? '');
      if (Buffer.byteLength(content, 'utf8') > maxBytes) throw new Error(`Content exceeds MCP_MAX_FILE_BYTES (${maxBytes})`);
      if (a.createDirs) await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, 'utf8');
      return { ok: true, path: displayPath(root, file), bytes: Buffer.byteLength(content, 'utf8') };
    }

    if (name === 'edit_file') {
      const file = safePath(root, a.path);
      await assertFileSize(file, maxBytes);
      const text = await fs.readFile(file, 'utf8');
      const oldText = String(a.oldText ?? '');
      if (!oldText) throw new Error('oldText cannot be empty');
      const occurrences = text.split(oldText).length - 1;
      if (occurrences === 0) throw new Error('oldText was not found');
      if (occurrences > 1 && !a.replaceAll) throw new Error(`oldText occurs ${occurrences} times; use replaceAll=true or provide a larger unique block`);
      const next = a.replaceAll ? text.split(oldText).join(String(a.newText ?? '')) : text.replace(oldText, String(a.newText ?? ''));
      if (Buffer.byteLength(next, 'utf8') > maxBytes) throw new Error(`Result exceeds MCP_MAX_FILE_BYTES (${maxBytes})`);
      await fs.writeFile(file, next, 'utf8');
      return { ok: true, path: displayPath(root, file), replacements: a.replaceAll ? occurrences : 1 };
    }

    if (name === 'search_files') {
      const target = safePath(root, a.path || '.');
      const query = String(a.query ?? '');
      if (!query) throw new Error('query cannot be empty');
      const regex = Boolean(a.regex);
      const flags = a.caseSensitive ? 'g' : 'gi';
      const matcher = regex ? new RegExp(query, flags) : null;
      const needle = a.caseSensitive ? query : query.toLowerCase();
      const maxResults = Math.min(500, Math.max(1, Number(a.maxResults || 100)));
      const results = [];
      const files = [];
      const stat = await fs.stat(target);
      if (stat.isFile()) files.push(target);
      else {
        async function collect(dir) {
          for (const e of await fs.readdir(dir, { withFileTypes: true })) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) { if (!['.git', 'node_modules', 'dist', 'build'].includes(e.name)) await collect(abs); }
            else files.push(abs);
            if (files.length > 5000) return;
          }
        }
        await collect(target);
      }
      for (const file of files) {
        if (results.length >= maxResults) break;
        try {
          await assertFileSize(file, maxBytes);
          const text = await fs.readFile(file, 'utf8');
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            const line = lines[i];
            const found = matcher ? matcher.test(line) : (a.caseSensitive ? line.includes(needle) : line.toLowerCase().includes(needle));
            if (found) results.push({ path: displayPath(root, file), line: i + 1, text: line.slice(0, 1000) });
            if (matcher) matcher.lastIndex = 0;
          }
        } catch { /* skip binary/unreadable files */ }
      }
      return { query, results, truncated: results.length >= maxResults };
    }

    if (name === 'create_directory') {
      const dir = safePath(root, a.path);
      await fs.mkdir(dir, { recursive: true });
      return { ok: true, path: displayPath(root, dir) };
    }

    if (name === 'file_info') {
      const target = safePath(root, a.path);
      const stat = await fs.stat(target);
      return { path: displayPath(root, target), type: stat.isDirectory() ? 'directory' : 'file', size: stat.size, modified: stat.mtime.toISOString() };
    }

    if (name === 'delete_file') {
      if (!enableDelete) throw new Error('delete_file is disabled; set MCP_ENABLE_DELETE=true to enable it');
      const file = safePath(root, a.path);
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('delete_file only accepts files');
      await fs.unlink(file);
      return { ok: true, path: displayPath(root, file) };
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}

function result(id, result) { return { jsonrpc: '2.0', id, result }; }
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
