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

/* "1+2", "3구역", "1 / 5" 같은 값에서 구역 토큰만 뽑아 정렬·중복제거 */
function zoneTokens(zones) {
  const set = new Set();
  zones.forEach((z) => String(z ?? '').split(/[^0-9A-Za-z가-힣]+/).forEach((t) => { if (t) set.add(t); }));
  return [...set].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
}

/* 구역 필터를 <select> 로 렌더. current='' 는 전체. 재호출해도 리스너가 쌓이지 않도록 onchange 로 바인딩. */
export function renderZoneSelect(selectEl, zones, current, onChange) {
  const opts = zoneTokens(zones);
  selectEl.innerHTML = `<option value="">전체 구역</option>`
    + opts.map((z) => `<option value="${z}">${z}구역</option>`).join('');
  selectEl.value = current;
  selectEl.onchange = () => onChange(selectEl.value);
}

/* zoneValue 안에 filter 구역 토큰이 포함되면 true. filter='' 는 통과. */
export function zoneMatch(zoneValue, filter) {
  if (!filter) return true;
  return String(zoneValue ?? '').split(/[^0-9A-Za-z가-힣]+/).filter(Boolean).includes(filter);
}
