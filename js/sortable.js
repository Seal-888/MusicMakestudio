/**
 * 목록 드래그 정렬. 손잡이를 잡았을 때만 끌리게 해서
 * 제목 입력칸을 마우스로 선택하는 걸 방해하지 않습니다.
 *
 * 키보드로도 옮길 수 있습니다. 손잡이에 초점을 두고 위/아래 화살표.
 */
export function enableSort(container, onReorder) {
  let dragging = null;

  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-handle]');
    if (!handle) return;
    const row = handle.closest('[data-row]');
    if (row) row.draggable = true;
  });

  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest('[data-row]');
    if (!row) return;
    dragging = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // 파이어폭스는 이게 있어야 시작됩니다
  });

  container.addEventListener('dragover', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const over = e.target.closest('[data-row]');
    if (!over || over === dragging) return;

    const box = over.getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    over.parentNode.insertBefore(dragging, after ? over.nextSibling : over);
  });

  const finish = () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging.draggable = false;
    dragging = null;
    onReorder([...container.querySelectorAll('[data-row]')].map((r) => +r.dataset.index));
  };

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    finish();
  });
  container.addEventListener('dragend', finish);

  container.addEventListener('keydown', (e) => {
    const handle = e.target.closest('[data-handle]');
    if (!handle) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();

    const row = handle.closest('[data-row]');
    const rows = [...container.querySelectorAll('[data-row]')];
    const from = rows.indexOf(row);
    const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
    if (to < 0 || to >= rows.length) return;

    const order = rows.map((r) => +r.dataset.index);
    [order[from], order[to]] = [order[to], order[from]];
    onReorder(order, { focusIndex: to });
  });
}

/** 순서 배열대로 원본 배열을 다시 늘어놓습니다. */
export function applyOrder(list, order) {
  return order.map((i) => list[i]);
}
