'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const PORT = 3001;
const HOST = '0.0.0.0';

const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const MAIN_STORAGE_DIR = '/outer/CraftOffice';
const STORAGE_DIR = path.join(BASE_DIR, 'storage', 'libraries');
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const STATE_PATH = path.join(BASE_DIR, 'sync_state.json');
const BRIDGE_PATH = path.join(BASE_DIR, 'device_bridge.py');

function runBridge(args, stdinObj = null, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [BRIDGE_PATH, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Device bridge timed out'));
    }, timeoutMs);

    proc.stdout.on('data', d => out.push(d));
    proc.stderr.on('data', d => err.push(d));
    proc.on('close', (code) => {
      clearTimeout(timer);
      const stdoutStr = Buffer.concat(out).toString('utf8').trim();
      const stderrStr = Buffer.concat(err).toString('utf8').trim();
      try {
        const parsed = JSON.parse(stdoutStr);
        if (code !== 0 && parsed.error) return reject(new Error(parsed.error));
        resolve(parsed);
      } catch {
        reject(new Error(stderrStr || stdoutStr || `Bridge exited with code ${code}`));
      }
    });
    if (stdinObj !== null) {
      proc.stdin.write(JSON.stringify(stdinObj));
    }
    proc.stdin.end();
  });
}

function getDeviceIp() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return cfg.deviceIp || '192.168.1.149';
  } catch {
    return '192.168.1.149';
  }
}

function saveDeviceIp(ip) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  cfg.deviceIp = ip;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o777 });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function readBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        return reject(new Error('Payload too large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
}

function resolveLibrary(libName) {
  const clean = safeName(libName);
  if (!clean || clean === '.' || clean === '..') return null;
  if (clean === 'CraftOffice') return MAIN_STORAGE_DIR;
  const libRoot = path.resolve(STORAGE_DIR, clean);
  if (!libRoot.startsWith(STORAGE_DIR + path.sep)) return null;
  return libRoot;
}

function resolveInLibrary(libRoot, relPath = '') {
  const normalized = String(relPath || '').replace(/^\/+/, '');
  const target = path.resolve(libRoot, normalized);
  if (target !== libRoot && !target.startsWith(libRoot + path.sep)) return null;
  // Prevent direct access to .history via normal file routes
  const rel = path.relative(libRoot, target);
  if (rel === '.history' || rel.startsWith('.history' + path.sep)) return null;
  return { target, rel };
}

function ensureHistorySnapshot(libRoot, relPath, targetFile) {
  if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) return null;
  const histRoot = path.join(libRoot, '.history');
  if (!fs.existsSync(histRoot)) fs.mkdirSync(histRoot, { recursive: true, mode: 0o777 });
  const safeRel = relPath.replace(/[\\/]/g, '__');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapName = `${safeRel}.${stamp}.bak`;
  const snapPath = path.join(histRoot, snapName);
  fs.copyFileSync(targetFile, snapPath);
  try { fs.chmodSync(snapPath, 0o666); } catch {}
  return snapName;
}

function getLibraryStats(libPath) {
  let files = 0;
  let bytes = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.history' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files++;
        bytes += fs.statSync(full).size;
      }
    }
  }
  if (fs.existsSync(libPath)) walk(libPath);
  return { files, bytes };
}

function defaultTemplate(ext, title) {
  if (ext === '.wcraft') {
    return JSON.stringify({
      type: 'wordcraft',
      title,
      blocks: [
        { id: 'b1', type: 'h1', text: title },
        { id: 'b2', type: 'p', text: 'Start writing your document...' }
      ]
    }, null, 2);
  }
  if (ext === '.gcraft') {
    return JSON.stringify({
      type: 'gridcraft',
      title,
      columns: ['Column A', 'Column B', 'Column C', 'Notes'],
      rows: [
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', '']
      ]
    }, null, 2);
  }
  if (ext === '.bcraft') {
    return JSON.stringify({
      type: 'boardcraft',
      title,
      columns: [
        { id: 'c1', title: 'To Do', cards: [] },
        { id: 'c2', title: 'In Progress', cards: [] },
        { id: 'c3', title: 'Done', cards: [] }
      ]
    }, null, 2);
  }
  if (ext === '.md') {
    return `# ${title}\n\n`;
  }
  return '';
}

