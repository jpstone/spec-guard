/**
 * Tests for `spec-guard serve` — local markdown viewer.
 * Derived from acceptance criteria in .spec-guard/specs/serve.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const cli = join(root, 'bin', 'spec-guard.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reserve a free OS port, then release it for use by the server. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Spawn `spec-guard serve --no-open [--port n] [extraArgs]` in `cwd`.
 * Returns the child process.
 */
function spawnServe({ port, cwd, extraArgs = [] }) {
  return spawn(
    process.execPath,
    [cli, 'serve', '--no-open', '--port', String(port), ...extraArgs],
    { cwd, encoding: 'utf8' }
  );
}

/**
 * Wait until the child process emits "Serving on" on stdout (server ready),
 * or reject after `timeout` ms.
 */
function waitForReady(proc, timeout = 8000) {
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Server did not emit "Serving on" within ${timeout}ms.\nstdout: ${out}`));
    }, timeout);

    proc.stdout.on('data', chunk => {
      out += chunk;
      if (out.includes('Serving on')) {
        clearTimeout(timer);
        resolve(out);
      }
    });

    proc.on('exit', code => {
      clearTimeout(timer);
      if (!out.includes('Serving on')) {
        reject(new Error(`Server exited (code ${code}) before ready.\nstdout: ${out}`));
      }
    });
  });
}

/** HTTP GET helper — returns { status, body, headers }. */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

/** Build a minimal temp repo with the given files. */
function tempRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sg-serve-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

// ─── AC: server starts and stdout confirms the URL ────────────────────────────

test('serve: starts HTTP server and stdout confirms URL', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n\nHello.' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    const out = await waitForReady(proc);
    assert.match(out, /Serving on/i);
    assert.match(out, new RegExp(String(port)));
  } finally {
    proc.kill();
  }
});

// ─── AC: --port flag overrides default ────────────────────────────────────────

test('serve: --port flag starts server on specified port', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    const out = await waitForReady(proc);
    assert.match(out, new RegExp(String(port)));
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
  } finally {
    proc.kill();
  }
});

// ─── AC: root URL renders README.md ──────────────────────────────────────────

test('serve: root URL (/) renders README.md when it exists', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# My Project\n\nRoot readme content.' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.body, /My Project/);
    assert.match(res.body, /Root readme content/);
  } finally {
    proc.kill();
  }
});

// ─── AC: root URL falls back to .spec-guard/README.md ────────────────────────

test('serve: root URL (/) falls back to .spec-guard/README.md when no root README.md', async () => {
  const port = await getFreePort();
  const dir = tempRepo({
    '.spec-guard/README.md': '# Spec Guard Index\n\nArtifact index content.',
  });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.body, /Spec Guard Index/);
  } finally {
    proc.kill();
  }
});

// ─── AC: exits non-zero if neither root file exists ──────────────────────────

test('serve: exits non-zero with clear error if neither README.md nor .spec-guard/README.md exists', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'docs/notes.md': '# Notes\n' }); // no README at root
  const result = spawnSync(
    process.execPath,
    [cli, 'serve', '--no-open', '--port', String(port)],
    { cwd: dir, encoding: 'utf8', timeout: 5000 }
  );
  assert.notEqual(result.status, 0, 'Expected non-zero exit when no root file found');
  const combined = result.stdout + result.stderr;
  assert.match(combined, /readme/i, 'Error message should mention README');
});

// ─── AC: exits non-zero on port conflict ─────────────────────────────────────

test('serve: exits non-zero with human-readable error when port is already in use', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });

  // Occupy the port with a plain HTTP server
  const blocker = http.createServer((_, res) => res.end('busy'));
  await new Promise(r => blocker.listen(port, '127.0.0.1', r));

  try {
    const result = spawnSync(
      process.execPath,
      [cli, 'serve', '--no-open', '--port', String(port)],
      { cwd: dir, encoding: 'utf8', timeout: 5000 }
    );
    assert.notEqual(result.status, 0, 'Expected non-zero exit on port conflict');
    const combined = result.stdout + result.stderr;
    assert.match(combined, /port/i, 'Error message should mention "port"');
  } finally {
    await new Promise(r => blocker.close(r));
  }
});

// ─── AC: GET /<path/to/file.md> renders that file as styled HTML ─────────────

test('serve: GET /path/to/file.md renders file as styled HTML', async () => {
  const port = await getFreePort();
  const dir = tempRepo({
    'README.md': '# Root\n',
    'docs/guide.md': '# Guide\n\nGuide content here.',
  });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const res = await httpGet(`http://127.0.0.1:${port}/docs/guide.md`);
    assert.equal(res.status, 200);
    assert.match(res.body, /Guide/);
    assert.match(res.body, /Guide content here/);
    // Response should be HTML (not raw markdown)
    assert.match(res.headers['content-type'], /html/i);
  } finally {
    proc.kill();
  }
});

// ─── AC: unknown or non-.md path returns 404 ─────────────────────────────────

test('serve: unknown path returns 404', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const res = await httpGet(`http://127.0.0.1:${port}/no/such/file.md`);
    assert.equal(res.status, 404);
  } finally {
    proc.kill();
  }
});

