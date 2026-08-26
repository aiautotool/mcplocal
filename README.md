# mcplocal

[![Powered by RustChain](https://img.shields.io/badge/Powered%20by-RustChain-orange)](https://rustchain.org)

Local Files MCP server that lets an MCP-capable client (including ChatGPT Web custom MCP apps where available) read, search and modify files inside one explicitly configured directory.

## Features

- Legacy HTTP+SSE: `GET /sse` + `POST /messages`
- Modern MCP HTTP endpoint: `/mcp`
- Health check: `/health`
- Sandbox: every file path is resolved under `MCP_ROOT`
- Optional Bearer authentication
- Read/search tools for project discovery
- Write/edit tools for coding workflows
- Delete is disabled by default
- No shell/CLI execution tool
- No dependency on an external database
- Node.js 20+

The MCP TypeScript SDK currently recommends Streamable HTTP for remote servers and treats HTTP+SSE as a backwards-compatibility transport. This project intentionally exposes both so older SSE clients can still connect while newer clients can use `/mcp`.

## 1. Run

```bash
cp .env.example .env
# edit MCP_ROOT if needed
npm start
```

Example:

```text
MCP_ROOT=~/Projects
MCP_HOST=127.0.0.1
MCP_PORT=8008
MCP_AUTH_TOKEN=change-me
```

Then:

```text
SSE:        http://127.0.0.1:8008/sse
Streamable: http://127.0.0.1:8008/mcp
Health:     http://127.0.0.1:8008/health
```

## 2. What ChatGPT Web can connect to

ChatGPT Web cannot directly reach `localhost` from the hosted service. A local MCP server must be made reachable through the supported Secure MCP Tunnel/private-network mechanism. After you have a remote MCP endpoint, add it as a custom MCP app in ChatGPT Developer Mode, scan its tools, and enable it.

For a tunnel that maps the local service, the local origin is:

```text
http://127.0.0.1:8008/sse
```

or, for modern clients:

```text
http://127.0.0.1:8008/mcp
```

Do not expose this server to the public internet without authentication and an explicit network policy.

## 3. Tools exposed to ChatGPT

- `list_files(path, recursive)`
- `read_file(path, startLine, endLine)`
- `write_file(path, content, createDirs)`
- `edit_file(path, oldText, newText, replaceAll)`
- `search_files(query, path, regex, caseSensitive, maxResults)`
- `create_directory(path)`
- `file_info(path)`
- `delete_file(path)` only when `MCP_ENABLE_DELETE=true`

Typical coding workflow:

1. `list_files` to understand the project.
2. `search_files` to locate symbols.
3. `read_file` to inspect the relevant code.
4. `edit_file` for a surgical change, or `write_file` for a new file.
5. `read_file` again to verify the result.

## 4. Security model

`MCP_ROOT` is the hard boundary. `../` traversal and absolute paths outside it are rejected. Binary/unreadable files are skipped by search. File size is capped by `MCP_MAX_FILE_BYTES`.

The server intentionally does not expose arbitrary shell execution. That means ChatGPT can edit code but cannot automatically run `rm`, `curl`, package managers, git commands, or arbitrary programs through this MCP.

For a development machine, keep `MCP_HOST=127.0.0.1` and use the supported Secure MCP Tunnel rather than binding the server to all interfaces.

## 5. Build

```bash
npm run build
node dist/server.js
```

The build is dependency-free and copies the runtime into `dist/`.

## 6. Docker

```bash
docker build -t mcplocal .
docker run --rm -p 8008:8008 -v "$PWD:/workspace" mcplocal
```

## 7. Example prompts in ChatGPT

```text
Inspect this local project and tell me where the authentication flow is implemented. Do not modify anything.
```

```text
Open src/server.js and refactor the error handling. Before changing it, read the relevant code. Then edit only the necessary section and show me what changed.
```

```text
Search the project for TODO comments and create a report at reports/todos.md.
```

## License

MIT
