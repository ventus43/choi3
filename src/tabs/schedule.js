import { meetingApi, outreachApi } from '../api.js';
import { renderZoneSelect, zoneMatch, nameMatch } from '../utils.js';

let rows = [];
let people = [];        // PRG='중단' 아닌 섭외자 (대상자 선택용)
let loadFailed = false;
let guFilter  = '';      // '' = 전체 구역
let nameQuery = '';
let pendingCancelId = null;   // 진행여부=취소 선택 후 비고에 사유 입력 중인 meeting id (동시에 하나만)
let editingDateId = null;     // 날짜 수정 중인 meeting id
let editingRowId = null;      // 시간장소·목표 수정 중인 meeting id (동시에 하나만)
let expandedCellKey = null;   // 펼쳐진 시간장소/목표 셀 키 ("<id>-meetCn" 등, 동시에 하나만)

const els = {};

const WD = ['일', '월', '화', '수', '목', '금', '토'];

function cacheEls() {
  els.list      = document.getElementById('schedule-list');
  els.count     = document.getElementById('count-schedule');
  els.form      = document.getElementById('schedule-form');
  els.toggleBtn = document.getElementById('toggle-schedule-form');
  els.cancelBtn = document.getElementById('cancel-schedule');
  els.saveBtn   = document.getElementById('save-schedule');
  els.error     = document.getElementById('schedule-error');
  els.person    = document.getElementById('sf-person');
  els.date      = document.getElementById('sf-date');
  els.place     = document.getElementById('sf-place');
  els.goal      = document.getElementById('sf-goal');
  els.rangeFrom = document.getElementById('sch-from');
  els.rangeTo   = document.getElementById('sch-to');
  els.guFilter  = document.getElementById('schedule-gu-filter');
  els.search    = document.getElementById('schedule-search');
}

function visibleRows() {
  return rows.filter((m) => zoneMatch(m.zone, guFilter) && nameMatch(m.hireName, nameQuery));
}

function dayLabel(iso) {
  if (!iso) return { md: '날짜 미정', dow: '' };
  const [y, m, d] = iso.split('-').map(Number);
  return { md: `${m}/${d}`, dow: WD[new Date(y, m - 1, d).getDay()] };
}

