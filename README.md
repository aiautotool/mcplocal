# mcplocal

Local Files MCP server that lets an MCP-capable client (including ChatGPT Web custom MCP apps where available) read, search and modify files inside one explicitly configured directory.

## Features

- Legacy HTTP+SSE: `GET /sse` + `POST /messages`
- Modern MCP HTTP endpoint: `/mcp`
- Secure path traversal protection
- Optional bearer-token authentication
- File read/write/search/delete tools
- Configurable root directory and file-size limits
- Node.js 22 support

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

The default server listens on `127.0.0.1:8008`.

## Build

```bash
npm run build
npm test
```

## MCP endpoints

- `http://127.0.0.1:8008/sse`
- `http://127.0.0.1:8008/mcp`

For remote access, use a secure tunnel/reverse proxy and set `MCP_AUTH_TOKEN`.
