import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dist = path.join(root, 'dist');
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
for (const file of ['server.js', 'mcp.js', 'security.js']) {
  await fs.copyFile(path.join(root, 'src', file), path.join(dist, file));
}
await fs.writeFile(path.join(dist, 'package.json'), JSON.stringify({ type: 'module', name: 'mcplocal-dist', version: '0.1.0' }, null, 2) + '\n');
console.log(`Built ${dist}`);