function todayIso() {
  const n = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/* 단계만남(2회차 이상)은 날짜 옆에 만남 횟수(회차) 표기: 날짜(2) */
function dateCell(m) {
  if (editingDateId === m.id) {
    return `<input type="date" class="date-edit-input" data-date-input="${m.id}" value="${m.meetDt || ''}">`;
  }
  const label  = m.meetDt || '날짜 입력';
  const suffix = m.seq > 1 ? `(${m.seq})` : '';
  return `<button type="button" class="date-edit-btn" data-date-edit="${m.id}">${label}${suffix}</button>`;
}

/* 만남자: 인도자/섬김이 (섬김이 없으면 "/섬김이" 생략) */
function meetPersonLabel(m) {
  const parts = [m.indo, m.seomgim].filter(Boolean);
  return parts.length ? parts.join('/') : '-';
}

/* 시간장소/목표: 평소엔 한 줄 말줄임, 클릭하면 펼쳐지고(다른 곳 클릭하면 원복) 크기는 그대로 유지 */
function expandableCell(m, field, labelText) {
  const key = `${m.id}-${field}`;
  const cls = expandedCellKey === key ? 'sched2-expandable expanded' : 'sched2-expandable';
  return `<td class="${cls}" data-expand-key="${key}" data-label="${labelText}">${m[field] || ''}</td>`;
}

function feedbackBtn(m) {
  const on = m.feedbackYn === 'Y';
  return `<button type="button" class="sched2-fb ${on ? 'on' : ''}" data-fb="${m.id}">${on ? '완료' : '대기'}</button>`;
}

/* 진행여부: 선택(기본) / 만남(meetYn=Y) / 취소(cancelRs 있음) — 취소된 항목도 표에 계속 남음 */
function progState(m) {
  if (pendingCancelId === m.id) return 'cancel';   // 취소 선택 후 사유 입력 대기 중인 상태도 취소로 표시
  if (m.cancelRs) return 'cancel';
  if (m.meetYn === 'Y') return 'confirm';
  return 'select';
}

function progressSelect(m) {
  const state = progState(m);
  return `
    <select class="sched2-prog-select prog-${state}" data-prog="${m.id}">
      <option value="select" ${state === 'select' ? 'selected' : ''}>선택</option>
      <option value="confirm" ${state === 'confirm' ? 'selected' : ''}>만남</option>
      <option value="cancel" ${state === 'cancel' ? 'selected' : ''}>취소</option>
    </select>`;
}

/* 비고: 평소엔 취소 사유 텍스트. 진행여부=취소 선택 중인 행만 입력창+변경 버튼으로 바뀜 (동시에 한 곳만 열림) */
function noteCell(m) {
  if (pendingCancelId !== m.id) return m.cancelRs || '';
  const cur = (m.cancelRs || '').replace(/"/g, '&quot;');
  return `
    <div class="sched2-note-edit">
      <input type="text" class="sched2-cancel-input" data-cancel-input="${m.id}" placeholder="취소 사유" value="${cur}">
      <button type="button" class="sched2-apply-btn" data-cancel-apply="${m.id}">변경</button>
    </div>`;
}

/* 시간장소·목표 셀: 수정 중인 행이면 입력칸, 아니면 펼침 가능한 텍스트 셀 */
function editableCell(m, field, labelText) {
  if (editingRowId !== m.id) return expandableCell(m, field, labelText);
  const cur = (m[field] || '').replace(/"/g, '&quot;');
  return `<td data-label="${labelText}"><input type="text" class="sched2-inline-input" data-edit-${field.toLowerCase()}="${m.id}" value="${cur}" placeholder="${labelText}"></td>`;
}

/* 우측 끝 수정 열: 평소엔 "수정"(창출 목록과 동일한 btn-ghost btn-sm), 수정 중인 행만 "변경" 버튼 */
function editCell(m) {
  return editingRowId === m.id
    ? `<td data-label="수정"><button type="button" class="sched2-apply-btn" data-edit-apply="${m.id}">변경</button></td>`
    : `<td data-label="수정"><button type="button" class="btn btn-ghost btn-sm" data-edit-row="${m.id}">수정</button></td>`;
}

/* 첫만남: 만남 카운트가 없는 경우(1회차) / 단계만남: 카운트가 있는 경우(2회차 이상) 모두 */
function section(title, personCol, list) {
  if (!list.length) return '';
  const trs = list.map((m) => `
    <tr data-mid="${m.id}">
      <td data-label="날짜">${dateCell(m)}</td>
      <td data-label="구역">${m.zone || '-'}</td>
      <td data-label="이름">${m.hireName || '-'}</td>
      <td data-label="만남자">${meetPersonLabel(m)}</td>
      <td data-label="${personCol}">${m.gyosa || '-'}</td>
      ${editableCell(m, 'meetCn', '시간장소')}
      ${editableCell(m, 'goal', '목표')}
      <td data-label="피드백">${feedbackBtn(m)}</td>
      <td data-label="진행여부">${progressSelect(m)}</td>
      <td class="sched2-col-goal" data-label="비고">${noteCell(m)}</td>
      ${editCell(m)}
    </tr>`).join('');
  return `
    <div class="sched2-section">
      <div class="sched2-section-title">${title}</div>
      <table class="sched2-table">
        <thead><tr>
          <th>날짜</th><th>구역</th><th>이름</th><th>만남자</th><th>${personCol}</th>
          <th>시간장소</th><th>목표</th><th>피드백</th><th>진행여부</th><th>비고</th><th>수정</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

function render() {
  els.count.textContent = rows.length;

  if (loadFailed && rows.length === 0) {
    els.list.innerHTML = `<div class="error-banner">일정을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div>`;
    return;
  }
  if (rows.length === 0) {
    els.guFilter.innerHTML = '<option value="">전체</option>';
    els.list.innerHTML = '<div class="empty">등록된 만남 일정이 없습니다. 위 + 버튼으로 추가해 보세요.</div>';
    return;
  }

  renderZoneSelect(els.guFilter, rows.map((m) => m.zone), guFilter, (v) => { guFilter = v; render(); });

  const list = visibleRows();

  if (list.length === 0) {
    els.list.innerHTML = '<div class="empty">해당 조건의 만남 일정이 없습니다.</div>';
    return;
  }

  const tIso = todayIso();
  const groups = new Map();
  list.forEach((m) => {
    if (!groups.has(m.meetDt)) groups.set(m.meetDt, []);
    groups.get(m.meetDt).push(m);
  });

  els.list.innerHTML = [...groups.keys()].sort().map((iso) => {
    const list  = groups.get(iso);
    const first = list.filter((m) => m.seq === 1);   // 첫만남: 만남 카운트 없음
    const step  = list.filter((m) => m.seq > 1);     // 단계만남: 만남 카운트 있음(2회차~)
    const { md, dow } = dayLabel(iso);
    return `
      <div class="sched2-daygroup">
        <div class="sched2-datecell${iso === tIso ? ' today' : ''}">${md}${dow ? `<span class="dow">(${dow})</span>` : ''}</div>
        <div class="sched2-body">
          ${section('첫만남', '상담사', first)}
          ${section('단계만남', '교사', step)}
        </div>
      </div>`;
  }).join('');

  bindEvents();
}

function bindEvents() {
  els.list.querySelectorAll('[data-fb]').forEach((btn) => {
    btn.addEventListener('click', () => toggleField(Number(btn.dataset.fb), 'feedbackYn'));
  });
  els.list.querySelectorAll('[data-prog]').forEach((sel) => {
    sel.addEventListener('change', () => handleProgChange(Number(sel.dataset.prog), sel.value));
  });
  els.list.querySelectorAll('[data-cancel-apply]').forEach((btn) => {
    btn.addEventListener('click', () => applyCancel(Number(btn.dataset.cancelApply)));
  });
  els.list.querySelectorAll('[data-date-edit]').forEach((btn) => {
    btn.addEventListener('click', () => { editingDateId = Number(btn.dataset.dateEdit); render(); });
  });
  els.list.querySelectorAll('[data-date-input]').forEach((inp) => {
    inp.addEventListener('change', () => applyDateChange(Number(inp.dataset.dateInput), inp.value));
    inp.addEventListener('blur', () => {
      if (editingDateId === Number(inp.dataset.dateInput)) { editingDateId = null; render(); }
    });
  });
  els.list.querySelectorAll('.sched2-expandable').forEach((td) => {
    td.addEventListener('click', (ev) => {
      ev.stopPropagation();   // 문서 클릭 리스너로 버블링 안 되게(같은 클릭에 바로 접히는 것 방지)
      const key = td.dataset.expandKey;
      expandedCellKey = expandedCellKey === key ? null : key;
      render();
    });
  });
  els.list.querySelectorAll('[data-edit-row]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      editingRowId = Number(btn.dataset.editRow);
      expandedCellKey = null;
      render();
      const first = els.list.querySelector(`[data-edit-meetcn="${editingRowId}"]`);
      if (first) first.focus();
    });
  });
  els.list.querySelectorAll('[data-edit-apply]').forEach((btn) => {
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); applyRowEdit(Number(btn.dataset.editApply)); });
  });
  els.list.querySelectorAll('.sched2-inline-input').forEach((inp) => {
    inp.addEventListener('click', (ev) => ev.stopPropagation());
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); applyRowEdit(editingRowId); }
    });
  });
}

/* 펼쳐진 시간장소/목표 셀 · 수정 중인 행 밖을 클릭하면 원래 상태로 되돌림 */
function bindOutsideClose() {
  document.addEventListener('click', () => {
    let dirty = false;
    if (expandedCellKey !== null) { expandedCellKey = null; dirty = true; }
    if (editingRowId !== null) { editingRowId = null; dirty = true; }
    if (dirty) render();
  });
}

async function toggleField(id, field) {
  const row = rows.find((m) => m.id === id);
  if (!row) return;

  const prev = row[field];
  row[field] = prev === 'Y' ? 'N' : 'Y';
  render();

  try {
    await meetingApi.update(id, { [field]: row[field] });
  } catch (err) {
    row[field] = prev;
    render();
    alert(`저장 실패: ${err.message}`);
  }
}

function handleProgChange(id, value) {
  if (value === 'cancel') {
    pendingCancelId = id;   // 다른 행에서 열려 있던 입력창은 자동으로 닫힘 (전역 변수 하나뿐)
    render();
    return;
  }
  pendingCancelId = null;
  applyProgress(id, value === 'confirm' ? { meetYn: 'Y', cancelRs: '' } : { meetYn: 'N', cancelRs: '' });
}

function applyCancel(id) {
  const input = els.list.querySelector(`[data-cancel-input="${id}"]`);
  const reason = input ? input.value.trim() : '';
  if (!reason) {
    alert('취소 사유를 입력해 주세요.');
    return;
  }
  pendingCancelId = null;
  applyProgress(id, { meetYn: 'N', cancelRs: reason });
}

async function applyProgress(id, patch) {
  const row = rows.find((m) => m.id === id);
  if (!row) return;

  const prev = { meetYn: row.meetYn, cancelRs: row.cancelRs };
  Object.assign(row, patch);
  render();

  try {
    await meetingApi.update(id, patch);
  } catch (err) {
    Object.assign(row, prev);
    render();
    alert(`저장 실패: ${err.message}`);
  }
}

async function applyDateChange(id, value) {
  const row = rows.find((m) => m.id === id);
  if (!row) return;

  const prev = row.meetDt;
  row.meetDt = value;
  editingDateId = null;
  render();

  try {
    await meetingApi.update(id, { meetDt: value });
  } catch (err) {
    row.meetDt = prev;
    render();
    alert(`날짜 저장 실패: ${err.message}`);
  }
}

/* 시간장소·목표 인라인 수정 반영 후 저장 (실패 시 원복) */
async function applyRowEdit(id) {
  const row = rows.find((m) => m.id === id);
  if (!row) return;

  const meetInput = els.list.querySelector(`[data-edit-meetcn="${id}"]`);
  const goalInput = els.list.querySelector(`[data-edit-goal="${id}"]`);
  const patch = {
    meetCn: meetInput ? meetInput.value.trim() : (row.meetCn || ''),
    goal:   goalInput ? goalInput.value.trim() : (row.goal || ''),
  };

  const prev = { meetCn: row.meetCn, goal: row.goal };
  Object.assign(row, patch);
  editingRowId = null;
  render();

  try {
    await meetingApi.update(id, patch);
  } catch (err) {
    Object.assign(row, prev);
    render();
    alert(`저장 실패: ${err.message}`);
  }
}

/* ── 만남 추가 폼 ── */
function fillPeople() {
  els.person.innerHTML =
    '<option value="">선택</option>' +
    people.map((p) => `<option value="${p.id}">${p.name}${p.zone ? ` (${p.zone}구역)` : ''}</option>`).join('');
}

async function refreshPeople() {
  try {
    const outreach = await outreachApi.list();
    people = outreach.filter((p) => p.prg !== '중단');
    fillPeople();
  } catch {
    /* 유지 */
  }
}

function resetForm() {
  els.person.value = '';
  els.date.value   = '';
  els.place.value  = '';
  els.goal.value   = '';
  els.error.classList.remove('show');
}

async function loadSchedule() {
  rows = await meetingApi.schedule({ from: els.rangeFrom.value, to: els.rangeTo.value });
}

/* 첫만남(1회차)에 날짜가 잡혀 있어야 다음 만남을 추가할 수 있음 */
function hasDatedFirstMeeting(hireId) {
  return rows.some((m) => m.hireId === hireId && m.seq === 1 && m.meetDt);
}

async function handleSave() {
  const hireId = Number(els.person.value);
  const meetDt = els.date.value;

  if (!hireId || !meetDt) {
    els.error.textContent = '대상자와 날짜는 필수 입력입니다.';
    els.error.classList.add('show');
    return;
  }
  if (!hasDatedFirstMeeting(hireId)) {
    els.error.textContent = '첫만남 일정이 아직 없는 대상자입니다. 수정이 필요하면 아래 표에서 첫만남 일정의 날짜를 먼저 입력해 주세요.';
    els.error.classList.add('show');
    return;
  }
  els.error.classList.remove('show');

  const input = {
    meetDt,
    meetCn: els.place.value.trim() || null,
    goal:   els.goal.value.trim() || null,
  };

  els.saveBtn.disabled = true;
  try {
    await meetingApi.create(hireId, input);
    await loadSchedule();   // 방금 만든 행에 이름·구역 등 조인 정보를 채우기 위해 다시 조회
    loadFailed = false;
  } catch (err) {
    els.error.textContent = `저장 실패: ${err.message}`;
    els.error.classList.add('show');
    els.saveBtn.disabled = false;
    return;
  }
  els.saveBtn.disabled = false;

  resetForm();
  els.form.classList.remove('open');
  render();
}

/* 탭을 다시 열 때마다 호출 — 목록을 최신 상태로 재조회 */
export async function reloadSchedule() {
  pendingCancelId = null;
  editingDateId = null;
  editingRowId = null;
  expandedCellKey = null;
  try {
    await loadSchedule();
    loadFailed = false;
  } catch {
    loadFailed = true;
    rows = [];
  }
  render();
}

export async function initScheduleTab() {
  cacheEls();
  bindOutsideClose();

  els.toggleBtn.addEventListener('click', () => {
    const opening = !els.form.classList.contains('open');
    els.form.classList.toggle('open', opening);
    if (opening) refreshPeople();
    else resetForm();
  });
  els.cancelBtn.addEventListener('click', () => { els.form.classList.remove('open'); resetForm(); });
  els.saveBtn.addEventListener('click', handleSave);

  // 검색: 날짜 범위 재조회 + 이름 필터 (버튼 하나로 통일)
  const search = () => { nameQuery = els.search.value; reloadSchedule(); };
  document.getElementById('schedule-search-btn').addEventListener('click', search);
  [els.search, els.rangeFrom, els.rangeTo].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  });

  // 초기화: 날짜 · 이름 · 구역 필터 전부 비우고 재조회
  document.getElementById('schedule-reset-btn').addEventListener('click', () => {
    els.rangeFrom.value = '';
    els.rangeTo.value = '';
    els.search.value = '';
    nameQuery = '';
    guFilter = '';
    reloadSchedule();
  });

  els.list.innerHTML = '<div class="loading">불러오는 중…</div>';
  await reloadSchedule();
}
