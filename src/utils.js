export function fmtDateLabel(iso) {
  if (!iso) return '날짜 미정';
  const d = new Date(`${iso}T00:00:00`);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}.${d.getDate()}(${days[d.getDay()]})`;
}

export function fmtMonthShort(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}월`;
}

export function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/* 구역 세그먼트 버튼: container 에 "전체 + 정렬된 구역들" 을 렌더하고,
   클릭 시 onPick(선택값) 호출. current='' 는 전체. zones 는 데이터에서 뽑은 구역 값 배열(숫자/문자 혼재 허용). */
export function renderZoneSeg(container, zones, current, onPick) {
  const uniq = [...new Set(
    zones.map((z) => String(z ?? '').trim()).filter((z) => z !== '' && z !== 'null' && z !== 'undefined'),
  )].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));

  const mk = (val, label) =>
    `<button type="button" class="seg-btn ${current === val ? 'on' : ''}" data-zone="${val}">${label}</button>`;

  container.innerHTML = mk('', '전체') + uniq.map((z) => mk(z, `${z}구역`)).join('');
  container.querySelectorAll('[data-zone]').forEach((btn) => {
    btn.addEventListener('click', () => onPick(btn.dataset.zone));
  });
}

/* 이름 부분일치(대소문자·공백 무시) */
export function nameMatch(name, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return String(name ?? '').toLowerCase().includes(q);
}