async function handleApi(req, res, urlObj) {
  const pathname = urlObj.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      uptime: process.uptime(),
      nodeVersion: process.version,
      storageDir: STORAGE_DIR
    });
  }

  // Libraries
  if (pathname === '/api/libraries' && req.method === 'GET') {
    const libraries = [];
    if (fs.existsSync(MAIN_STORAGE_DIR)) {
      libraries.push({ name: 'CraftOffice', ...getLibraryStats(MAIN_STORAGE_DIR), primary: true });
    }
    const entries = fs.readdirSync(STORAGE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'CraftOffice')
      .map(d => {
        const libPath = path.join(STORAGE_DIR, d.name);
        const stats = getLibraryStats(libPath);
        return { name: d.name, ...stats };
      });
    return sendJson(res, 200, { libraries: [...libraries, ...entries] });
  }

  if (pathname === '/api/libraries' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const name = safeName(body.name);
    if (!name) return sendJson(res, 400, { error: 'Invalid library name' });
    const libPath = resolveLibrary(name);
    if (!libPath) return sendJson(res, 400, { error: 'Invalid library path' });
    if (fs.existsSync(libPath)) return sendJson(res, 409, { error: 'Library already exists' });
    fs.mkdirSync(path.join(libPath, '.history'), { recursive: true, mode: 0o777 });
    try { fs.chmodSync(libPath, 0o777); } catch {}
    return sendJson(res, 201, { name, files: 0, bytes: 0 });
  }

  // List directory in library
  if (pathname === '/api/files' && req.method === 'GET') {
    const libRoot = resolveLibrary(urlObj.searchParams.get('lib'));
    if (!libRoot || !fs.existsSync(libRoot)) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, urlObj.searchParams.get('dir') || '');
    if (!resolved || !fs.existsSync(resolved.target)) return sendJson(res, 404, { error: 'Directory not found' });

    const items = fs.readdirSync(resolved.target, { withFileTypes: true })
      .filter(d => d.name !== '.history' && !d.name.startsWith('.'))
      .map(d => {
        const full = path.join(resolved.target, d.name);
        const stat = fs.statSync(full);
        const relPath = path.relative(libRoot, full).replace(/\\/g, '/');
        return {
          name: d.name,
          path: relPath,
          isDir: d.isDirectory(),
          ext: d.isDirectory() ? '' : path.extname(d.name).toLowerCase(),
          size: stat.size,
          mtime: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1)));

    return sendJson(res, 200, { dir: resolved.rel.replace(/\\/g, '/'), items });
  }

  // Create file or folder
  if (pathname === '/api/files' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const libRoot = resolveLibrary(body.lib);
    if (!libRoot || !fs.existsSync(libRoot)) return sendJson(res, 404, { error: 'Library not found' });

    const dir = body.dir || '';
    const rawName = safeName(body.name);
    if (!rawName) return sendJson(res, 400, { error: 'Invalid name' });

    const parentResolved = resolveInLibrary(libRoot, dir);
    if (!parentResolved || !fs.existsSync(parentResolved.target)) {
      return sendJson(res, 404, { error: 'Parent folder not found' });
    }

    const relTarget = path.join(parentResolved.rel, rawName);
    const targetResolved = resolveInLibrary(libRoot, relTarget);
    if (!targetResolved) return sendJson(res, 400, { error: 'Invalid path' });
    if (fs.existsSync(targetResolved.target)) return sendJson(res, 409, { error: 'Item already exists' });

    if (body.isDir) {
      fs.mkdirSync(targetResolved.target, { recursive: true, mode: 0o777 });
      try { fs.chmodSync(targetResolved.target, 0o777); } catch {}
      return sendJson(res, 201, { path: targetResolved.rel.replace(/\\/g, '/'), isDir: true });
    }

    const ext = path.extname(rawName).toLowerCase();
    const title = path.basename(rawName, ext);
    let content;
    if (typeof body.contentBase64 === 'string') {
      content = Buffer.from(body.contentBase64, 'base64');
    } else if (typeof body.content === 'string') {
      content = body.content;
    } else {
      content = defaultTemplate(ext, title);
    }

    fs.writeFileSync(targetResolved.target, content);
    try { fs.chmodSync(targetResolved.target, 0o666); } catch {}
    return sendJson(res, 201, { path: targetResolved.rel.replace(/\\/g, '/'), isDir: false });
  }

  // Read single file
  if (pathname === '/api/file' && req.method === 'GET') {
    const libRoot = resolveLibrary(urlObj.searchParams.get('lib'));
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, urlObj.searchParams.get('path') || '');
    if (!resolved || !fs.existsSync(resolved.target) || fs.statSync(resolved.target).isDirectory()) {
      return sendJson(res, 404, { error: 'File not found' });
    }
    const stat = fs.statSync(resolved.target);
    const content = fs.readFileSync(resolved.target, 'utf8');
    return sendJson(res, 200, {
      lib: path.basename(libRoot),
      path: resolved.rel.replace(/\\/g, '/'),
      name: path.basename(resolved.target),
      ext: path.extname(resolved.target).toLowerCase(),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      content
    });
  }

  // Save single file (with .history snapshot)
  if (pathname === '/api/file' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const libRoot = resolveLibrary(body.lib);
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, body.path || '');
    if (!resolved) return sendJson(res, 400, { error: 'Invalid file path' });

    const snap = ensureHistorySnapshot(libRoot, resolved.rel, resolved.target);
    fs.writeFileSync(resolved.target, String(body.content ?? ''), 'utf8');
    try { fs.chmodSync(resolved.target, 0o666); } catch {}
    const stat = fs.statSync(resolved.target);
    return sendJson(res, 200, {
      ok: true,
      snapshot: snap,
      size: stat.size,
      mtime: stat.mtime.toISOString()
    });
  }

  // Delete file or empty/recursive folder (with snapshot if file)
  if (pathname === '/api/file' && req.method === 'DELETE') {
    const libRoot = resolveLibrary(urlObj.searchParams.get('lib'));
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, urlObj.searchParams.get('path') || '');
    if (!resolved || !resolved.rel || !fs.existsSync(resolved.target)) {
      return sendJson(res, 404, { error: 'Item not found' });
    }
    if (fs.statSync(resolved.target).isDirectory()) {
      fs.rmSync(resolved.target, { recursive: true, force: true });
    } else {
      ensureHistorySnapshot(libRoot, resolved.rel, resolved.target);
      fs.unlinkSync(resolved.target);
    }
    return sendJson(res, 200, { ok: true });
  }

  // Rename file
  if (pathname === '/api/file/rename' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const libRoot = resolveLibrary(body.lib);
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const src = resolveInLibrary(libRoot, body.path || '');
    const newName = safeName(body.newName);
    if (!src || !newName || !fs.existsSync(src.target)) {
      return sendJson(res, 400, { error: 'Invalid source or new name' });
    }
    const dstRel = path.join(path.dirname(src.rel), newName);
    const dst = resolveInLibrary(libRoot, dstRel);
    if (!dst || fs.existsSync(dst.target)) return sendJson(res, 409, { error: 'Destination exists' });
    fs.renameSync(src.target, dst.target);
    return sendJson(res, 200, { ok: true, path: dst.rel.replace(/\\/g, '/') });
  }

  // Download raw file
  if (pathname === '/api/file/download' && req.method === 'GET') {
    const libRoot = resolveLibrary(urlObj.searchParams.get('lib'));
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, urlObj.searchParams.get('path') || '');
    if (!resolved || !fs.existsSync(resolved.target) || fs.statSync(resolved.target).isDirectory()) {
      return sendJson(res, 404, { error: 'File not found' });
    }
    const filename = path.basename(resolved.target);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
    });
    return fs.createReadStream(resolved.target).pipe(res);
  }

  // Version History list
  if (pathname === '/api/history' && req.method === 'GET') {
    const libRoot = resolveLibrary(urlObj.searchParams.get('lib'));
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, urlObj.searchParams.get('path') || '');
    if (!resolved) return sendJson(res, 400, { error: 'Invalid path' });
    const histRoot = path.join(libRoot, '.history');
    if (!fs.existsSync(histRoot)) return sendJson(res, 200, { versions: [] });

    const prefix = resolved.rel.replace(/[\\/]/g, '__') + '.';
    const versions = fs.readdirSync(histRoot)
      .filter(f => f.startsWith(prefix) && f.endsWith('.bak'))
      .map(f => {
        const stat = fs.statSync(path.join(histRoot, f));
        return { id: f, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));

    return sendJson(res, 200, { versions });
  }

  // Restore snapshot
  if (pathname === '/api/history/restore' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const libRoot = resolveLibrary(body.lib);
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, body.path || '');
    const snapId = safeName(body.versionId);
    if (!resolved || !snapId) return sendJson(res, 400, { error: 'Invalid parameters' });
    const snapPath = path.resolve(libRoot, '.history', snapId);
    if (!snapPath.startsWith(path.join(libRoot, '.history') + path.sep) || !fs.existsSync(snapPath)) {
      return sendJson(res, 404, { error: 'Snapshot not found' });
    }
    ensureHistorySnapshot(libRoot, resolved.rel, resolved.target);
    fs.copyFileSync(snapPath, resolved.target);
    return sendJson(res, 200, { ok: true, content: fs.readFileSync(resolved.target, 'utf8') });
  }

  // Search across libraries
  if (pathname === '/api/search' && req.method === 'GET') {
    const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
    if (!q) return sendJson(res, 200, { results: [] });
    const results = [];
    const targets = [];
    if (fs.existsSync(MAIN_STORAGE_DIR)) targets.push({ name: 'CraftOffice', root: MAIN_STORAGE_DIR });
    for (const lib of fs.readdirSync(STORAGE_DIR, { withFileTypes: true })) {
      if (lib.isDirectory() && !lib.name.startsWith('.') && lib.name !== 'CraftOffice') {
        targets.push({ name: lib.name, root: path.join(STORAGE_DIR, lib.name) });
      }
    }
    for (const t of targets) {
      const libRoot = t.root;
      function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === '.history' || entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else {
            const rel = path.relative(libRoot, full).replace(/\\/g, '/');
            let matched = entry.name.toLowerCase().includes(q);
            if (!matched && fs.statSync(full).size < 512 * 1024) {
              try {
                const txt = fs.readFileSync(full, 'utf8').toLowerCase();
                if (txt.includes(q)) matched = true;
              } catch {}
            }
            if (matched) results.push({ lib: t.name, path: rel, name: entry.name });
          }
        }
      }
      walk(libRoot);
    }
    return sendJson(res, 200, { results: results.slice(0, 50) });
  }

  // Sync status & config
  if (pathname === '/api/sync/status' && req.method === 'GET') {
    let state = { mode: 'local', status: 'starting', logs: [] };
    let config = {};
    try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch {}
    try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
    return sendJson(res, 200, {
      state,
      config: {
        seafileServer: config.seafileServer || '',
        repoId: config.repoId || '',
        hasToken: Boolean(config.seafileToken),
        syncIntervalMs: config.syncIntervalMs || 30000
      }
    });
  }

  if (pathname === '/api/sync/config' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
    const updated = {
      seafileServer: typeof body.seafileServer === 'string' ? body.seafileServer.trim() : (current.seafileServer || ''),
      seafileToken: (typeof body.seafileToken === 'string' && body.seafileToken.trim()) ? body.seafileToken.trim() : (current.seafileToken || ''),
      repoId: typeof body.repoId === 'string' ? body.repoId.trim() : (current.repoId || ''),
      syncIntervalMs: Number(body.syncIntervalMs) >= 5000 ? Number(body.syncIntervalMs) : (current.syncIntervalMs || 30000),
      localLibrary: current.localLibrary || 'My Workspace'
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
    execFile('systemctl', ['restart', 'seacraft-sync'], () => {});
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/sync/trigger' && req.method === 'POST') {
    execFile('systemctl', ['restart', 'seacraft-sync'], () => {});
    return sendJson(res, 200, { ok: true });
  }

  // Scanner & Printer (from Craft-Office engine + IPP)
  if (pathname === '/api/scanner/status' && req.method === 'GET') {
    const ip = (urlObj.searchParams.get('ip') || getDeviceIp()).trim();
    const st = await runBridge(['scanner-status', ip], null, 10000);
    return sendJson(res, 200, { ok: true, scanner: st });
  }

  if (pathname === '/api/scanner/discover' && req.method === 'POST') {
    const resObj = await runBridge(['scanner-discover'], null, 12000);
    if (resObj.scanners && resObj.scanners.length > 0) {
      saveDeviceIp(resObj.scanners[0].ip);
    }
    return sendJson(res, 200, resObj);
  }

  if (pathname === '/api/scanner/scan' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 30 * 1024 * 1024)).toString('utf8') || '{}');
    const libRoot = resolveLibrary(body.lib || 'CraftOffice');
    if (!libRoot || !fs.existsSync(libRoot)) return sendJson(res, 404, { error: 'Library not found' });

    const ip = (body.ip || getDeviceIp()).trim();
    saveDeviceIp(ip);

    const fmt = (body.format || 'docx').toLowerCase();
    const extMap = { docx: '.docx', xlsx: '.xlsx', pdf: '.pdf', jpg: '.jpg', jpeg: '.jpg', png: '.png' };
    const ext = extMap[fmt] || '.docx';

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let fname = safeName(body.filename || `Scan_${stamp}`);
    if (!fname.toLowerCase().endsWith(ext)) fname += ext;

    const parentResolved = resolveInLibrary(libRoot, body.dir || '');
    if (!parentResolved) return sendJson(res, 400, { error: 'Invalid target folder' });
    const relTarget = path.join(parentResolved.rel, fname);
    const targetResolved = resolveInLibrary(libRoot, relTarget);
    if (!targetResolved) return sendJson(res, 400, { error: 'Invalid destination path' });

    if (fs.existsSync(targetResolved.target)) {
      ensureHistorySnapshot(libRoot, targetResolved.rel, targetResolved.target);
    }

    const bridgeRes = await runBridge(['scan'], {
      source: body.source || 'hardware',
      ip,
      dpi: Number(body.dpi || 300),
      color: body.color || 'RGB24',
      format: fmt,
      ocrLang: body.ocrLang || 'ell+eng',
      docxMode: body.docxMode || 'both',
      destPath: targetResolved.target,
      imageBase64: body.imageBase64 || '',
      inputFilename: body.inputFilename || 'scan.png'
    }, 90000);

    return sendJson(res, 200, {
      ok: true,
      lib: path.basename(libRoot),
      path: targetResolved.rel.replace(/\\/g, '/'),
      filename: fname,
      ...bridgeRes
    });
  }

  if (pathname === '/api/printer/status' && req.method === 'GET') {
    const ip = (urlObj.searchParams.get('ip') || getDeviceIp()).trim();
    const st = await runBridge(['printer-status', ip], null, 10000);
    return sendJson(res, 200, { ok: true, printer: st });
  }

  if (pathname === '/api/printer/print' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const libRoot = resolveLibrary(body.lib);
    if (!libRoot) return sendJson(res, 404, { error: 'Library not found' });
    const resolved = resolveInLibrary(libRoot, body.path || '');
    if (!resolved || !fs.existsSync(resolved.target) || fs.statSync(resolved.target).isDirectory()) {
      return sendJson(res, 404, { error: 'File not found' });
    }
    const ip = (body.ip || getDeviceIp()).trim();
    saveDeviceIp(ip);
    const result = await runBridge(['print-file', ip, resolved.target, path.basename(resolved.target)], null, 20000);
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  return sendJson(res, 404, { error: 'API endpoint not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (urlObj.pathname.startsWith('/api/')) {
      return await handleApi(req, res, urlObj);
    }

    // Serve static files from public/
    let reqPath = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
    let safePath = path.resolve(PUBLIC_DIR, reqPath.replace(/^\/+/, ''));
    if (!safePath.startsWith(PUBLIC_DIR + path.sep) && safePath !== path.join(PUBLIC_DIR, 'index.html')) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
      safePath = path.join(safePath, 'index.html');
    }
    if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': (ext === '.wasm' || ext === '.js') ? 'public, max-age=86400' : 'no-cache'
    });
    fs.createReadStream(safePath).pipe(res);
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SeaCraft Web Portal running at http://${HOST}:${PORT}/`);
});
