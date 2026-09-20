import { checklistApi } from '../core/api.js';

export const TEMPLATE = `
    <div class="panel-head">
      <div>
        <h2>사명 체크리스트</h2>
        <p>사명자(ISMISSION=Y) 요일별 체크 현황입니다. 개인은 이름 조회 페이지에서 확인만 가능하고, 체크는 여기서만 합니다.</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="checklist-close-week">이번 주 마감</button>
    </div>

    <div class="checklist-items-form" id="checklist-items-form">
      <label>체크 항목 (5개)</label>
      <div class="checklist-items-grid">
        <input type="text" data-item-seq="1" maxlength="20" placeholder="항목 1">
        <input type="text" data-item-seq="2" maxlength="20" placeholder="항목 2">
        <input type="text" data-item-seq="3" maxlength="20" placeholder="항목 3">
        <input type="text" data-item-seq="4" maxlength="20" placeholder="항목 4">
        <input type="text" data-item-seq="5" maxlength="20" placeholder="항목 5">
        <button type="button" class="btn btn-primary btn-sm" id="checklist-save-items">항목 저장</button>
      </div>
    </div>

    <div class="checklist-table-wrap">
      <table id="checklist-table">
        <thead>
          <tr>
            <th>구역</th><th>이름</th>
            <th class="checklist-item-head" data-item-seq="1"></th>
            <th class="checklist-item-head" data-item-seq="2"></th>
            <th class="checklist-item-head" data-item-seq="3"></th>
            <th class="checklist-item-head" data-item-seq="4"></th>
            <th class="checklist-item-head" data-item-seq="5"></th>
          </tr>
        </thead>
        <tbody id="checklist-body"></tbody>
      </table>
    </div>
`;

const ITEM_SEQS = [1, 2, 3, 4, 5];
const DOWS = [1, 2, 3, 4, 5, 6, 7];
const DOW_LABEL = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };

let members = [];
let items = [];          // [{SEQ, LABEL}]
let state = new Map();   // `${NTT_ID}|${DOW}|${ITEM_SEQ}` -> 'Y'|'N'
let loadFailed = false;

const els = {};

function cacheEls() {
  els.body      = document.getElementById('checklist-body');
  els.itemForm  = document.getElementById('checklist-items-form');
  els.saveItems = document.getElementById('checklist-save-items');
  els.closeWeek = document.getElementById('checklist-close-week');
  els.itemHeads = document.querySelectorAll('.checklist-item-head');
}

function stateKey(nttId, dow, seq) {
  return `${nttId}|${dow}|${seq}`;
}

function isChecked(nttId, dow, seq) {
  return state.get(stateKey(nttId, dow, seq)) === 'Y';
}

function itemLabel(seq) {
  const found = items.find((it) => it.SEQ === seq);
  return found?.LABEL || `항목 ${seq}`;
}

function renderItemHeads() {
  els.itemHeads.forEach((th) => {
    th.textContent = itemLabel(Number(th.dataset.itemSeq));
  });
  ITEM_SEQS.forEach((seq) => {
    const input = els.itemForm.querySelector(`[data-item-seq="${seq}"]`);
    const found = items.find((it) => it.SEQ === seq);
    input.value = found?.LABEL || '';
  });
}

function dayCell(nttId, seq) {
  return DOWS.map((dow) => {
    const on = isChecked(nttId, dow, seq);
    return `<button type="button" class="checklist-day ${on ? 'on' : ''}" data-ntt="${nttId}" data-dow="${dow}" data-seq="${seq}">${DOW_LABEL[dow]}</button>`;
  }).join('');
}

function render() {
  if (loadFailed) {
    els.body.innerHTML = `<tr><td colspan="7"><div class="error-banner">체크리스트를 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div></td></tr>`;
    return;
  }
  renderItemHeads();

  if (members.length === 0) {
    els.body.innerHTML = `<tr><td colspan="7"><div class="empty">사명(ISMISSION=Y) 인원이 없습니다.</div></td></tr>`;
    return;
  }

  els.body.innerHTML = members.map((m) => `
    <tr>
      <td data-label="구역">${m.GU ?? '-'}</td>
      <td data-label="이름"><strong>${m.NAME ?? ''}</strong></td>
      ${ITEM_SEQS.map((seq) => `<td class="checklist-days-cell" data-label="${itemLabel(seq)}">${dayCell(m.NTT_ID, seq)}</td>`).join('')}
    </tr>`).join('');

  bindDayButtons();
}

function bindDayButtons() {
  els.body.querySelectorAll('[data-ntt]').forEach((btn) => {
    btn.addEventListener('click', () => handleToggle(btn));
  });
}

async function handleToggle(btn) {
  const nttId = Number(btn.dataset.ntt);
  const dow   = Number(btn.dataset.dow);
  const seq   = Number(btn.dataset.seq);
  const key   = stateKey(nttId, dow, seq);
  const prev  = state.get(key);
  const next  = prev !== 'Y';

  state.set(key, next ? 'Y' : 'N');
  btn.classList.toggle('on', next);

  try {
    await checklistApi.toggle({ NTT_ID: nttId, DOW: dow, ITEM_SEQ: seq, CHECKED: next });
  } catch (err) {
    state.set(key, prev);
    btn.classList.toggle('on', prev === 'Y');
    alert(`저장 실패: ${err.message}`);
  }
}

async function handleSaveItems() {
  const payload = ITEM_SEQS.map((seq) => ({
    SEQ: seq,
    LABEL: els.itemForm.querySelector(`[data-item-seq="${seq}"]`).value.trim(),
  }));
  els.saveItems.disabled = true;
  try {
    items = await checklistApi.saveItems(payload);
    render();
  } catch (err) {
    alert(`항목 저장 실패: ${err.message}`);
  } finally {
    els.saveItems.disabled = false;
  }
}

async function handleCloseWeek() {
  if (!confirm('이번 주 체크리스트를 마감하고 초기화하시겠습니까? 각 인원의 체크 개수만 이력에 남고, 현재 체크는 모두 지워집니다.')) return;
  els.closeWeek.disabled = true;
  try {
    await checklistApi.closeWeek();
    state = new Map();
    render();
  } catch (err) {
    alert(`마감 실패: ${err.message}`);
  } finally {
    els.closeWeek.disabled = false;
  }
}

export async function initChecklistTab() {
  cacheEls();
  els.saveItems.addEventListener('click', handleSaveItems);
  els.closeWeek.addEventListener('click', handleCloseWeek);

  els.body.innerHTML = `<tr><td colspan="7"><div class="loading">불러오는 중…</div></td></tr>`;
  try {
    [members, items] = await Promise.all([checklistApi.members(), checklistApi.items()]);
    const rows = await checklistApi.state();
    state = new Map(rows.map((r) => [stateKey(r.NTT_ID, r.DOW, r.ITEM_SEQ), r.CHECKED]));
    loadFailed = false;
  } catch {
    loadFailed = true;
  }
  render();
}
