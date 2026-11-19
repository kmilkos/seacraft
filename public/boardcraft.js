(function () {
  function uid() {
    return 'c_' + Math.random().toString(36).slice(2, 9);
  }

  window.renderBoardcraft = function (container, rawContent, onChange) {
    let board;
    try {
      board = JSON.parse(rawContent);
      if (!Array.isArray(board.columns)) throw new Error('Invalid board');
    } catch {
      board = {
        type: 'boardcraft',
        title: 'Board',
        columns: [
          { id: uid(), title: 'To Do', cards: [] },
          { id: uid(), title: 'In Progress', cards: [] },
          { id: uid(), title: 'Done', cards: [] }
        ]
      };
    }

    const wrap = document.createElement('div');
    wrap.className = 'boardcraft-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'bc-toolbar';

    function emit() {
      onChange(JSON.stringify(board, null, 2));
    }

    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.className = 'btn';
    addColBtn.textContent = '+ Add Column';
    addColBtn.onclick = () => {
      const title = prompt('Column title:', 'New Column');
      if (!title) return;
      board.columns.push({ id: uid(), title: title.trim(), cards: [] });
      emit();
      renderCols();
    };
    toolbar.appendChild(addColBtn);

    const colsWrap = document.createElement('div');
    colsWrap.className = 'bc-columns';

    function renderCols() {
      colsWrap.innerHTML = '';
      board.columns.forEach((col, colIdx) => {
        const colEl = document.createElement('div');
        colEl.className = 'bc-col';

        const header = document.createElement('div');
        header.className = 'bc-col-header';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${col.title} (${col.cards.length})`;

        const addCardBtn = document.createElement('button');
        addCardBtn.type = 'button';
        addCardBtn.className = 'icon-btn';
        addCardBtn.textContent = '+';
        addCardBtn.title = 'Add Card';
        addCardBtn.onclick = () => {
          const title = prompt('Card title:');
          if (!title) return;
          const tag = prompt('Tag (e.g. Sync, UI, Bug):', 'Task') || 'Task';
          col.cards.push({ id: uid(), title: title.trim(), tag: tag.trim(), priority: 'medium' });
          emit();
          renderCols();
        };

        header.append(titleSpan, addCardBtn);
        colEl.appendChild(header);

        col.cards.forEach((card, cardIdx) => {
          const cardEl = document.createElement('div');
          cardEl.className = 'bc-card';

          const cTitle = document.createElement('div');
          cTitle.className = 'bc-card-title';
          cTitle.textContent = card.title;

          const footer = document.createElement('div');
          footer.className = 'bc-card-footer';

          const tag = document.createElement('span');
          tag.className = 'bc-tag';
          tag.textContent = card.tag || 'Task';

          const actions = document.createElement('div');
          if (colIdx > 0) {
            const leftBtn = document.createElement('button');
            leftBtn.type = 'button';
            leftBtn.className = 'icon-btn';
            leftBtn.textContent = '←';
            leftBtn.title = 'Move Left';
            leftBtn.onclick = () => {
              col.cards.splice(cardIdx, 1);
              board.columns[colIdx - 1].cards.push(card);
              emit();
              renderCols();
            };
            actions.appendChild(leftBtn);
          }
          if (colIdx < board.columns.length - 1) {
            const rightBtn = document.createElement('button');
            rightBtn.type = 'button';
            rightBtn.className = 'icon-btn';
            rightBtn.textContent = '→';
            rightBtn.title = 'Move Right';
            rightBtn.onclick = () => {
              col.cards.splice(cardIdx, 1);
              board.columns[colIdx + 1].cards.push(card);
              emit();
              renderCols();
            };
            actions.appendChild(rightBtn);
          }
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'icon-btn';
          delBtn.textContent = '✕';
          delBtn.title = 'Delete Card';
          delBtn.onclick = () => {
            col.cards.splice(cardIdx, 1);
            emit();
            renderCols();
          };
          actions.appendChild(delBtn);

          footer.append(tag, actions);
          cardEl.append(cTitle, footer);
          colEl.appendChild(cardEl);
        });

        colsWrap.appendChild(colEl);
      });
    }

    wrap.append(toolbar, colsWrap);
    container.innerHTML = '';
    container.appendChild(wrap);
    renderCols();
  };
})();
