import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { resolveRoot, ensureRoot } from './security.js';
import { createMcpHandler } from './mcp.js';

const HOST = process.env.MCP_HOST || '127.0.0.1';
const PORT = Number(process.env.MCP_PORT || 8008);
const ROOT = resolveRoot(process.env.MCP_ROOT || '~/Projects');
const MAX_BYTES = Number(process.env.MCP_MAX_FILE_BYTES || 5 * 1024 * 1024);
const ENABLE_DELETE = String(process.env.MCP_ENABLE_DELETE || 'false').toLowerCase() === 'true';
const AUTH = process.env.MCP_AUTH_TOKEN || '';

await ensureRoot(ROOT);
const rpc = createMcpHandler({ root: ROOT, maxBytes: MAX_BYTES, enableDelete: ENABLE_DELETE });
const sessions = new Map();

function authorized(req) {
  if (!AUTH) return true;
  const value = req.headers.authorization || '';
  return value === `Bearer ${AUTH}`;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data), 'cache-control': 'no-store' });
  res.end(data);
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, content-type, mcp-session-id, last-event-id');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sse(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write(': connected\n\n');
}

async function handleSse(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/sse') {
    const sessionId = crypto.randomUUID();
    sse(res);
    const messageUrl = `/messages?sessionId=${encodeURIComponent(sessionId)}`;
    res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);
    sessions.set(sessionId, { res, createdAt: Date.now() });
    req.on('close', () => sessions.delete(sessionId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/messages') {
    const sessionId = url.searchParams.get('sessionId');
    const session = sessionId && sessions.get(sessionId);
    if (!session) return sendJson(res, 404, { error: 'Unknown SSE session' });
    const body = await readBody(req);
    const response = await rpc(body);
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
    if (response) {
      session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }
    return;
  }
}

async function handleStreamable(req, res, url) {
  if (url.pathname !== '/mcp') return false;
  if (req.method === 'POST') {
    const body = await readBody(req);
    const response = await rpc(body);
    if (response === null) { res.writeHead(202); return res.end(); }
    sendJson(res, 200, response);
    return true;
  }
  if (req.method === 'GET') {
    sse(res);
    res.write('event: endpoint\ndata: /mcp\n\n');
    req.on('close', () => {});
    return true;
  }
  if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
  return true;
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (!authorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, name: 'mcplocal', version: '0.1.0', root: ROOT, protocol: '2025-06-18' });
    if (url.pathname === '/sse' || url.pathname === '/messages') return await handleSse(req, res, url);
    if (url.pathname === '/mcp') return await handleStreamable(req, res, url);
    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    if (!res.headersSent) sendJson(res, 400, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mcplocal listening on http://${HOST}:${PORT}`);
  console.log(`SSE endpoint:        http://${HOST}:${PORT}/sse`);
  console.log(`Streamable endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`Health:              http://${HOST}:${PORT}/health`);
  console.log(`MCP_ROOT:            ${ROOT}`);
  console.log(`Auth:                ${AUTH ? 'enabled' : 'disabled'}`);
});
