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

/* "1+2", "3구역", "1 / 5" 같은 값에서 구역 토큰만 뽑아 정렬·중복제거 */
function zoneTokens(zones) {
  const set = new Set();
  zones.forEach((z) => String(z ?? '').split(/[^0-9A-Za-z가-힣]+/).forEach((t) => { if (t) set.add(t); }));
  return [...set].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
}

/* 구역 필터를 <select> 로 렌더. current='' 는 전체. 재호출해도 리스너가 쌓이지 않도록 onchange 로 바인딩. */
export function renderZoneSelect(selectEl, zones, current, onChange) {
  const opts = zoneTokens(zones);
  selectEl.innerHTML = `<option value="">전체</option>`
    + opts.map((z) => `<option value="${z}">${z}구역</option>`).join('');
  selectEl.value = current;
  selectEl.onchange = () => onChange(selectEl.value);
}

/* zoneValue 안에 filter 구역 토큰이 포함되면 true. filter='' 는 통과. */
export function zoneMatch(zoneValue, filter) {
  if (!filter) return true;
  return String(zoneValue ?? '').split(/[^0-9A-Za-z가-힣]+/).filter(Boolean).includes(filter);
}
