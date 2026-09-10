import { outreachApi, memberApi } from '../core/api.js';
import { renderZoneSelect, zoneMatch } from '../core/zone.js';
import { nameMatch, taCode, TA_LABEL } from '../core/format.js';
import { optimistic } from '../core/dom.js';

export const TEMPLATE = `
    <div class="panel-head">
      <div class="panel-head-left">
        <div class="panel-head-title">
          <h2>창출 목록</h2>
        </div>
        <select class="filter-select panel-head-zone" id="outreach-gu-filter"></select>
      </div>
      <div class="panel-head-right">
        <div class="panel-head-tools">
          <div class="seg-group" id="outreach-prg-filter">
            <button type="button" class="seg-btn on" data-prg-filter="all">전체</button>
            <button type="button" class="seg-btn" data-prg-filter="none">미정</button>
            <button type="button" class="seg-btn" data-prg-filter="going">진행</button>
            <button type="button" class="seg-btn" data-prg-filter="cancel">중단</button>
          </div>
          <input type="text" class="filter-search" id="outreach-search" placeholder="이름" autocomplete="off">
          <button type="button" class="btn btn-ghost btn-sm" id="outreach-search-btn">검색</button>
        </div>
        <button class="btn btn-primary" id="toggle-outreach-form"><span class="btn-plus">+</span> 섭외자 추가</button>
      </div>
    </div>

    <div class="add-form" id="outreach-form">
      <div class="form-grid cols-2">
        <div class="span-2 of-first-row">
          <div class="of-ff">
            <label class="req">이름</label>
            <input type="text" id="of-name" placeholder="예: 최미슬">
          </div>
          <div class="of-ff" data-jiin-hide>
            <label>티엠자</label>
            <input type="text" id="of-tm-name" placeholder="예: 김상담">
          </div>
          <div class="of-ff" data-jiin-show hidden>
            <label>인도자</label>
            <input type="text" id="of-indo" placeholder="예: 김인도">
          </div>
          <div class="of-ff" data-jiin-show hidden>
            <label>교사</label>
            <input type="text" id="of-gyosa" placeholder="예: 박교사">
          </div>
        </div>
        <div class="span-2 of-zone-row">
          <div class="of-ff of-ff-auto">
            <label class="req">구역1</label>
            <div class="seg-group" id="of-in-gu-seg"></div>
          </div>
          <label class="of-jiin"><input type="checkbox" id="of-jiin"> 지인</label>
          <div class="of-ff of-ff-auto">
            <label>구역2</label>
            <div class="seg-group" id="of-gyo-gu-seg"></div>
          </div>
        </div>
        <div>
          <label class="req">날짜</label>
          <input type="date" id="of-meet-date">
        </div>
        <div>
          <label>시간 · 장소</label>
          <input type="text" id="of-meet" placeholder="예: 15:00 상무역 스타벅스">
        </div>
      </div>
      <div class="form-error" id="outreach-error"></div>
      <div class="form-actions">
        <button class="btn btn-ghost" id="cancel-outreach">취소</button>
        <button class="btn btn-primary" id="save-outreach">저장</button>
        <button class="btn btn-ghost" id="reset-outreach" title="인도 구역을 제외한 모든 입력값을 비웁니다">초기화</button>
      </div>
    </div>

    <div id="outreach-groups" class="panel-list"></div>
`;

let entries = [];
let teachers = [];   // 구역관리(CHOIMEMBER) 중 상담사(TA=1)·교사(TA=2) — 교사 인원 선택 목록
let loadFailed = false;
let prgFilter = 'all';   // all | none(미정) | going(진행) | cancel(취소)
let guFilter  = '';       // '' = 전체 구역
let nameQuery = '';

// 필터 키 -> CHOIHIRE.PRG 값
const PRG_FILTER_VALUE = { none: '', going: '진행', cancel: '중단' };
const PRG_FILTER_LABEL = { all: '섭외', none: '미정', going: '진행', cancel: '중단' };

const els = {};