test('serve: non-.md path returns 404', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const res = await httpGet(`http://127.0.0.1:${port}/some/script.js`);
    assert.equal(res.status, 404);
  } finally {
    proc.kill();
  }
});

// ─── AC: all .md files listed in navigation sidebar ──────────────────────────

test('serve: navigation sidebar lists all .md files in the repo', async () => {
  const port = await getFreePort();
  const dir = tempRepo({
    'README.md': '# Root\n',
    'docs/guide.md': '# Guide\n',
    '.spec-guard/README.md': '# Artifact Index\n',
    '.spec-guard/specs/my-spec.md': '# My Spec\n',
  });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    // Sidebar should reference each .md file
    assert.match(res.body, /guide\.md/i);
    assert.match(res.body, /my-spec\.md/i);
  } finally {
    proc.kill();
  }
});

// ─── AC: HMR WebSocket endpoint exists ───────────────────────────────────────

test('serve: WebSocket upgrade endpoint responds (HMR channel present)', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    // The HMR endpoint should respond to a WebSocket upgrade request.
    // A plain HTTP GET to the WS path should return 426 (Upgrade Required) or 101.
    const res = await httpGet(`http://127.0.0.1:${port}/__hmr`);
    assert.ok(
      res.status === 426 || res.status === 400 || res.status === 101 || res.status === 200,
      `Expected WS endpoint to respond, got ${res.status}`
    );
  } finally {
    proc.kill();
  }
});

// ─── AC: Ctrl+C stops server and prints shutdown confirmation ─────────────────

test('serve: SIGINT (Ctrl+C) stops server and prints shutdown confirmation', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  const proc = spawnServe({ port, cwd: dir });
  let stdout = '';
  proc.stdout.on('data', c => (stdout += c));

  try {
    await waitForReady(proc);
    proc.kill('SIGINT');
    await new Promise((resolve, reject) => {
      proc.on('exit', code => {
        // Some platforms exit non-zero on SIGINT; that's acceptable
        resolve();
      });
      setTimeout(() => reject(new Error('Process did not exit after SIGINT')), 4000);
    });
    assert.match(stdout, /stop|shut|exit|done/i, 'Expected shutdown confirmation in stdout');
  } finally {
    proc.kill();
  }
});

// ─── AC: HMR triggers on .md file changes inside dot-directories ─────────────

/** Connect a WebSocket to the HMR endpoint and wait for a reload message. */
function waitForHmrReload(port, timeout = 6000) {
  return new Promise((resolve, reject) => {
    // Use dynamic import so the module is available
    import('ws').then(({ default: WS }) => {
      const ws = new WS(`ws://127.0.0.1:${port}/__hmr`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`No HMR reload message received within ${timeout}ms`));
      }, timeout);
      ws.on('message', data => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'reload') {
            clearTimeout(timer);
            ws.close();
            resolve();
          }
        } catch { /* ignore non-JSON */ }
      });
      ws.on('error', err => { clearTimeout(timer); reject(err); });
    });
  });
}

// AC: new .md file created under .spec-guard/specs/ triggers browser reload
test('serve: creating a new .md file under .spec-guard/specs/ triggers HMR reload', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  mkdirSync(join(dir, '.spec-guard', 'specs'), { recursive: true });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const reloadPromise = waitForHmrReload(port);
    // Small delay to ensure WS is connected before triggering the change
    await new Promise(r => setTimeout(r, 300));
    writeFileSync(join(dir, '.spec-guard', 'specs', 'new-spec.md'), '# New Spec\n');
    await reloadPromise;
  } finally {
    proc.kill();
  }
});

// AC: modifying an existing .md file under .spec-guard/ triggers browser reload
test('serve: modifying a .md file under .spec-guard/ triggers HMR reload', async () => {
  const port = await getFreePort();
  const dir = tempRepo({
    'README.md': '# Root\n',
    '.spec-guard/README.md': '# Index\n',
  });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const reloadPromise = waitForHmrReload(port);
    await new Promise(r => setTimeout(r, 300));
    writeFileSync(join(dir, '.spec-guard', 'README.md'), '# Index Updated\n');
    await reloadPromise;
  } finally {
    proc.kill();
  }
});

// AC: modifying README.md at the repo root triggers browser reload
test('serve: modifying README.md at repo root triggers HMR reload', async () => {
  const port = await getFreePort();
  const dir = tempRepo({ 'README.md': '# Root\n' });
  const proc = spawnServe({ port, cwd: dir });
  try {
    await waitForReady(proc);
    const reloadPromise = waitForHmrReload(port);
    await new Promise(r => setTimeout(r, 300));
    writeFileSync(join(dir, 'README.md'), '# Root Updated\n');
    await reloadPromise;
  } finally {
    proc.kill();
  }
});

// ─── AC: AGENTS.md documents spec-guard serve ────────────────────────────────

test('AGENTS.md documents spec-guard serve for natural-language recognition', () => {
  const agentsPath = join(root, 'AGENTS.md');
  const content = readFileSync(agentsPath, 'utf8');
  assert.match(content, /spec-guard serve/, 'AGENTS.md should mention spec-guard serve');
  // Should mention natural-language triggers
  assert.match(content, /docs|viewer|web app/i, 'AGENTS.md should describe when to invoke the command');
});
