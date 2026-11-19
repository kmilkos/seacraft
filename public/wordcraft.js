(function () {
  function uid() {
    return 'b_' + Math.random().toString(36).slice(2, 9);
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  window.renderWordcraft = function (container, rawContent, onChange) {
    let doc;
    try {
      doc = JSON.parse(rawContent);
      if (!Array.isArray(doc.blocks)) throw new Error('Invalid blocks');
    } catch {
      doc = {
        type: 'wordcraft',
        title: 'Document',
        blocks: [{ id: uid(), type: 'p', text: rawContent || '' }]
      };
    }

    const wrap = document.createElement('div');
    wrap.className = 'wordcraft-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'wc-toolbar';
    const types = [
      { type: 'h1', label: 'H1' },
      { type: 'h2', label: 'H2' },
      { type: 'p', label: 'Text' },
      { type: 'bullet', label: '• List' },
      { type: 'todo', label: '☑ Todo' },
      { type: 'callout', label: '💡 Callout' },
      { type: 'code', label: '</> Code' },
      { type: 'divider', label: '― Divider' }
    ];

    types.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost';
      btn.textContent = '+ ' + t.label;
      btn.onclick = () => {
        doc.blocks.push({ id: uid(), type: t.type, text: '', checked: false });
        emit();
        renderBlocks();
      };
      toolbar.appendChild(btn);
    });

    const blocksList = document.createElement('div');

    function emit() {
      const h1 = doc.blocks.find(b => b.type === 'h1' && b.text.trim());
      if (h1) doc.title = h1.text.trim();
      onChange(JSON.stringify(doc, null, 2));
    }

    function renderBlocks() {
      blocksList.innerHTML = '';
      doc.blocks.forEach((block, idx) => {
        const row = document.createElement('div');
        row.className = `wc-block wc-type-${block.type}`;
        if (block.type === 'todo' && block.checked) row.classList.add('wc-todo-done');

        const controls = document.createElement('div');
        controls.className = 'wc-block-controls';

        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.title = 'Move Up';
        upBtn.textContent = '↑';
        upBtn.onclick = () => {
          if (idx === 0) return;
          [doc.blocks[idx - 1], doc.blocks[idx]] = [doc.blocks[idx], doc.blocks[idx - 1]];
          emit();
          renderBlocks();
        };

        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.title = 'Move Down';
        downBtn.textContent = '↓';
        downBtn.onclick = () => {
          if (idx >= doc.blocks.length - 1) return;
          [doc.blocks[idx + 1], doc.blocks[idx]] = [doc.blocks[idx], doc.blocks[idx + 1]];
          emit();
          renderBlocks();
        };

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.title = 'Delete Block';
        delBtn.textContent = '✕';
        delBtn.onclick = () => {
          if (doc.blocks.length <= 1) {
            doc.blocks[0].text = '';
          } else {
            doc.blocks.splice(idx, 1);
          }
          emit();
          renderBlocks();
        };

        controls.append(upBtn, downBtn, delBtn);
        row.appendChild(controls);

        if (block.type === 'divider') {
          const hr = document.createElement('hr');
          hr.className = 'wc-divider-line';
          row.appendChild(hr);
          blocksList.appendChild(row);
          return;
        }

        if (block.type === 'todo') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'wc-todo-check';
          cb.checked = Boolean(block.checked);
          cb.onchange = () => {
            block.checked = cb.checked;
            row.classList.toggle('wc-todo-done', block.checked);
            emit();
          };
          row.appendChild(cb);
        } else if (block.type === 'bullet') {
          const dot = document.createElement('span');
          dot.className = 'wc-bullet-dot';
          dot.textContent = '•';
          row.appendChild(dot);
        }

        const input = document.createElement('textarea');
        input.className = 'wc-input';
        input.rows = 1;
        input.value = block.text || '';
        input.placeholder = block.type === 'h1' ? 'Heading 1...' : 'Type here (Enter for new block)...';

        input.addEventListener('input', () => {
          block.text = input.value;
          autoResize(input);
          emit();
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
            e.preventDefault();
            const nextType = (block.type === 'bullet' || block.type === 'todo') ? block.type : 'p';
            doc.blocks.splice(idx + 1, 0, { id: uid(), type: nextType, text: '', checked: false });
            emit();
            renderBlocks();
            const inputs = blocksList.querySelectorAll('.wc-input');
            if (inputs[idx + 1]) inputs[idx + 1].focus();
          } else if (e.key === 'Backspace' && input.value === '' && doc.blocks.length > 1) {
            e.preventDefault();
            doc.blocks.splice(idx, 1);
            emit();
            renderBlocks();
            const inputs = blocksList.querySelectorAll('.wc-input');
            if (inputs[Math.max(0, idx - 1)]) inputs[Math.max(0, idx - 1)].focus();
          }
        });

        row.appendChild(input);
        blocksList.appendChild(row);
        requestAnimationFrame(() => autoResize(input));
      });
    }

    wrap.append(toolbar, blocksList);
    container.innerHTML = '';
    container.appendChild(wrap);
    renderBlocks();
  };
})();
