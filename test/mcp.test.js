import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMcpHandler } from '../src/mcp.js';

test('initialize and tools/list', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcplocal-'));
  const rpc = createMcpHandler({ root, maxBytes: 1024 * 1024, enableDelete: false });
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.name, 'mcplocal');
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.ok(list.result.tools.some(x => x.name === 'read_file'));
});

test('write then read inside sandbox', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcplocal-'));
  const rpc = createMcpHandler({ root, maxBytes: 1024 * 1024, enableDelete: false });
  const w = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_file', arguments: { path: 'hello.txt', content: 'hello' } } });
  assert.equal(w.result.isError, false);
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'hello.txt' } } });
  assert.match(r.result.content[0].text, /hello/);
});

test('blocks path traversal', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcplocal-'));
  const rpc = createMcpHandler({ root, maxBytes: 1024 * 1024, enableDelete: false });
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_file', arguments: { path: '../secret.txt' } } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /escapes MCP_ROOT/);
});
