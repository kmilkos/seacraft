(function () {
  function colLetter(idx) {
    let s = '';
    let n = idx;
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  function parseCellRef(ref) {
    const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
    if (!m) return null;
    const letters = m[1].toUpperCase();
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return { col: col - 1, row: parseInt(m[2], 10) - 1 };
  }

  function evalFormula(expr, rows) {
    if (typeof expr !== 'string' || !expr.startsWith('=')) return expr;
    const raw = expr.slice(1).trim().toUpperCase();
    const fnMatch = /^(SUM|AVG|COUNT)\(([^:]+):([^)]+)\)$/.exec(raw);
    if (fnMatch) {
      const fn = fnMatch[1];
      const start = parseCellRef(fnMatch[2]);
      const end = parseCellRef(fnMatch[3]);
      if (!start || !end) return '#REF!';
      const vals = [];
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const cell = rows[r]?.[c];
          const num = parseFloat(cell);
          if (!Number.isNaN(num)) vals.push(num);
        }
      }
      if (fn === 'COUNT') return String(vals.length);
      const sum = vals.reduce((a, b) => a + b, 0);
      if (fn === 'SUM') return String(Math.round(sum * 100) / 100);
      if (fn === 'AVG') return vals.length ? String(Math.round((sum / vals.length) * 100) / 100) : '0';
    }
    return expr;
  }

  window.renderGridcraft = function (container, rawContent, onChange) {
    let data;
    try {
      data = JSON.parse(rawContent);
      if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error('Invalid grid');
    } catch {
      data = {
        type: 'gridcraft',
        title: 'Grid',
        columns: ['Column A', 'Column B', 'Column C'],
        rows: [['', '', ''], ['', '', '']]
      };
    }

    const wrap = document.createElement('div');
    wrap.className = 'gridcraft-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'gc-toolbar';

    function emit() {
      onChange(JSON.stringify(data, null, 2));
    }

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'btn';
    addRowBtn.textContent = '+ Add Row';
    addRowBtn.onclick = () => {
      data.rows.push(new Array(data.columns.length).fill(''));
      emit();
      renderTable();
    };

    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.className = 'btn';
    addColBtn.textContent = '+ Add Column';
    addColBtn.onclick = () => {
      data.columns.push('Column ' + colLetter(data.columns.length));
      data.rows.forEach(r => r.push(''));
      emit();
      renderTable();
    };

    const exportCsvBtn = document.createElement('button');
    exportCsvBtn.type = 'button';
    exportCsvBtn.className = 'btn btn-ghost';
    exportCsvBtn.textContent = 'Export CSV';
    exportCsvBtn.onclick = () => {
      const lines = [data.columns, ...data.rows.map(r => r.map(c => evalFormula(c, data.rows)))];
      const csv = lines.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (data.title || 'grid') + '.csv';
      a.click();
    };

    const hint = document.createElement('span');
    hint.className = 'muted';
    hint.textContent = 'Tip: Supports =SUM(D1:D4), =AVG(...), =COUNT(...)';

    toolbar.append(addRowBtn, addColBtn, exportCsvBtn, hint);

    const table = document.createElement('table');
    table.className = 'gc-table';

    function renderTable() {
      table.innerHTML = '';
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'gc-row-num';
      corner.textContent = '#';
      hr.appendChild(corner);

      data.columns.forEach((colName, cIdx) => {
        const th = document.createElement('th');
        const inp = document.createElement('input');
        inp.className = 'gc-cell-input';
        inp.style.fontWeight = '600';
        inp.value = colName;
        inp.title = `Column ${colLetter(cIdx)}`;
        inp.oninput = () => {
          data.columns[cIdx] = inp.value;
          emit();
        };
        th.appendChild(inp);
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.rows.forEach((row, rIdx) => {
        const tr = document.createElement('tr');
        const numTd = document.createElement('td');
        numTd.className = 'gc-row-num';
        numTd.textContent = String(rIdx + 1);
        tr.appendChild(numTd);

        data.columns.forEach((_, cIdx) => {
          const td = document.createElement('td');
          const rawVal = row[cIdx] ?? '';
          if (typeof rawVal === 'string' && rawVal.startsWith('=')) {
            const disp = document.createElement('div');
            disp.className = 'gc-formula-val';
            disp.textContent = evalFormula(rawVal, data.rows);
            disp.title = `Formula: ${rawVal} (click to edit)`;
            disp.onclick = () => {
              td.innerHTML = '';
              const inp = document.createElement('input');
              inp.className = 'gc-cell-input';
              inp.value = rawVal;
              inp.onblur = () => {
                row[cIdx] = inp.value;
                emit();
                renderTable();
              };
              inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
              td.appendChild(inp);
              inp.focus();
            };
            td.appendChild(disp);
          } else {
            const inp = document.createElement('input');
            inp.className = 'gc-cell-input';
            inp.value = rawVal;
            inp.onchange = () => {
              row[cIdx] = inp.value;
              emit();
              renderTable();
            };
            td.appendChild(inp);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    }

    wrap.append(toolbar, table);
    container.innerHTML = '';
    container.appendChild(wrap);
    renderTable();
  };
})();
