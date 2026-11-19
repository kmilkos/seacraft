'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const BASE_DIR = __dirname;
const MAIN_STORAGE_DIR = '/outer/CraftOffice';
const STORAGE_DIR = path.join(BASE_DIR, 'storage', 'libraries');
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const STATE_PATH = path.join(BASE_DIR, 'sync_state.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      seafileServer: process.env.SEAFILE_SERVER || '',
      seafileToken: process.env.SEAFILE_TOKEN || '',
      repoId: process.env.SEAFILE_REPO_ID || '',
      syncIntervalMs: 30000,
      localLibrary: 'My Workspace'
    };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to write sync_state.json:', err.message);
  }
}

function walkLibrary(dirPath, rootDir, list = []) {
  if (!fs.existsSync(dirPath)) return list;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.history' || entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    const rel = path.relative(rootDir, full);
    if (entry.isDirectory()) {
      walkLibrary(full, rootDir, list);
    } else {
      const stat = fs.statSync(full);
      list.push({
        path: rel,
        size: stat.size,
        mtime: stat.mtimeMs
      });
    }
  }
  return list;
}

function scanAllLibraries() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o777 });
  }
  let totalFiles = 0;
  let totalBytes = 0;
  const libraries = {};

  if (fs.existsSync(MAIN_STORAGE_DIR)) {
    const mainFiles = walkLibrary(MAIN_STORAGE_DIR, MAIN_STORAGE_DIR);
    libraries['CraftOffice'] = mainFiles.length;
    totalFiles += mainFiles.length;
    for (const f of mainFiles) totalBytes += f.size;
  }

  const libs = fs.readdirSync(STORAGE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));
  for (const lib of libs) {
    const libPath = path.join(STORAGE_DIR, lib.name);
    const files = walkLibrary(libPath, libPath);
    libraries[lib.name] = files.length;
    totalFiles += files.length;
    for (const f of files) totalBytes += f.size;
  }
  return { totalFiles, totalBytes, libraries };
}

/**
 * Node 24+ safe HTTP/HTTPS request helper (avoids undici fetch assertion issues).
 */
function seafileRequest(serverUrl, apiPath, token) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(apiPath, serverUrl);
    } catch (err) {
      return reject(err);
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 8000,
      headers: {
        'Authorization': `Token ${token}`,
        'Accept': 'application/json'
      }
    };

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 120)}`));
        }
      });
      res.on('error', (err) => {
        res.resume();
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', (err) => {
      req.destroy();
      reject(err);
    });
    req.end();
  });
}

let logs = [];
function addLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logs.unshift(line);
  if (logs.length > 30) logs = logs.slice(0, 30);
}

let isSyncing = false;

async function runSyncCycle() {
  if (isSyncing) return;
  isSyncing = true;
  const config = loadConfig();
  const scan = scanAllLibraries();

  const state = {
    mode: (config.seafileServer && config.seafileToken && config.repoId) ? 'seafile' : 'local',
    status: 'syncing',
    lastSyncAt: new Date().toISOString(),
    totalFiles: scan.totalFiles,
    totalBytes: scan.totalBytes,
    libraries: scan.libraries,
    remoteFilesCount: null,
    error: null,
    logs
  };

  try {
    if (state.mode === 'seafile') {
      addLog(`Polling Seafile server ${config.seafileServer} (repo ${config.repoId})...`);
      const res = await seafileRequest(
        config.seafileServer,
        `/api2/repos/${encodeURIComponent(config.repoId)}/dir/?p=/`,
        config.seafileToken
      );
      const remoteEntries = JSON.parse(res.body);
      state.remoteFilesCount = Array.isArray(remoteEntries) ? remoteEntries.length : 0;
      state.status = 'connected';
      addLog(`Seafile sync OK: ${state.remoteFilesCount} root entries on remote, ${scan.totalFiles} local files.`);
    } else {
      state.status = 'local_active';
      addLog(`Local sync check OK: ${scan.totalFiles} files across ${Object.keys(scan.libraries).length} libraries.`);
    }
  } catch (err) {
    state.status = 'error';
    state.error = err.message;
    addLog(`Sync error: ${err.message}`);
  } finally {
    state.logs = logs;
    saveState(state);
    isSyncing = false;
  }
}

// Watch local storage for instant re-index
let watchTimer = null;
for (const watchRoot of [MAIN_STORAGE_DIR, STORAGE_DIR]) {
  try {
    if (fs.existsSync(watchRoot)) {
      fs.watch(watchRoot, { recursive: true }, (eventType, filename) => {
        if (!filename || filename.includes('.history') || filename.includes('.backups') || filename.includes('.state')) return;
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          addLog(`Detected local change (${eventType}): ${filename}`);
          runSyncCycle();
        }, 1000);
      });
    }
  } catch (err) {
    addLog(`File watcher notice (${watchRoot}): ${err.message}`);
  }
}

addLog('SeaCraft Sync Daemon started.');
runSyncCycle();

const intervalMs = Math.max(5000, loadConfig().syncIntervalMs || 30000);
setInterval(runSyncCycle, intervalMs);