function cacheEls() {
  els.groups     = document.getElementById('outreach-groups');
  els.count      = document.getElementById('count-outreach');
  els.form       = document.getElementById('outreach-form');
  els.toggleBtn  = document.getElementById('toggle-outreach-form');
  els.cancelBtn  = document.getElementById('cancel-outreach');
  els.saveBtn    = document.getElementById('save-outreach');
  els.resetBtn   = document.getElementById('reset-outreach');
  els.error      = document.getElementById('outreach-error');
  els.name       = document.getElementById('of-name');
  els.tmName     = document.getElementById('of-tm-name');
  els.jiin       = document.getElementById('of-jiin');
  els.indo       = document.getElementById('of-indo');
  els.gyosa      = document.getElementById('of-gyosa');
  els.inGuSeg    = document.getElementById('of-in-gu-seg');
  els.gyoGuSeg   = document.getElementById('of-gyo-gu-seg');
  els.meet       = document.getElementById('of-meet');
  els.meetDateInput  = document.getElementById('of-meet-date');
  els.prgFilter  = document.getElementById('outreach-prg-filter');
  els.guFilter   = document.getElementById('outreach-gu-filter');
  els.search     = document.getElementById('outreach-search');
  els.searchBtn  = document.getElementById('outreach-search-btn');
}

/* 표시구역: 섬김구역 있으면 인도구역+섬김구역, 없으면 인도구역+교사구역 */
function computeZone(e) {
  const has = (v) => v !== '' && v != null;
  const inGu = has(e.inGu) ? String(e.inGu) : '';
  if (has(e.sumGu)) return [inGu, String(e.sumGu)].filter(Boolean).join('+');
  if (has(e.gyoGu)) return [inGu, String(e.gyoGu)].filter(Boolean).join('+');
  return inGu;
}

/* 섭외자 추가 폼의 구역 선택(1~7 버튼) 상태 */
const formZone = { inGu: '', gyoGu: '' };

function buildZoneSeg(container, key) {
  container.innerHTML = Array.from({ length: 7 }, (_, i) => i + 1)
    .map((n) => `<button type="button" class="seg-btn" data-z="${n}">${n}</button>`)
    .join('');
  container.querySelectorAll('[data-z]').forEach((btn) => {
    btn.addEventListener('click', () => {
      formZone[key] = formZone[key] === btn.dataset.z ? '' : btn.dataset.z;
      container.querySelectorAll('.seg-btn').forEach((b) => {
        b.classList.toggle('on', b.dataset.z === formZone[key]);
      });
    });
  });
}

/* 지인 체크: 첫 줄만 이름/티엠자 ↔ 이름/인도자/교사 로 전환 (2행부터는 그대로) */
function applyJiinMode(on) {
  els.form.querySelectorAll('[data-jiin-hide]').forEach((el) => { el.hidden = on; });
  els.form.querySelectorAll('[data-jiin-show]').forEach((el) => { el.hidden = !on; });
}

function clearZoneSeg() {
  formZone.inGu = '';
  formZone.gyoGu = '';
  [els.inGuSeg, els.gyoGuSeg].forEach((c) => {
    c?.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('on'));
  });
}

function tmBtn(id, field, val, label) {
  const on = val === 'Y';
  return `<button type="button" class="tm-btn ${on ? 'on' : ''}" data-tm="${id}" data-tm-field="${field}">${label}</button>`;
}

const PRG_OPTIONS = [['', '미정'], ['진행', '진행'], ['중단', '중단']];

function prgClass(val) {
  if (val === '진행') return 'prg-going';
  if (val === '중단') return 'prg-stopped';
  return '';
}

function prgSelect(id, val) {
  const cur = val || '';
  return `<select class="prg-select ${prgClass(cur)}" data-prg="${id}">${
    PRG_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')
  }</select>`;
}

export const STATUS_OPTIONS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', '장기'];

