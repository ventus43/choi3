import { memberApi } from '../api.js';
import { taCode } from '../utils.js';

let entries   = [];
let editingId = null;   // 현재 인라인 수정 중인 NTT_ID
let loadFailed = false;
let guFilter   = '';    // 선택된 구역('' = 전체)

const els = {};

function cacheEls() {
  els.body        = document.getElementById('member-body');
  els.count       = document.getElementById('count-member');
  els.filteredCnt = document.getElementById('member-filtered-count');
  els.form        = document.getElementById('member-form');
  els.toggleBtn   = document.getElementById('toggle-member-form');
  els.cancelBtn   = document.getElementById('cancel-member');
  els.saveBtn     = document.getElementById('save-member');
  els.error       = document.getElementById('member-error');
  els.fGu         = document.getElementById('mf-gu');
  els.fName       = document.getElementById('mf-name');
  els.fTa         = document.getElementById('mf-ta');
  els.fMission    = document.getElementById('mf-mission');
  els.segGu       = document.getElementById('member-seg-gu');
}

/* ── 필터 (구역만) ── */
function filtered() {
  return entries.filter((m) => !guFilter || String(m.GU) === guFilter);
}

function buildGuButtons() {
  const gus = [...new Set(entries.map((m) => m.GU).filter((v) => v != null && v !== ''))]
    .sort((a, b) => a - b);
  const mk = (val, label) =>
    `<button type="button" class="seg-btn ${guFilter === val ? 'on' : ''}" data-gu="${val}">${label}</button>`;
  els.segGu.innerHTML = mk('', '전체') + gus.map((g) => mk(String(g), String(g))).join('');
  els.segGu.querySelectorAll('[data-gu]').forEach((btn) => {
    btn.addEventListener('click', () => { guFilter = btn.dataset.gu; render(); });
  });
}

/* ── 렌더 ── */
function badge(val, type) {
  if (val === 'Y') {
    return type === 'ta'
      ? `<span class="badge badge-ta">교사</span>`
      : `<span class="badge badge-mission">사명</span>`;
  }
  return `<span class="badge badge-none">-</span>`;
}

/* TA: 0=일반 / 1=상담사 / 2=교사 */
function taBadge(val) {
  const c = taCode(val);
  if (c === 2) return `<span class="badge badge-ta">교사</span>`;
  if (c === 1) return `<span class="badge badge-counsel">상담사</span>`;
  return `<span class="badge badge-none">일반</span>`;
}

function render() {
  els.count.textContent = entries.length;

  if (loadFailed && entries.length === 0) {
    els.body.innerHTML = `<tr><td colspan="6"><div class="error-banner">멤버 목록을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div></td></tr>`;
    return;
  }

  buildGuButtons();
  const list = filtered();
  els.filteredCnt.textContent = entries.length !== list.length ? `${list.length} / ${entries.length}명` : `${list.length}명`;

  if (list.length === 0) {
    els.body.innerHTML = `<tr><td colspan="6"><div class="empty">해당 조건의 멤버가 없습니다.</div></td></tr>`;
    return;
  }

  els.body.innerHTML = list.map((m) => {
    if (editingId === m.NTT_ID) return editRow(m);
    return `
      <tr data-id="${m.NTT_ID}">
        <td>${m.GU ?? '-'}</td>
        <td><strong>${m.NAME ?? ''}</strong></td>
        <td>${taBadge(m.TA)}</td>
        <td>${badge(m.ISMISSION, 'mission')}</td>
        <td><button class="btn-icon confirm" data-edit="${m.NTT_ID}" title="수정">✏️</button></td>
        <td><button class="btn-icon danger"  data-del="${m.NTT_ID}"  title="삭제">✕</button></td>
      </tr>`;
  }).join('');

  bindRowEvents();
}

