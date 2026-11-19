(function () {
  const state = {
    libraries: [],
    currentLib: null,
    currentDir: '',
    items: [],
    openFile: null, // { lib, path, name, ext, content }
    dirty: false
  };

  const els = {
    sidebar: document.getElementById('sidebar'),
    menuToggle: document.getElementById('menuToggle'),
    homeBtn: document.getElementById('homeBtn'),
    printDocBtn: document.getElementById('printDocBtn'),
    themeToggle: document.getElementById('themeToggle'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    libList: document.getElementById('libList'),
    newLibBtn: document.getElementById('newLibBtn'),
    currentLibLabel: document.getElementById('currentLibLabel'),
    newFolderBtn: document.getElementById('newFolderBtn'),
    uploadBtn: document.getElementById('uploadBtn'),
    uploadInput: document.getElementById('uploadInput'),
    dirCrumb: document.getElementById('dirCrumb'),
    fileList: document.getElementById('fileList'),
    docBreadcrumb: document.getElementById('docBreadcrumb'),
    saveBadge: document.getElementById('saveBadge'),
    historyBtn: document.getElementById('historyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    saveBtn: document.getElementById('saveBtn'),
    editorStage: document.getElementById('editorStage'),
    syncStatusBtn: document.getElementById('syncStatusBtn'),
    syncDot: document.getElementById('syncDot'),
    syncLabel: document.getElementById('syncLabel'),
    syncSub: document.getElementById('syncSub'),
    createDialog: document.getElementById('createDialog'),
    createDialogTitle: document.getElementById('createDialogTitle'),
    createForm: document.getElementById('createForm'),
    createKind: document.getElementById('createKind'),
    createNameInput: document.getElementById('createNameInput'),
    createCancelBtn: document.getElementById('createCancelBtn'),
    historyDialog: document.getElementById('historyDialog'),
    historyCloseBtn: document.getElementById('historyCloseBtn'),
    historyList: document.getElementById('historyList'),
    syncDialog: document.getElementById('syncDialog'),
    syncCloseBtn: document.getElementById('syncCloseBtn'),
    syncForm: document.getElementById('syncForm'),
    syncStatsBox: document.getElementById('syncStatsBox'),
    seafileServerInput: document.getElementById('seafileServerInput'),
    seafileRepoInput: document.getElementById('seafileRepoInput'),
    seafileIntervalInput: document.getElementById('seafileIntervalInput'),
    seafileTokenInput: document.getElementById('seafileTokenInput'),
    syncLogsPre: document.getElementById('syncLogsPre'),
    syncNowBtn: document.getElementById('syncNowBtn'),
    scannerDialog: document.getElementById('scannerDialog'),
    scannerCloseBtn: document.getElementById('scannerCloseBtn'),
    scannerCancelBtn: document.getElementById('scannerCancelBtn'),
    scannerForm: document.getElementById('scannerForm'),
    scannerStatusBox: document.getElementById('scannerStatusBox'),
    scannerIpInput: document.getElementById('scannerIpInput'),
    scannerProbeBtn: document.getElementById('scannerProbeBtn'),
    scannerDiscoverBtn: document.getElementById('scannerDiscoverBtn'),
    scannerSourceSelect: document.getElementById('scannerSourceSelect'),
    scannerFormatSelect: document.getElementById('scannerFormatSelect'),
    scannerUploadField: document.getElementById('scannerUploadField'),
    scannerFileInput: document.getElementById('scannerFileInput'),
    scannerDpiSelect: document.getElementById('scannerDpiSelect'),
    scannerLangSelect: document.getElementById('scannerLangSelect'),
    scannerFilenameInput: document.getElementById('scannerFilenameInput'),
    scannerResultPre: document.getElementById('scannerResultPre'),
    scannerRunBtn: document.getElementById('scannerRunBtn'),
    printerDialog: document.getElementById('printerDialog'),
    printerCloseBtn: document.getElementById('printerCloseBtn'),
    printerForm: document.getElementById('printerForm'),
    printerStatusBox: document.getElementById('printerStatusBox'),
    printerIpInput: document.getElementById('printerIpInput'),
    printerProbeBtn: document.getElementById('printerProbeBtn'),
    printerFilePathInput: document.getElementById('printerFilePathInput'),
    browserPrintBtn: document.getElementById('browserPrintBtn'),
    ippPrintBtn: document.getElementById('ippPrintBtn'),
    appsDialog: document.getElementById('appsDialog'),
    appsCloseBtn: document.getElementById('appsCloseBtn'),
    appsFilterInput: document.getElementById('appsFilterInput'),
    appsModalBody: document.getElementById('appsModalBody')
  };

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function fileIcon(item) {
    if (item.isDir) return '📁';
    if (item.ext === '.wcraft') return '📝';
    if (item.ext === '.gcraft') return '📊';
    if (item.ext === '.bcraft') return '📋';
    if (item.ext === '.md') return '📘';
    return '📄';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function setDirty(isDirty, label) {
    state.dirty = isDirty;
    els.saveBadge.classList.toggle('dirty', isDirty);
    els.saveBadge.textContent = label || (isDirty ? 'Unsaved changes' : 'Saved');
  }

  // Theme
  const savedTheme = localStorage.getItem('seacraft_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  els.themeToggle.onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('seacraft_theme', next);
  };

  els.menuToggle.onclick = () => els.sidebar.classList.toggle('open');

  // Libraries & Files
  async function loadLibraries() {
    const data = await api('/api/libraries');
    state.libraries = data.libraries || [];
    if (!state.currentLib && state.libraries.length > 0) {
      state.currentLib = state.libraries[0].name;
    }
    renderLibraries();
    if (state.currentLib) await loadFiles(state.currentDir);
  }

  function renderLibraries() {
    els.libList.innerHTML = '';
    state.libraries.forEach(lib => {
      const li = document.createElement('li');
      li.className = 'nav-item' + (lib.name === state.currentLib ? ' active' : '');
      li.innerHTML = `
        <div class="nav-item-main">
          <span>📚</span>
          <span class="nav-item-name"></span>
        </div>
        <span class="nav-item-badge">${lib.files}</span>
      `;
      li.querySelector('.nav-item-name').textContent = lib.name;
      li.onclick = async () => {
        state.currentLib = lib.name;
        state.currentDir = '';
        state.openFile = null;
        renderLibraries();
        await loadFiles('');
        renderHome();
      };
      els.libList.appendChild(li);
    });
    els.currentLibLabel.textContent = state.currentLib || 'Files';
  }

  async function loadFiles(dir = '') {
    if (!state.currentLib) return;
    state.currentDir = dir;
    const data = await api(`/api/files?lib=${encodeURIComponent(state.currentLib)}&dir=${encodeURIComponent(dir)}`);
    state.items = data.items || [];
    renderDirCrumb();
    renderFileList();
    if (!state.openFile) renderHome();
  }

  function renderDirCrumb() {
    els.dirCrumb.innerHTML = '';
    const rootBtn = document.createElement('button');
    rootBtn.type = 'button';
    rootBtn.textContent = '/';
    rootBtn.onclick = () => loadFiles('');
    els.dirCrumb.appendChild(rootBtn);

    if (!state.currentDir) return;
    const parts = state.currentDir.split('/').filter(Boolean);
    let acc = '';
    parts.forEach((p, idx) => {
      acc += (idx ? '/' : '') + p;
      const target = acc;
      const sep = document.createElement('span');
      sep.textContent = '›';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p;
      btn.onclick = () => loadFiles(target);
      els.dirCrumb.append(sep, btn);
    });
  }

  function renderFileList() {
    els.fileList.innerHTML = '';
    if (state.items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'muted';
      empty.style.padding = '8px 10px';
      empty.textContent = 'Empty folder';
      els.fileList.appendChild(empty);
      return;
    }

    state.items.forEach(item => {
      const li = document.createElement('li');
      const isActive = state.openFile && state.openFile.path === item.path && state.openFile.lib === state.currentLib;
      li.className = 'nav-item' + (isActive ? ' active' : '');

      const main = document.createElement('div');
      main.className = 'nav-item-main';
      main.innerHTML = `<span>${fileIcon(item)}</span>`;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'nav-item-name';
      nameSpan.textContent = item.name;
      main.appendChild(nameSpan);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'item-del-btn';
      delBtn.title = 'Delete';
      delBtn.textContent = '🗑';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${item.name}"?`)) return;
        await api(`/api/file?lib=${encodeURIComponent(state.currentLib)}&path=${encodeURIComponent(item.path)}`, { method: 'DELETE' });
        if (state.openFile && state.openFile.path === item.path) {
          state.openFile = null;
          renderHome();
        }
        await loadLibraries();
      };

      li.append(main, delBtn);
      li.onclick = () => {
        els.sidebar.classList.remove('open');
        if (item.isDir) {
          loadFiles(item.path);
        } else {
          openDocument(state.currentLib, item.path);
        }
      };
      els.fileList.appendChild(li);
    });
  }

  function updateTopbar() {
    if (!state.openFile) {
      els.docBreadcrumb.textContent = `${state.currentLib || 'SeaCraft'}${state.currentDir ? ' / ' + state.currentDir : ''}`;
      els.historyBtn.classList.add('hidden');
      els.printDocBtn.classList.add('hidden');
      els.downloadBtn.classList.add('hidden');
      els.saveBtn.classList.add('hidden');
      setDirty(false, 'Ready');
    } else {
      els.docBreadcrumb.textContent = `${state.openFile.lib} / ${state.openFile.path}`;
      els.historyBtn.classList.remove('hidden');
      els.printDocBtn.classList.remove('hidden');
      els.downloadBtn.classList.remove('hidden');
      els.saveBtn.classList.remove('hidden');
    }
  }

  const CRAFT_APPS = {
    // Office
    wordcraft:   { name: 'WordCraft',   icon: '📝', category: 'Office', desc: 'Word processor (.docx, .rtf)', exts: ['.wcraft', '.docx', '.rtf'] },
    gridcraft:   { name: 'GridCraft',   icon: '📊', category: 'Office', desc: 'Spreadsheets (.xlsx, .ods)', exts: ['.gcraft', '.xlsx', '.ods'] },
    deckcraft:   { name: 'DeckCraft',   icon: '📽️', category: 'Office', desc: 'Presentations (.pptx, .odp)', exts: ['.pptx', '.odp', '.deck'] },
    pdfcraft:    { name: 'PdfCraft',    icon: '📕', category: 'Office', desc: 'PDF reader & editor (.pdf)', exts: ['.pdf'] },
    designcraft: { name: 'DesignCraft', icon: '📰', category: 'Office', desc: 'Page & layout design', exts: ['.design'] },
    // Images & Design
    photocraft:  { name: 'PhotoCraft',  icon: '🖼️', category: 'Images & Design', desc: 'Raster photo editor (.png, .jpg)', exts: ['.png', '.jpg', '.jpeg', '.webp', '.bmp'] },
    lightcraft:  { name: 'LightCraft',  icon: '🌅', category: 'Images & Design', desc: 'Non-destructive photo & RAW', exts: ['.dng', '.raw', '.tiff'] },
    vectorcraft: { name: 'VectorCraft', icon: '✒️', category: 'Images & Design', desc: 'Vector graphics (.svg)', exts: ['.svg'] },
    figcraft:    { name: 'FigCraft',    icon: '🎨', category: 'Images & Design', desc: 'UI design & prototyping', exts: ['.fig'] },
    // Video, Audio & CAD
    filmcraft:   { name: 'FilmCraft',   icon: '🎬', category: 'Video, Audio & CAD', desc: 'Nonlinear video editor (.mp4, .mov)', exts: ['.mp4', '.mov', '.webm', '.mkv'] },
    effectcraft: { name: 'EffectCraft', icon: '✨', category: 'Video, Audio & CAD', desc: 'Motion graphics & compositing', exts: ['.aep', '.comp'] },
    soundcraft:  { name: 'SoundCraft',  icon: '🎵', category: 'Video, Audio & CAD', desc: 'Digital audio workstation (.wav, .mp3)', exts: ['.wav', '.mp3', '.ogg', '.flac'] },
    cadcraft:    { name: 'CADCraft',    icon: '📐', category: 'Video, Audio & CAD', desc: '2D/3D CAD drafting (.dxf)', exts: ['.dxf', '.dwg', '.cad'] }
  };

  function findCraftAppForExt(ext) {
    for (const [id, info] of Object.entries(CRAFT_APPS)) {
      if (info.exts.includes(ext)) return id;
    }
    return null;
  }

  function getFileAppLabel(item) {
    if (item.isDir) return 'Folder';
    const appId = findCraftAppForExt(item.ext);
    if (appId && CRAFT_APPS[appId]) return CRAFT_APPS[appId].name;
    if (item.ext === '.bcraft') return 'Boardcraft';
    return (item.ext || 'file').replace('.', '').toUpperCase() || 'File';
  }

  function renderAppsModal(filterText = '') {
    const q = filterText.trim().toLowerCase();
    const groups = [
      {
        title: 'Office & Productivity',
        items: [
          ...Object.entries(CRAFT_APPS).filter(([, a]) => a.category === 'Office').map(([id, a]) => ({ ...a, action: () => { els.appsDialog.close(); launchCraftWasmApp(id); } })),
          { name: 'Boardcraft', icon: '📋', desc: 'Kanban board (.bcraft)', action: () => { els.appsDialog.close(); openCreateDialog('bcraft'); } }
        ]
      },
      {
        title: 'Images & Design',
        items: Object.entries(CRAFT_APPS).filter(([, a]) => a.category === 'Images & Design').map(([id, a]) => ({ ...a, action: () => { els.appsDialog.close(); launchCraftWasmApp(id); } }))
      },
      {
        title: 'Video, Audio & CAD',
        items: Object.entries(CRAFT_APPS).filter(([, a]) => a.category === 'Video, Audio & CAD').map(([id, a]) => ({ ...a, action: () => { els.appsDialog.close(); launchCraftWasmApp(id); } }))
      },
      {
        title: 'Devices & Sync',
        items: [
          { name: 'Scanner & OCR', icon: '📠', desc: 'eSCL flatbed or image OCR', action: () => { els.appsDialog.close(); openScannerModal(); } },
          { name: 'Network Printer', icon: '🖨️', desc: 'IPP port 631 & browser print', action: () => { els.appsDialog.close(); openPrinterModal(); } }
        ]
      }
    ];

    els.appsModalBody.innerHTML = '';
    groups.forEach(g => {
      const matched = g.items.filter(it => !q || it.name.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q));
      if (!matched.length) return;
      const sec = document.createElement('div');
      sec.innerHTML = `<h4 class="apps-cat-title">${g.title}</h4>`;
      const grid = document.createElement('div');
      grid.className = 'apps-modal-grid';
      matched.forEach(it => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-mini-card';
        btn.innerHTML = `<span style="font-size:1.35rem;">${it.icon}</span><div><strong>${it.name}</strong><small>${it.desc}</small></div>`;
        btn.onclick = it.action;
        grid.appendChild(btn);
      });
      sec.appendChild(grid);
      els.appsModalBody.appendChild(sec);
    });
  }

  function openAppsLauncher() {
    els.appsFilterInput.value = '';
    renderAppsModal('');
    els.appsDialog.showModal();
    els.appsFilterInput.focus();
  }

  els.appsCloseBtn.onclick = () => els.appsDialog.close();
  els.appsFilterInput.oninput = () => renderAppsModal(els.appsFilterInput.value);

  function renderHome() {
    state.openFile = null;
    els.editorStage.classList.remove('wasm-mode');
    updateTopbar();
    renderFileList();

    const viewMode = localStorage.getItem('seacraft_view_mode') || 'list';
    const wrap = document.createElement('div');
    wrap.className = 'home-container';

    wrap.innerHTML = `
      <div class="home-header-row">
        <div>
          <h1>${state.currentLib || 'SeaCraft'}</h1>
          <span class="muted">${state.currentDir ? '/' + state.currentDir : '/ (Root)'} · ${state.items.length} items</span>
        </div>
      </div>
      <div class="quick-launch-bar">
        <div class="quick-launch-group">
          <button type="button" class="ql-btn" data-app="wordcraft">📝 WordCraft</button>
          <button type="button" class="ql-btn" data-app="gridcraft">📊 GridCraft</button>
          <button type="button" class="ql-btn" data-app="deckcraft">📽️ DeckCraft</button>
          <button type="button" class="ql-btn" id="qlScannerBtn">📠 Scanner</button>
          <button type="button" class="ql-btn ql-btn-accent" id="qlAllAppsBtn">⊞ All Apps (13)</button>
        </div>
        <div class="quick-launch-group">
          <button type="button" class="btn btn-ghost" id="qlUploadBtn">⇪ Upload</button>
          <button type="button" class="btn btn-ghost" id="qlFolderBtn">📁+ Folder</button>
          <button type="button" class="btn btn-ghost" id="qlViewToggle">${viewMode === 'list' ? '⊞ Grid' : '☰ List'}</button>
        </div>
      </div>
      <div id="homeFilesContainer"></div>
    `;

    wrap.querySelectorAll('.ql-btn[data-app]').forEach(btn => {
      btn.onclick = () => launchCraftWasmApp(btn.dataset.app);
    });
    wrap.querySelector('#qlScannerBtn').onclick = openScannerModal;
    wrap.querySelector('#qlAllAppsBtn').onclick = openAppsLauncher;
    wrap.querySelector('#qlUploadBtn').onclick = () => els.uploadInput.click();
    wrap.querySelector('#qlFolderBtn').onclick = () => openCreateDialog('folder');
    wrap.querySelector('#qlViewToggle').onclick = () => {
      localStorage.setItem('seacraft_view_mode', viewMode === 'list' ? 'grid' : 'list');
      renderHome();
    };

    const filesContainer = wrap.querySelector('#homeFilesContainer');
    if (state.items.length === 0) {
      filesContainer.innerHTML = '<p class="muted">No files yet in this directory. Upload a file or launch a Craft app above.</p>';
    } else if (viewMode === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'files-grid';
      state.items.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'file-tile';
        tile.innerHTML = `
          <div class="file-tile-title">${fileIcon(item)} <span></span></div>
          <div class="file-tile-meta">${item.isDir ? 'Folder' : formatBytes(item.size)} · ${new Date(item.mtime).toLocaleString()}</div>
        `;
        tile.querySelector('span').textContent = item.name;
        tile.onclick = () => {
          if (item.isDir) loadFiles(item.path);
          else openDocument(state.currentLib, item.path);
        };
        grid.appendChild(tile);
      });
      filesContainer.appendChild(grid);
    } else {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'seafile-table-wrap';
      const table = document.createElement('table');
      table.className = 'seafile-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Name</th>
            <th>App / Type</th>
            <th>Size</th>
            <th>Modified</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');
      state.items.forEach(item => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        const nameDiv = document.createElement('div');
        nameDiv.className = 'sf-name-cell';
        nameDiv.innerHTML = `<span>${fileIcon(item)}</span><span></span>`;
        nameDiv.querySelectorAll('span')[1].textContent = item.name;
        nameDiv.onclick = () => {
          if (item.isDir) loadFiles(item.path);
          else openDocument(state.currentLib, item.path);
        };
        tdName.appendChild(nameDiv);

        const tdType = document.createElement('td');
        tdType.innerHTML = `<span class="sf-badge">${getFileAppLabel(item)}</span>`;

        const tdSize = document.createElement('td');
        tdSize.className = 'muted';
        tdSize.textContent = item.isDir ? '—' : formatBytes(item.size);

        const tdMod = document.createElement('td');
        tdMod.className = 'muted';
        tdMod.textContent = new Date(item.mtime).toLocaleString();

        const tdAct = document.createElement('td');
        const actDiv = document.createElement('div');
        actDiv.className = 'sf-actions';

        if (!item.isDir) {
          const dlBtn = document.createElement('button');
          dlBtn.type = 'button';
          dlBtn.className = 'icon-btn';
          dlBtn.title = 'Download';
          dlBtn.textContent = '⭳';
          dlBtn.onclick = () => {
            window.location.href = `/api/file/download?lib=${encodeURIComponent(state.currentLib)}&path=${encodeURIComponent(item.path)}`;
          };

          const prBtn = document.createElement('button');
          prBtn.type = 'button';
          prBtn.className = 'icon-btn';
          prBtn.title = 'Print (IPP / Browser)';
          prBtn.textContent = '🖨️';
          prBtn.onclick = () => {
            state.openFile = { lib: state.currentLib, path: item.path, name: item.name };
            openPrinterModal();
          };
          actDiv.append(dlBtn, prBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'icon-btn';
        delBtn.title = 'Delete';
        delBtn.textContent = '🗑';
        delBtn.onclick = async () => {
          if (!confirm(`Delete "${item.name}"?`)) return;
          await api(`/api/file?lib=${encodeURIComponent(state.currentLib)}&path=${encodeURIComponent(item.path)}`, { method: 'DELETE' });
          await loadLibraries();
        };
        actDiv.appendChild(delBtn);
        tdAct.appendChild(actDiv);

        tr.append(tdName, tdType, tdSize, tdMod, tdAct);
        tbody.appendChild(tr);
      });
      tableWrap.appendChild(table);
      filesContainer.appendChild(tableWrap);
    }

    els.editorStage.innerHTML = '';
    els.editorStage.appendChild(wrap);
  }

  els.homeBtn.onclick = renderHome;
  document.querySelectorAll('.craft-launch-btn').forEach(btn => {
    btn.onclick = () => {
      els.sidebar.classList.remove('open');
      launchCraftWasmApp(btn.dataset.app);
    };
  });

  function launchCraftWasmApp(appName, file = null) {
    const info = CRAFT_APPS[appName] || { name: appName, icon: '🧩' };
    const label = `${info.icon} ${info.name} (WASM)`;
    const appUrl = `/apps/${appName}/index.html`;

    state.openFile = file;
    updateTopbar();
    if (!file) {
      els.docBreadcrumb.textContent = `${state.currentLib || 'SeaCraft'} · ${label}`;
      els.saveBadge.textContent = 'WASM Studio';
    }

    els.editorStage.classList.add('wasm-mode');
    els.editorStage.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'craft-wasm-bar';
    bar.innerHTML = `
      <div>
        <strong>${label}</strong>
        <span class="muted"> · Export/Save from app and upload to <em>${state.currentLib || 'Library'}</em> to sync</span>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn" id="wasmUploadBtn" style="padding:4px 10px; font-size:0.78rem;">⇪ Upload to Library</button>
        <a class="btn btn-ghost" href="${appUrl}" target="_blank" rel="noopener" style="padding:4px 10px; font-size:0.78rem; text-decoration:none;">↗ New Tab</a>
      </div>
    `;
    bar.querySelector('#wasmUploadBtn').onclick = () => els.uploadInput.click();

    const iframe = document.createElement('iframe');
    iframe.className = 'craft-wasm-frame';
    iframe.src = appUrl;
    iframe.title = label;

    els.editorStage.append(bar, iframe);
  }

  async function openDocument(lib, docPath) {
    const file = await api(`/api/file?lib=${encodeURIComponent(lib)}&path=${encodeURIComponent(docPath)}`);
    state.openFile = file;
    state.currentLib = lib;
    setDirty(false, 'Saved');
    updateTopbar();
    renderFileList();

    const onChange = (newContent) => {
      if (state.openFile) {
        state.openFile.content = newContent;
        setDirty(true, 'Unsaved changes');
      }
    };

    const matchedApp = findCraftAppForExt(file.ext);
    if (matchedApp) {
      launchCraftWasmApp(matchedApp, file);
    } else if (file.ext === '.bcraft' && typeof window.renderBoardcraft === 'function') {
      els.editorStage.classList.remove('wasm-mode');
      window.renderBoardcraft(els.editorStage, file.content, onChange);
    } else {
      els.editorStage.classList.remove('wasm-mode');
      const ta = document.createElement('textarea');
      ta.className = 'plain-editor';
      ta.value = file.content;
      ta.oninput = () => onChange(ta.value);
      els.editorStage.innerHTML = '';
      els.editorStage.appendChild(ta);
    }
  }

  async function saveCurrentFile() {
    if (!state.openFile) return;
    setDirty(true, 'Saving...');
    try {
      await api('/api/file', {
        method: 'PUT',
        body: JSON.stringify({
          lib: state.openFile.lib,
          path: state.openFile.path,
          content: state.openFile.content
        })
      });
      setDirty(false, 'Saved ✓');
      loadLibraries();
    } catch (err) {
      setDirty(true, 'Save failed: ' + err.message);
    }
  }

  els.saveBtn.onclick = saveCurrentFile;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      if (state.openFile) {
        e.preventDefault();
        saveCurrentFile();
      }
    }
  });

  els.downloadBtn.onclick = () => {
    if (!state.openFile) return;
    window.location.href = `/api/file/download?lib=${encodeURIComponent(state.openFile.lib)}&path=${encodeURIComponent(state.openFile.path)}`;
  };

  // Create Dialog (Library, Folder, wcraft, gcraft, bcraft)
  function openCreateDialog(kind) {
    els.createKind.value = kind;
    els.createNameInput.value = '';
    const labels = {
      library: 'New Seafile Library',
      folder: 'New Folder',
      wcraft: 'New Wordcraft Document (.wcraft)',
      gcraft: 'New Gridcraft Sheet (.gcraft)',
      bcraft: 'New Boardcraft Board (.bcraft)'
    };
    els.createDialogTitle.textContent = labels[kind] || 'Create New';
    els.createDialog.showModal();
    els.createNameInput.focus();
  }

  els.newLibBtn.onclick = () => openCreateDialog('library');
  els.newFolderBtn.onclick = () => openCreateDialog('folder');
  els.createCancelBtn.onclick = () => els.createDialog.close();

  els.createForm.onsubmit = async (e) => {
    e.preventDefault();
    const kind = els.createKind.value;
    let name = els.createNameInput.value.trim();
    if (!name) return;

    try {
      if (kind === 'library') {
        await api('/api/libraries', { method: 'POST', body: JSON.stringify({ name }) });
        state.currentLib = name;
        state.currentDir = '';
        els.createDialog.close();
        await loadLibraries();
        renderHome();
      } else if (kind === 'folder') {
        await api('/api/files', {
          method: 'POST',
          body: JSON.stringify({ lib: state.currentLib, dir: state.currentDir, name, isDir: true })
        });
        els.createDialog.close();
        await loadLibraries();
      } else {
        const ext = '.' + kind;
        if (!name.toLowerCase().endsWith(ext)) name += ext;
        const created = await api('/api/files', {
          method: 'POST',
          body: JSON.stringify({ lib: state.currentLib, dir: state.currentDir, name, isDir: false })
        });
        els.createDialog.close();
        await loadLibraries();
        await openDocument(state.currentLib, created.path);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Upload
  els.uploadBtn.onclick = () => els.uploadInput.click();
  els.uploadInput.onchange = () => {
    const file = els.uploadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1] || '';
      try {
        await api('/api/files', {
          method: 'POST',
          body: JSON.stringify({
            lib: state.currentLib,
            dir: state.currentDir,
            name: file.name,
            contentBase64: base64
          })
        });
        await loadLibraries();
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
      els.uploadInput.value = '';
    };
    reader.readAsDataURL(file);
  };

  // Version History
  els.historyBtn.onclick = async () => {
    if (!state.openFile) return;
    const data = await api(`/api/history?lib=${encodeURIComponent(state.openFile.lib)}&path=${encodeURIComponent(state.openFile.path)}`);
    els.historyList.innerHTML = '';
    if (!data.versions || data.versions.length === 0) {
      els.historyList.innerHTML = '<li class="muted" style="padding:10px;">No previous snapshots yet. Save the document to create one.</li>';
    } else {
      data.versions.forEach(v => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
          <div>
            <strong>${new Date(v.mtime).toLocaleString()}</strong>
            <div class="muted">${formatBytes(v.size)}</div>
          </div>
        `;
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'btn';
        restoreBtn.textContent = 'Restore';
        restoreBtn.onclick = async () => {
          if (!confirm('Restore this snapshot? Current version will also be backed up.')) return;
          await api('/api/history/restore', {
            method: 'POST',
            body: JSON.stringify({ lib: state.openFile.lib, path: state.openFile.path, versionId: v.id })
          });
          els.historyDialog.close();
          await openDocument(state.openFile.lib, state.openFile.path);
        };
        li.appendChild(restoreBtn);
        els.historyList.appendChild(li);
      });
    }
    els.historyDialog.showModal();
  };
  els.historyCloseBtn.onclick = () => els.historyDialog.close();

  // Search
  let searchTimer = null;
  els.searchInput.oninput = () => {
    clearTimeout(searchTimer);
    const q = els.searchInput.value.trim();
    if (!q) {
      els.searchResults.classList.add('hidden');
      return;
    }
    searchTimer = setTimeout(async () => {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
      els.searchResults.innerHTML = '';
      if (!data.results.length) {
        els.searchResults.innerHTML = '<div class="search-item muted">No matches</div>';
      } else {
        data.results.forEach(r => {
          const div = document.createElement('div');
          div.className = 'search-item';
          div.innerHTML = `<strong></strong><small></small>`;
          div.querySelector('strong').textContent = r.name;
          div.querySelector('small').textContent = `${r.lib} / ${r.path}`;
          div.onclick = () => {
            els.searchResults.classList.add('hidden');
            els.searchInput.value = '';
            openDocument(r.lib, r.path);
          };
          els.searchResults.appendChild(div);
        });
      }
      els.searchResults.classList.remove('hidden');
    }, 200);
  };

  document.addEventListener('click', (e) => {
    if (!els.searchResults.contains(e.target) && e.target !== els.searchInput) {
      els.searchResults.classList.add('hidden');
    }
  });

  // Sync Status & Settings
  async function refreshSyncStatus(populateForm = false) {
    try {
      const data = await api('/api/sync/status');
      const st = data.state || {};
      const cfg = data.config || {};

      els.syncDot.className = 'sync-dot ' + (st.status === 'error' ? 'err' : (st.status === 'connected' || st.status === 'local_active' ? 'ok' : ''));
      if (st.mode === 'seafile') {
        els.syncLabel.textContent = st.status === 'connected' ? 'Seafile: Connected' : 'Seafile: Error';
      } else {
        els.syncLabel.textContent = 'Sync: Local Active';
      }
      els.syncSub.textContent = `${st.totalFiles ?? 0} files · ${st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleTimeString() : 'checking'}`;

      if (populateForm) {
        els.seafileServerInput.value = cfg.seafileServer || '';
        els.seafileRepoInput.value = cfg.repoId || '';
        els.seafileIntervalInput.value = cfg.syncIntervalMs || 30000;
        els.seafileTokenInput.value = '';
        els.syncStatsBox.textContent = `Mode: ${st.mode || 'local'} | Status: ${st.status} | Tracked Files: ${st.totalFiles ?? 0} (${formatBytes(st.totalBytes ?? 0)})` + (st.error ? ` | Error: ${st.error}` : '');
        els.syncLogsPre.textContent = (st.logs || []).join('\n') || 'No logs yet.';
      }
    } catch {
      els.syncLabel.textContent = 'Sync: Offline';
    }
  }

  els.syncStatusBtn.onclick = async () => {
    await refreshSyncStatus(true);
    els.syncDialog.showModal();
  };
  els.syncCloseBtn.onclick = () => els.syncDialog.close();

  els.syncNowBtn.onclick = async () => {
    await api('/api/sync/trigger', { method: 'POST' });
    setTimeout(() => refreshSyncStatus(true), 1000);
  };

  els.syncForm.onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/sync/config', {
      method: 'POST',
      body: JSON.stringify({
        seafileServer: els.seafileServerInput.value,
        repoId: els.seafileRepoInput.value,
        syncIntervalMs: Number(els.seafileIntervalInput.value),
        seafileToken: els.seafileTokenInput.value
      })
    });
    els.syncDialog.close();
    setTimeout(() => refreshSyncStatus(false), 1200);
  };

  // Scanner & OCR Integration
  async function checkScannerStatus() {
    els.scannerStatusBox.textContent = 'Probing eSCL scanner...';
    try {
      const ip = els.scannerIpInput.value.trim();
      const data = await api(`/api/scanner/status?ip=${encodeURIComponent(ip)}`);
      const s = data.scanner;
      els.scannerStatusBox.textContent = `${s.online ? '🟢 Online' : '🟡 Unreachable'}: ${s.model} (${s.ip}) — ${s.state}`;
    } catch (err) {
      els.scannerStatusBox.textContent = 'Error: ' + err.message;
    }
  }

  function openScannerModal() {
    els.sidebar.classList.remove('open');
    els.scannerResultPre.classList.add('hidden');
    els.scannerDialog.showModal();
    checkScannerStatus();
  }
  els.scannerCloseBtn.onclick = () => els.scannerDialog.close();
  els.scannerCancelBtn.onclick = () => els.scannerDialog.close();
  els.scannerProbeBtn.onclick = checkScannerStatus;

  els.scannerSourceSelect.onchange = () => {
    els.scannerUploadField.classList.toggle('hidden', els.scannerSourceSelect.value !== 'upload');
  };

  els.scannerDiscoverBtn.onclick = async () => {
    els.scannerStatusBox.textContent = 'Scanning LAN via airscan-discover...';
    try {
      const data = await api('/api/scanner/discover', { method: 'POST' });
      if (data.scanners && data.scanners.length > 0) {
        els.scannerIpInput.value = data.scanners[0].ip;
        els.printerIpInput.value = data.scanners[0].ip;
        els.scannerStatusBox.textContent = `Found ${data.scanners.length}: ${data.scanners[0].name} (${data.scanners[0].ip})`;
      } else {
        els.scannerStatusBox.textContent = 'No eSCL scanners discovered on LAN. Check power/Wi-Fi or use Image Upload.';
      }
    } catch (err) {
      els.scannerStatusBox.textContent = 'Discover failed: ' + err.message;
    }
  };

  els.scannerForm.onsubmit = async (e) => {
    e.preventDefault();
    const source = els.scannerSourceSelect.value;
    const payload = {
      lib: state.currentLib || 'My Workspace',
      dir: state.currentDir || '',
      source,
      ip: els.scannerIpInput.value.trim(),
      format: els.scannerFormatSelect.value,
      dpi: Number(els.scannerDpiSelect.value),
      ocrLang: els.scannerLangSelect.value,
      filename: els.scannerFilenameInput.value.trim()
    };

    if (source === 'upload') {
      const f = els.scannerFileInput.files[0];
      if (!f) {
        alert('Please select an image or PDF file to scan/OCR.');
        return;
      }
      payload.inputFilename = f.name;
      payload.imageBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(f);
      });
    }

    els.scannerRunBtn.disabled = true;
    els.scannerRunBtn.textContent = 'Scanning & Running OCR...';
    try {
      const res = await api('/api/scanner/scan', { method: 'POST', body: JSON.stringify(payload) });
      els.scannerResultPre.classList.remove('hidden');
      els.scannerResultPre.textContent = `Saved: ${res.lib}/${res.path} (${formatBytes(res.size)})\n` +
        (res.ocr_preview ? `\nOCR Preview:\n${res.ocr_preview}` : '');
      await loadLibraries();
    } catch (err) {
      alert('Scan failed: ' + err.message);
    } finally {
      els.scannerRunBtn.disabled = false;
      els.scannerRunBtn.textContent = 'Scan & Save to Library';
    }
  };

  // Printer Integration
  async function checkPrinterStatus() {
    els.printerStatusBox.textContent = 'Probing IPP port 631...';
    try {
      const ip = els.printerIpInput.value.trim();
      const data = await api(`/api/printer/status?ip=${encodeURIComponent(ip)}`);
      const p = data.printer;
      els.printerStatusBox.textContent = `${p.online ? '🟢 Online' : '🟡 Unreachable'}: ${p.ip} — ${p.state}`;
    } catch (err) {
      els.printerStatusBox.textContent = 'Error: ' + err.message;
    }
  }

  function openPrinterModal() {
    els.sidebar.classList.remove('open');
    els.printerFilePathInput.value = state.openFile ? `${state.openFile.lib}/${state.openFile.path}` : 'No file open (use Browser Print or open a .pdf/.jpg/.png/.txt)';
    els.ippPrintBtn.disabled = !state.openFile;
    els.printerDialog.showModal();
    checkPrinterStatus();
  }

  els.printDocBtn.onclick = openPrinterModal;
  els.printerCloseBtn.onclick = () => els.printerDialog.close();
  els.printerProbeBtn.onclick = checkPrinterStatus;

  els.browserPrintBtn.onclick = () => {
    els.printerDialog.close();
    window.print();
  };

  els.printerForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!state.openFile) return;
    els.ippPrintBtn.disabled = true;
    els.ippPrintBtn.textContent = 'Sending IPP Job...';
    try {
      const res = await api('/api/printer/print', {
        method: 'POST',
        body: JSON.stringify({
          ip: els.printerIpInput.value.trim(),
          lib: state.openFile.lib,
          path: state.openFile.path
        })
      });
      alert(`Print job sent! (${res.ipp_url}, status ${res.ipp_status})`);
      els.printerDialog.close();
    } catch (err) {
      alert('IPP Print failed: ' + err.message);
    } finally {
      els.ippPrintBtn.disabled = false;
      els.ippPrintBtn.textContent = 'Send to Network Printer (IPP)';
    }
  };

  // Init
  loadLibraries();
  refreshSyncStatus();
  setInterval(() => refreshSyncStatus(false), 15000);
})();
