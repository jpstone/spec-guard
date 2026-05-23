/**
 * spec-guard serve — local markdown viewer.
 *
 * Starts an HTTP server that renders .md files from the repo as styled HTML,
 * with a navigation sidebar and HMR via WebSocket.
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { watch } from 'chokidar';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 7777;

/** Recursively collect all .md file paths under `root`, returning repo-relative paths. */
async function collectMdFiles(root) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.spec-guard') continue;
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  // Include hidden .spec-guard dir explicitly
  await walk(root);
  return results.sort();
}

/** Build the sidebar HTML from a list of repo-relative .md paths. */
function buildSidebar(files, activePath) {
  // Group by directory
  const groups = {};
  for (const f of files) {
    const parts = f.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(f);
  }

  let html = '<nav class="sidebar"><ul>';
  for (const [dir, group] of Object.entries(groups)) {
    if (dir) html += `<li class="dir-label">${dir}/</li>`;
    for (const f of group) {
      const label = f.split('/').pop();
      const href = '/' + f;
      const active = f === activePath ? ' class="active"' : '';
      html += `<li${active}><a href="${href}">${label}</a></li>`;
    }
  }
  html += '</ul></nav>';
  return html;
}

/** Render a .md file path into a full HTML page. */
async function renderPage(root, filePath, allFiles) {
  const absPath = join(root, filePath);
  const raw = await readFile(absPath, 'utf8');
  const content = marked.parse(raw);
  const sidebar = buildSidebar(allFiles, filePath);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filePath}</title>
  <link rel="stylesheet" href="/__sg_assets__/github-markdown.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { display: flex; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fa; }
    .sidebar { width: 240px; min-width: 240px; height: 100vh; overflow-y: auto; background: #fff; border-right: 1px solid #d0d7de; padding: 16px 0; position: sticky; top: 0; }
    .sidebar ul { list-style: none; }
    .sidebar li { padding: 0; }
    .sidebar .dir-label { padding: 8px 16px 2px; font-size: 11px; font-weight: 600; color: #57606a; text-transform: uppercase; letter-spacing: 0.05em; }
    .sidebar a { display: block; padding: 4px 16px 4px 24px; font-size: 13px; color: #0969da; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sidebar a:hover { background: #f3f4f6; }
    .sidebar li.active a { background: #dbeafe; color: #1d4ed8; font-weight: 600; }
    .main { flex: 1; overflow-y: auto; padding: 32px; }
    .markdown-body { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #d0d7de; border-radius: 6px; padding: 32px; }
  </style>
</head>
<body>
  ${sidebar}
  <main class="main">
    <article class="markdown-body">${content}</article>
  </main>
  <script>
    (function () {
      var ws = new WebSocket('ws://' + location.host + '/__hmr');
      ws.onmessage = function (e) {
        if (JSON.parse(e.data).type === 'reload') location.reload();
      };
      ws.onclose = function () {
        // Reconnect on close (server restarted)
        setTimeout(function () { location.reload(); }, 1000);
      };
    })();
  </script>
</body>
</html>`;
}

/** Minimal github-markdown-css (subset). Served from memory to avoid a file dependency. */
const GITHUB_MARKDOWN_CSS = `
.markdown-body { color: #1f2328; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif; font-size: 16px; line-height: 1.5; word-wrap: break-word; }
.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
.markdown-body h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body p { margin-top: 0; margin-bottom: 16px; }
.markdown-body ul,.markdown-body ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
.markdown-body li { margin-top: .25em; }
.markdown-body li+li { margin-top: .25em; }
.markdown-body code { padding: .2em .4em; margin: 0; font-size: 85%; background-color: #afb8c133; border-radius: 6px; font-family: ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,monospace; }
.markdown-body pre { margin-top: 0; margin-bottom: 16px; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f6f8fa; border-radius: 6px; padding: 16px; }
.markdown-body pre code { padding: 0; margin: 0; font-size: 100%; background-color: transparent; border-radius: 0; }
.markdown-body blockquote { margin: 0 0 16px; padding: 0 1em; color: #57606a; border-left: .25em solid #d0d7de; }
.markdown-body table { border-spacing: 0; border-collapse: collapse; margin-top: 0; margin-bottom: 16px; }
.markdown-body table th,.markdown-body table td { padding: 6px 13px; border: 1px solid #d0d7de; }
.markdown-body table th { font-weight: 600; background-color: #f6f8fa; }
.markdown-body table tr:nth-child(2n) { background-color: #f6f8fa; }
.markdown-body a { color: #0969da; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body hr { height: .25em; padding: 0; margin: 24px 0; background-color: #d0d7de; border: 0; }
.markdown-body img { max-width: 100%; }
.markdown-body input[type=checkbox] { margin-right: 4px; }
`;

/** Resolve the root .md file to serve at `/`. Returns the repo-relative path or null. */
function resolveRootFile(root) {
  if (existsSync(join(root, 'README.md'))) return 'README.md';
  if (existsSync(join(root, '.spec-guard', 'README.md'))) return '.spec-guard/README.md';
  return null;
}

/**
 * Start the serve server.
 *
 * @param {object} options
 * @param {number}  [options.port=7777]   Port to listen on.
 * @param {string}  [options.root]        Repo root (default: cwd).
 * @param {boolean} [options.open=true]   Open browser on start.
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
export async function serve(options = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const root = resolve(options.root ?? process.cwd());
  const shouldOpen = options.open !== false;

  // Validate root file
  const rootFile = resolveRootFile(root);
  if (!rootFile) {
    const err = new Error(
      'Cannot start server: no README.md found at the repo root and no .spec-guard/README.md found. ' +
      'Create one of these files or run from the correct directory.'
    );
    err.code = 'SG_SERVE_NO_ROOT';
    throw err;
  }

  // Collect initial file list
  let allFiles = await collectMdFiles(root);

  // Create HTTP server
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`);
    const pathname = decodeURIComponent(url.pathname);

    // Serve built-in CSS
    if (pathname === '/__sg_assets__/github-markdown.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(GITHUB_MARKDOWN_CSS);
      return;
    }

    // HMR endpoint — handled by WebSocketServer upgrade; return 426 for plain HTTP
    if (pathname === '/__hmr') {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Upgrade Required');
      return;
    }

    // Resolve file path
    let filePath;
    if (pathname === '/') {
      filePath = rootFile;
    } else {
      // Strip leading slash, normalize separators
      filePath = pathname.replace(/^\//, '').replace(/\\/g, '/');
    }

    const absPath = join(root, filePath);

    // Only serve .md files (and pass-through for assets)
    if (!filePath.endsWith('.md')) {
      // Try to serve as a static asset
      try {
        const data = await readFile(absPath);
        const ext = extname(filePath);
        const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
        const ct = types[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>404 Not Found</h1><p><code>${filePath}</code> is not a markdown file and could not be found as a static asset.</p></body></html>`);
      }
      return;
    }

    // Serve .md file
    try {
      await stat(absPath); // throws if missing
      allFiles = await collectMdFiles(root); // refresh list
      const html = await renderPage(root, filePath, allFiles);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h1>404 Not Found</h1><p><code>${filePath}</code> was not found.</p></body></html>`);
    }
  });

  // Start listening first — fail fast if port is in use before setting up anything else
  await new Promise((resolveP, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolveP();
    });
  });

  // WebSocket server for HMR (attached after listen succeeds)
  const wss = new WebSocketServer({ server, path: '/__hmr' });

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === 1 /* OPEN */) client.send(data);
    }
  }

  // File watcher — watch the entire tree and filter to .md files in the handler.
  // Watching '.' (root) with usePolling ensures dot-directories (.spec-guard/) are
  // covered reliably on all platforms, including Windows where native fs events
  // can miss changes in subdirectories.
  const watcher = watch('.', {
    cwd: root,
    ignoreInitial: true,
    ignored: (p) => p.includes('node_modules'),
    usePolling: true,
    interval: 300,
  });

  watcher.on('all', async (_event, filePath) => {
    if (typeof filePath === 'string' && filePath.endsWith('.md')) {
      allFiles = await collectMdFiles(root);
      broadcast({ type: 'reload' });
    }
  });

  const url = `http://localhost:${port}`;
  process.stdout.write(`Serving on ${url} — press Ctrl+C to stop\n`);

  if (shouldOpen) {
    const { default: openBrowser } = await import('open');
    await openBrowser(url);
  }

  // Graceful shutdown helper
  async function close() {
    await watcher.close();
    await new Promise(r => wss.close(r));
    await new Promise(r => server.close(r));
    process.stdout.write('Server stopped.\n');
  }

  return { close, server, wss, watcher };
}