function editRow(m) {
  return `
    <tr data-id="${m.NTT_ID}" class="editing-row">
      <td class="edit-cell"><input type="number" data-field="GU" value="${m.GU ?? ''}" min="1" style="width:60px"></td>
      <td class="edit-cell"><input type="text"   data-field="NAME" value="${m.NAME ?? ''}" maxlength="20"></td>
      <td class="edit-cell">
        <select data-field="TA">
          <option value="0" ${taCode(m.TA) === 0 ? 'selected' : ''}>일반</option>
          <option value="1" ${taCode(m.TA) === 1 ? 'selected' : ''}>상담사</option>
          <option value="2" ${taCode(m.TA) === 2 ? 'selected' : ''}>교사</option>
        </select>
      </td>
      <td class="edit-cell">
        <select data-field="ISMISSION">
          <option value="N" ${(m.ISMISSION || 'N') === 'N' ? 'selected' : ''}>없음</option>
          <option value="Y" ${m.ISMISSION === 'Y' ? 'selected' : ''}>사명</option>
        </select>
      </td>
      <td><button class="btn-icon confirm" data-save-edit="${m.NTT_ID}" title="저장">✔</button></td>
      <td><button class="btn-icon" data-cancel-edit title="취소">✕</button></td>
    </tr>`;
}

function bindRowEvents() {
  els.body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => { editingId = Number(btn.dataset.edit); render(); });
  });

  els.body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => handleRemove(Number(btn.dataset.del)));
  });

  els.body.querySelectorAll('[data-save-edit]').forEach((btn) => {
    btn.addEventListener('click', () => handleSaveEdit(Number(btn.dataset.saveEdit)));
  });

  els.body.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', () => { editingId = null; render(); });
  });
}

/* ── CRUD ── */
async function handleRemove(id) {
  if (!confirm(`ID ${id} 멤버를 삭제하시겠습니까?`)) return;
  const prev = entries;
  entries = entries.filter((m) => m.NTT_ID !== id);
  render();
  try {
    await memberApi.remove(id);
  } catch (err) {
    entries = prev;
    render();
    alert(`삭제 실패: ${err.message}`);
  }
}

async function handleSaveEdit(id) {
  const row   = els.body.querySelector(`tr[data-id="${id}"]`);
  const patch = {};
  row.querySelectorAll('[data-field]').forEach((el) => {
    patch[el.dataset.field] = el.tagName === 'INPUT'
      ? (el.type === 'number' ? Number(el.value) : el.value.trim())
      : el.value;
  });

  if ('TA' in patch) patch.TA = Number(patch.TA);

  const entry = entries.find((m) => m.NTT_ID === id);
  if (!entry) return;

  const prev = { ...entry };
  Object.assign(entry, patch);
  editingId = null;
  render();

  try {
    await memberApi.update(id, patch);
  } catch (err) {
    Object.assign(entry, prev);
    editingId = id;
    render();
    alert(`수정 실패: ${err.message}`);
  }
}

/* ── 추가 폼 ── */
function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.add('show');
}

function resetForm() {
  [els.fGu, els.fName].forEach((el) => (el.value = ''));
  els.fTa.value      = '0';
  els.fMission.value = 'N';
  els.error.classList.remove('show');
  els.saveBtn.dataset.mode = 'create';
}

async function handleSave() {
  const gu   = Number(els.fGu.value);
  const name = els.fName.value.trim();

  if (!name) {
    showError('이름은 필수 입력입니다.');
    return;
  }

  els.error.classList.remove('show');
  els.saveBtn.disabled = true;

  // NTT_ID 는 서버(DB)에서 채번 — 여기선 안 보냄
  const input = { GU: gu || null, NAME: name, TA: Number(els.fTa.value), ISMISSION: els.fMission.value };

  try {
    const created = await memberApi.create(input);
    entries.push(created);
  } catch (err) {
    showError(`저장 실패 (API 오류: ${err.message})`);
    els.saveBtn.disabled = false;
    return;
  }
  els.saveBtn.disabled = false;

  resetForm();
  els.form.classList.remove('open');
  render();
}

/* ── 초기화 ── */
export async function initMemberTab() {
  cacheEls();

  els.toggleBtn.addEventListener('click', () => {
    resetForm();
    els.form.classList.add('open');
  });
  els.cancelBtn.addEventListener('click', () => {
    els.form.classList.remove('open');
    resetForm();
  });
  els.saveBtn.addEventListener('click', handleSave);

  els.body.innerHTML = `<tr><td colspan="6"><div class="loading">불러오는 중…</div></td></tr>`;
  try {
    entries    = await memberApi.list();
    loadFailed = false;
  } catch {
    loadFailed = true;
    entries    = [];
  }
  render();
}