function statusSelect(id, val) {
  const cur = val || '';
  return `<select class="status-select" data-status="${id}">${
    STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === cur ? 'selected' : ''}>${s}</option>`).join('')
  }</select>`;
}

/* S5/S6일 때만 상태 셀렉트 우측에 센터(CT, 정수) 입력창 노출 */
function ctInput(e) {
  if (e.status !== 'S5' && e.status !== 'S6') return '';
  const cur = e.ct !== '' && e.ct != null ? e.ct : '';
  return `
    <span class="ct-inline">
      <span class="ct-label">센터:</span>
      <input type="number" class="ct-input" data-ct-input="${e.id}" value="${cur}">
      <button type="button" class="btn btn-ghost btn-sm" data-ct-confirm="${e.id}">확인</button>
    </span>`;
}

const ROLES = [
  ['inGu', 'indo',    '인도'],
  ['sumGu', 'seomgim', '섬김'],
  ['gyoGu', 'gyosa',   '교사'],
];

/* 교사 이름은 구역관리에 등록된 교사(TA='Y') 중에서 select. 그 외 역할은 자유 입력. */
function pfNameField(nameKey, label, val) {
  if (nameKey !== 'gyosa') {
    return `<input type="text" class="pf-name" placeholder="${label}자 이름" data-pf="${nameKey}" value="${val ?? ''}">`;
  }
  const cur = val ?? '';
  const seen = new Set();
  const opts = [`<option value=""${cur === '' ? ' selected' : ''}>(교사 선택)</option>`];
  teachers.forEach((t) => {
    if (seen.has(t.NAME)) return;
    seen.add(t.NAME);
    opts.push(`<option value="${t.NAME}"${t.NAME === cur ? ' selected' : ''}>${t.NAME} (${TA_LABEL[taCode(t.TA)]})</option>`);
  });
  // 기존 값이 목록에 없으면(과거 자유 입력) 옵션으로 살려둠
  if (cur && !seen.has(cur)) {
    opts.push(`<option value="${cur}" selected>${cur} (미등록)</option>`);
  }
  return `<select class="pf-name" data-pf="gyosa">${opts.join('')}</select>`;
}

function personForm(e) {
  const rows = ROLES.map(([guKey, nameKey, label]) => `
    <div class="pf-row">
      <span class="pf-role">${label}</span>
      <input type="number" class="pf-gu" min="1" placeholder="구역" data-pf="${guKey}" value="${e[guKey] ?? ''}">
      ${pfNameField(nameKey, label, e[nameKey])}
    </div>`).join('');
  const meetVal = String(e.meetCn ?? '').replace(/"/g, '&quot;');
  return `
    <div class="person-form" id="person-form-${e.id}" style="display:none;">
      ${rows}
      <div class="pf-row">
        <span class="pf-role">시간·장소</span>
        <input type="text" class="pf-name" placeholder="예: 15:00 상무역 스타벅스" data-pf="meetCn" value="${meetVal}">
      </div>
      <div class="pf-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-person-reset="${e.id}" title="인도 구역을 제외한 모든 입력값을 비웁니다">초기화</button>
        <button type="button" class="btn btn-primary btn-sm" style="justify-content:center;" data-person-save="${e.id}">저장</button>
      </div>
    </div>`;
}

function personSummary(e) {
  const parts = ROLES
    .filter(([, nameKey]) => e[nameKey])
    .map(([guKey, nameKey, label]) => `${label} ${e[nameKey]}${e[guKey] ? `(${e[guKey]})` : ''}`);
  return parts.length ? `<span class="meta-inline">${parts.join(' · ')}</span>` : '';
}

/* 진행 상태 카드용: 인:이름(구역) 섬:이름(구역) 교:이름(구역) */
const ROLE_ABBR = { 인도: '인', 섬김: '섬', 교사: '교' };
function personSummaryShort(e) {
  return ROLES
    .map(([guKey, nameKey, label]) => {
      const name = e[nameKey];
      if (!name) return '';
      return `<span class="person-tag">${ROLE_ABBR[label]}:${name}${e[guKey] ? `(${e[guKey]})` : ''}</span>`;
    })
    .join('');
}

function render() {
  els.count.textContent = entries.length;

  if (loadFailed && entries.length === 0) {
    els.groups.innerHTML = `<div class="error-banner">섭외 목록을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div>`;
    return;
  }
  if (entries.length === 0) {
    els.guFilter.innerHTML = '<option value="">전체</option>';
    els.groups.innerHTML = '<div class="empty">등록된 섭외 기록이 없습니다. 위 + 버튼으로 추가해 보세요.</div>';
    return;
  }

  renderZoneSelect(els.guFilter, entries.map((e) => e.zone || computeZone(e)), guFilter,
    (v) => { guFilter = v; render(); });

  const prgList = prgFilter === 'all'
    ? entries
    : entries.filter((e) => (e.prg || '') === PRG_FILTER_VALUE[prgFilter]);
  const list = prgList.filter((e) =>
    zoneMatch(e.zone || computeZone(e), guFilter) && nameMatch(e.name, nameQuery));

  if (list.length === 0) {
    const msg = (guFilter || nameQuery.trim())
      ? '해당 조건의 섭외자가 없습니다.'
      : `${PRG_FILTER_LABEL[prgFilter]} 상태 섭외자가 없습니다.`;
    els.groups.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }

  els.groups.innerHTML = list.map((e) => {
    const zoneText = e.zone || computeZone(e);

    const meetParts = (e.meetCn || '').split('|').map((s) => s.trim()).filter(Boolean);
    const meets = meetParts.length
      ? meetParts.map((m) => `<span class="meet-inline">📍 ${[e.meetDate, m].filter(Boolean).join(' ')}</span>`).join('')
      : (e.meetDate ? `<span class="meet-inline">📍 ${e.meetDate}</span>` : '');

    const going = e.prg === '진행';
    const tmButtons = going ? '' : `
            ${tmBtn(e.id, 'tm1', e.tm1, '1차')}
            ${tmBtn(e.id, 'tm2', e.tm2, '2차')}
            ${tmBtn(e.id, 'tm3', e.tm3, '3차')}`;

    return `
      <div class="entry-card${going ? ' going' : ''}" data-id="${e.id}">
        <div class="entry-zone">${zoneText || '-'}</div>
        <div class="entry-main">
          <div class="em-a">
            <span class="name">${e.name}</span>
            ${meets}
          </div>
          <div class="em-b">
            ${going ? personSummaryShort(e) : `<span class="tm-badges">${tmButtons}</span>`}
          </div>
          <div class="em-c">
            ${prgSelect(e.id, e.prg)}
            ${statusSelect(e.id, e.status)}
          </div>
          <div class="em-d">${ctInput(e)}</div>
        </div>
        <div class="add-meet-wrap">
          <button class="btn btn-ghost btn-sm" data-person-toggle="${e.id}">수정</button>
          ${going ? '' : `<button class="btn btn-ghost btn-sm" data-remove="${e.id}">제외</button>`}
        </div>
        ${personForm(e)}
      </div>`;
  }).join('');

  els.groups.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => handleRemove(Number(btn.dataset.remove)));
  });

  els.groups.querySelectorAll('[data-person-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(`person-form-${btn.dataset.personToggle}`);
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
  });

  els.groups.querySelectorAll('[data-person-save]').forEach((btn) => {
    btn.addEventListener('click', () => handlePersonSave(Number(btn.dataset.personSave)));
  });

  els.groups.querySelectorAll('[data-person-reset]').forEach((btn) => {
    btn.addEventListener('click', () => handlePersonReset(Number(btn.dataset.personReset)));
  });

  // 교사 select 변경 시 같은 줄 "교사 구역" 칸을 그 교사의 등록 구역으로 채움
  els.groups.querySelectorAll('select[data-pf="gyosa"]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const t = teachers.find((x) => x.NAME === sel.value);
      const guInput = sel.closest('.pf-row')?.querySelector('.pf-gu[data-pf="gyoGu"]');
      if (t && guInput && t.GU != null && t.GU !== '') guInput.value = t.GU;
    });
  });

  els.groups.querySelectorAll('[data-tm]').forEach((btn) => {
    btn.addEventListener('click', () => handleTmToggle(Number(btn.dataset.tm), btn.dataset.tmField));
  });

  els.groups.querySelectorAll('[data-prg]').forEach((sel) => {
    sel.addEventListener('change', () => {
      sel.classList.remove('prg-going', 'prg-stopped');
      const cls = prgClass(sel.value);
      if (cls) sel.classList.add(cls);
      handlePrgChange(Number(sel.dataset.prg), sel.value);
    });
  });

  els.groups.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', () => handleStatusChange(Number(sel.dataset.status), sel.value));
  });

  els.groups.querySelectorAll('[data-ct-confirm]').forEach((btn) => {
    btn.addEventListener('click', () => handleCtSave(Number(btn.dataset.ctConfirm)));
  });
}

/* 초기화 버튼: 인도 구역(inGu)은 남기고 수정 패널 입력값만 비움 (저장 전 미반영 상태) */
function handlePersonReset(id) {
  const form = document.getElementById(`person-form-${id}`);
  if (!form) return;
  form.querySelectorAll('[data-pf]').forEach((el) => {
    if (el.dataset.pf !== 'inGu') el.value = '';
  });
}

async function handlePersonSave(id) {
  const form = document.getElementById(`person-form-${id}`);
  const entry = entries.find((e) => e.id === id);
  if (!form || !entry) return;

  const patch = {};
  form.querySelectorAll('[data-pf]').forEach((el) => { patch[el.dataset.pf] = el.value.trim(); });

  const prev = { ...entry };
  await optimistic({
    apply: () => { Object.assign(entry, patch); entry.zone = computeZone(entry); },
    revert: () => Object.assign(entry, prev),
    render,
    call: () => outreachApi.update(id, patch),
    onError: (msg) => alert(`인원 설정 저장 실패: ${msg}`),
  });
}

async function handleStatusChange(id, value) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const prev = entry.status;
  await optimistic({
    apply: () => { entry.status = value; },
    revert: () => { entry.status = prev; },
    render,   // S5/S6 전환 시 센터(CT) 입력창이 나타나도록: 성공 후에만 다시 그림
    call: () => outreachApi.update(id, { status: value }),
    onError: (msg) => alert(`상태(S) 저장 실패: ${msg}`),
    eager: false,
  });
}

async function handleCtSave(id) {
  const input = els.groups.querySelector(`[data-ct-input="${id}"]`);
  const entry = entries.find((e) => e.id === id);
  if (!input || !entry) return;

  const raw = input.value.trim();
  if (raw !== '' && !Number.isInteger(Number(raw))) {
    alert('센터는 정수로 입력해 주세요.');
    return;
  }

  const prev = entry.ct;
  await optimistic({
    apply: () => { entry.ct = raw; },
    revert: () => { entry.ct = prev; },
    render,
    call: () => outreachApi.update(id, { ct: raw }),
    onError: (msg) => alert(`센터 저장 실패: ${msg}`),
  });
}

async function handlePrgChange(id, value) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const prev = entry.prg;
  entry.prg = value;

  try {
    await outreachApi.update(id, { prg: value });
    // 선택/진행 전환 시 카드 구성(1·2·3차 ↔ 인/섬/교)이 바뀌므로 다시 그림.
    // 중단은 레이아웃 변화가 없어 기존과 동일하게 다시 그리지 않음.
    if (value !== '중단') render();
  } catch (err) {
    entry.prg = prev;
    render();
    alert(`상태 저장 실패: ${err.message}`);
  }
}

async function handleTmToggle(id, field) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const prev = entry[field];
  const next = prev === 'Y' ? 'N' : 'Y';
  await optimistic({
    apply: () => { entry[field] = next; },
    revert: () => { entry[field] = prev; },
    render,
    call: () => outreachApi.update(id, { [field]: next }),
    onError: (msg) => alert(`${field.replace('tm', '')}차 점검 저장 실패: ${msg}`),
  });
}

async function handleRemove(id) {
  if (!confirm('이 섭외자를 목록에서 제외하시겠습니까?')) return;
  const prev = entries;
  await optimistic({
    apply: () => { entries = entries.filter((e) => e.id !== id); },
    revert: () => { entries = prev; },
    render,
    call: () => outreachApi.remove(id),
    onError: (msg) => alert(`삭제 실패: ${msg}`),
  });
}

function resetForm() {
  els.name.value = '';
  els.tmName.value = '';
  els.indo.value = '';
  els.gyosa.value = '';
  els.jiin.checked = false;
  applyJiinMode(false);
  els.meet.value = '';
  els.meetDateInput.value = '';
  clearZoneSeg();
  els.error.classList.remove('show');
}

/* 초기화 버튼: 인도 구역(구역1)은 남기고 나머지 입력값만 비움 */
function clearFormExceptInGu() {
  els.name.value = '';
  els.tmName.value = '';
  els.indo.value = '';
  els.gyosa.value = '';
  els.jiin.checked = false;
  applyJiinMode(false);
  els.meet.value = '';
  els.meetDateInput.value = '';
  formZone.gyoGu = '';
  els.gyoGuSeg?.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('on'));
  els.error.classList.remove('show');
}

async function handleSave() {
  const name     = els.name.value.trim();
  const inGu     = formZone.inGu;
  const meetDate = els.meetDateInput.value;

  // 날짜를 비워두면 첫만남에 날짜가 없는 채로 등록돼서, 나중에 "다음 만남 추가" 제약에 무조건 걸림 → 등록 시점에 필수로 막음
  if (!name || !inGu || !meetDate) {
    els.error.textContent = '이름 · 구역1 · 날짜는 필수 입력입니다.';
    els.error.classList.add('show');
    return;
  }
  els.error.classList.remove('show');

  const input = {
    name,
    inGu,
    gyoGu:    formZone.gyoGu || null,
    meetDate,
    meetCn:   els.meet.value.trim() || null,
  };
  if (els.jiin.checked) {
    // 지인: 첫 줄이 이름/인도자/교사 → name/indo/gyosa 로 저장
    input.indo  = els.indo.value.trim() || null;
    input.gyosa = els.gyosa.value.trim() || null;
  } else {
    input.tmName = els.tmName.value.trim() || null;
  }

  els.saveBtn.disabled = true;
  try {
    const created = await outreachApi.create(input);
    entries.unshift(created);
  } catch (err) {
    entries.unshift({ id: Date.now(), zone: computeZone(input), ...input });
    els.error.textContent = `저장은 로컬에만 반영됐습니다 (API 오류: ${err.message})`;
    els.error.classList.add('show');
  } finally {
    els.saveBtn.disabled = false;
  }

  resetForm();
  els.form.classList.remove('open');
  render();
}

export async function initOutreachTab() {
  cacheEls();

  buildZoneSeg(els.inGuSeg, 'inGu');
  buildZoneSeg(els.gyoGuSeg, 'gyoGu');

  els.jiin.addEventListener('change', () => applyJiinMode(els.jiin.checked));

  els.toggleBtn.addEventListener('click', () => {
    const opening = !els.form.classList.contains('open');
    els.form.classList.toggle('open', opening);
    if (!opening) resetForm();
  });

  els.prgFilter.querySelectorAll('[data-prg-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      prgFilter = btn.dataset.prgFilter;
      els.prgFilter.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b === btn));
      render();
    });
  });
  els.cancelBtn.addEventListener('click', () => { els.form.classList.remove('open'); resetForm(); });
  els.saveBtn.addEventListener('click', handleSave);
  els.resetBtn.addEventListener('click', clearFormExceptInGu);

  const applySearch = () => { nameQuery = els.search.value; render(); };
  els.searchBtn.addEventListener('click', applySearch);
  els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') applySearch(); });

  els.groups.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    entries    = await outreachApi.list();
    loadFailed = false;
  } catch {
    loadFailed = true;
    entries    = [];
  }
  // 교사 선택 목록: 구역관리의 상담사(1)·교사(2). 실패해도 나머지는 정상 동작.
  try {
    teachers = (await memberApi.list())
      .filter((m) => taCode(m.TA) >= 1)
      .sort((a, b) => (taCode(b.TA) - taCode(a.TA)) || (Number(a.GU) - Number(b.GU)) || String(a.NAME).localeCompare(b.NAME));
  } catch {
    teachers = [];
  }
  render();
}
