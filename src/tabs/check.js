import { checkApi } from '../api.js';
import { renderZoneSeg, nameMatch } from '../utils.js';

let entries = [];
let guFilter  = '';   // '' = 전체 구역
let nameQuery = '';

const els = {};

/* 1·2·3차: Y 면 체크 표시, N/공백/없음 이면 빈 칸 */
function tmMark(v) {
  return String(v ?? '').trim().toUpperCase() === 'Y'
    ? '<span class="tm-check" title="완료">✓</span>'
    : '';
}

function cacheEls() {
  els.stats  = document.getElementById('check-stats');
  els.body   = document.getElementById('check-body');
  els.count  = document.getElementById('count-check');
  els.seg      = document.getElementById('check-seg-gu');
  els.search   = document.getElementById('check-search');
  els.searchBtn = document.getElementById('check-search-btn');
  els.fcount   = document.getElementById('check-filtered-count');
}

function applySearch() {
  nameQuery = els.search.value;
  render(false);
}

function filtered() {
  return entries.filter((c) =>
    (!guFilter || String(c.zone) === guFilter) && nameMatch(c.name, nameQuery));
}

function render(loadFailed) {
  els.count.textContent = entries.length;

  if (loadFailed) {
    els.stats.innerHTML = '';
    els.seg.innerHTML = '';
    els.fcount.textContent = '';
    els.body.innerHTML = `<tr><td colspan="9"><div class="error-banner">점검 현황을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div></td></tr>`;
    return;
  }

  renderZoneSeg(els.seg, entries.map((c) => c.zone), guFilter, (v) => { guFilter = v; render(false); });

  const list = filtered();
  const partial = list.length !== entries.length;
  els.fcount.textContent = partial ? `${list.length} / ${entries.length}명` : `${list.length}명`;

  const ongoing = list.filter((c) => c.status === '진행').length;
  const stopped = list.filter((c) => c.status === '중단').length;
  const tmDone  = list.filter((c) => c.tm === 'O').length;

  els.stats.innerHTML = `
    <div class="stat"><div class="num">${list.length}</div><div class="lbl">${partial ? '조회 섭외자' : '전체 섭외자'}</div></div>
    <div class="stat"><div class="num">${ongoing}</div><div class="lbl">진행 중</div></div>
    <div class="stat"><div class="num">${stopped}</div><div class="lbl">중단</div></div>
    <div class="stat"><div class="num">${tmDone}</div><div class="lbl">TM 완료</div></div>
  `;

  if (entries.length === 0) {
    els.body.innerHTML = `<tr><td colspan="9"><div class="empty">점검 데이터가 없습니다.</div></td></tr>`;
    return;
  }
  if (list.length === 0) {
    els.body.innerHTML = `<tr><td colspan="9"><div class="empty">해당 조건의 섭외자가 없습니다.</div></td></tr>`;
    return;
  }

  els.body.innerHTML = list.map((c) => {
    const c1 = tmMark(c.check1 ?? c.c1);
    const c2 = tmMark(c.check2 ?? c.c2);
    const c3 = tmMark(c.check3 ?? c.c3);
    return `
      <tr>
        <td class="mono">${c.date}</td>
        <td>${c.zone}</td>
        <td>${c.name}</td>
        <td>${c.tm === 'O' ? '<span class="check-tag done">완료</span>' : '<span class="check-tag pending">대기</span>'}</td>
        <td class="tm-col">${c1}</td>
        <td class="tm-col">${c2}</td>
        <td class="tm-col">${c3}</td>
        <td><span class="status-pill ${c.status === '진행' ? 'ongoing' : 'stopped'}">${c.status}</span></td>
        <td>${c.note ?? ''}</td>
      </tr>`;
  }).join('');
}

async function load() {
  els.body.innerHTML = `<tr><td colspan="9"><div class="loading">불러오는 중…</div></td></tr>`;
  try {
    entries = await checkApi.list();
    render(false);
  } catch {
    entries = [];
    render(true);
  }
}

/* 탭 화면 캡처 전에 최신 데이터로 갱신하기 위해 호출 */
export async function reloadCheck() {
  if (els.body) await load();
}

export async function initCheckTab() {
  cacheEls();
  els.searchBtn.addEventListener('click', applySearch);
  els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') applySearch(); });
  await load();
}
