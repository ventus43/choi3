import { checkApi } from '../core/api.js';
import { renderZoneSeg } from '../core/zone.js';
import { nameMatch } from '../core/format.js';

export const TEMPLATE = `
    <div class="panel-head">
      <div>
        <h2>TM 현황</h2>
        <p>섭외자별 TM 및 1·2·3차 점검 진행 상태입니다.</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="check-stopped-toggle" aria-pressed="false"
        title="만남 진행 여부 확정이 있는 인원은 제외하고, 일주일 전까지 등록된 중단 인원만 표시">중단인원확인</button>
    </div>

    <div class="filter-bar" id="check-filter-bar">
      <div class="seg-group" id="check-seg-gu"></div>
      <span class="filter-search-group">
        <input type="text" class="filter-search" id="check-search" placeholder="이름" autocomplete="off">
        <button type="button" class="btn btn-ghost btn-sm" id="check-search-btn">검색</button>
      </span>
      <span class="filter-count" id="check-filtered-count"></span>
    </div>

    <div class="stat-row" id="check-stats"></div>

    <table>
      <thead>
      <tr>
        <th>섭외일자</th><th>구역</th><th>이름</th><th>티엠자</th><th>TM</th>
        <th>1차 점검</th><th>2차 점검</th><th>3차 점검</th><th>상태</th><th>비고</th>
      </tr>
      </thead>
      <tbody id="check-body"></tbody>
    </table>
`;

let entries = [];
let guFilter  = '';   // '' = 전체 구역
let nameQuery = '';
let stoppedOnly = false;   // '중단인원확인' 토글 상태

const els = {};

/* 1·2·3차: Y 면 체크 표시, N/공백/없음 이면 빈 칸 */
function tmMark(v) {
  return String(v ?? '').trim().toUpperCase() === 'Y'
    ? '<span class="tm-check" title="완료">✓</span>'
    : '';
}

/* '중단인원확인' 토글 필터
   - 상태가 '중단'
   - 1·2·3차 중 만남 진행 여부 확정 표시(Y / 확답 / 확정)가 하나도 없음
   - 섭외일자가 오늘로부터 7일 이상 지난 건(일주일 전까지 등록분) */
function hasConfirmedMeeting(c) {
  return [c.check1 ?? c.c1, c.check2 ?? c.c2, c.check3 ?? c.c3].some((v) => {
    const s = String(v ?? '').trim();
    return s.toUpperCase() === 'Y' || s === '확답' || s === '확정';
  });
}

function daysSince(dateStr) {
  const s = String(dateStr ?? '').trim().replace(/\./g, '-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return Infinity;   // 날짜 없으면 오래된 건으로 간주해 노출
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.floor((today - d) / 86400000);
}

function isStoppedReviewTarget(c) {
  return c.status === '중단' && !hasConfirmedMeeting(c) && daysSince(c.date) >= 7;
}

function cacheEls() {
  els.stats  = document.getElementById('check-stats');
  els.body   = document.getElementById('check-body');
  els.count  = document.getElementById('count-check');
  els.seg      = document.getElementById('check-seg-gu');
  els.search   = document.getElementById('check-search');
  els.searchBtn = document.getElementById('check-search-btn');
  els.fcount   = document.getElementById('check-filtered-count');
  els.stoppedToggle = document.getElementById('check-stopped-toggle');
}

function applySearch() {
  nameQuery = els.search.value;
  render(false);
}

function filtered() {
  return entries.filter((c) =>
    (!guFilter || String(c.zone) === guFilter) &&
    nameMatch(c.name, nameQuery) &&
    (!stoppedOnly || isStoppedReviewTarget(c)));
}

function render(loadFailed) {
  els.count.textContent = entries.length;

  if (loadFailed) {
    els.stats.innerHTML = '';
    els.seg.innerHTML = '';
    els.fcount.textContent = '';
    els.body.innerHTML = `<tr><td colspan="10"><div class="error-banner">점검 현황을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div></td></tr>`;
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
    els.body.innerHTML = `<tr><td colspan="10"><div class="empty">점검 데이터가 없습니다.</div></td></tr>`;
    return;
  }
  if (list.length === 0) {
    const msg = stoppedOnly
      ? '일주일 전까지 등록된 중단 인원이 없습니다.'
      : '해당 조건의 섭외자가 없습니다.';
    els.body.innerHTML = `<tr><td colspan="10"><div class="empty">${msg}</div></td></tr>`;
    return;
  }

  els.body.innerHTML = list.map((c) => {
    const c1 = tmMark(c.check1 ?? c.c1);
    const c2 = tmMark(c.check2 ?? c.c2);
    const c3 = tmMark(c.check3 ?? c.c3);
    return `
      <tr>
        <td class="mono" data-label="섭외일자">${c.date}</td>
        <td data-label="구역">${c.zone}</td>
        <td data-label="이름">${c.name}</td>
        <td data-label="TM 담당">${c.tmName ?? ''}</td>
        <td data-label="TM"><span class="check-tag ${c.tm === 'O' ? 'done' : 'pending'}">${c.tm === 'O' ? 'TM' : '대기'}</span></td>
        <td class="tm-col" data-label="1차 점검">${c1}</td>
        <td class="tm-col" data-label="2차 점검">${c2}</td>
        <td class="tm-col" data-label="3차 점검">${c3}</td>
        <td data-label="상태"><span class="status-pill ${c.status === '진행' ? 'ongoing' : 'stopped'}">${c.status}</span></td>
        <td data-label="비고">${c.note ?? ''}</td>
      </tr>`;
  }).join('');
}

async function load() {
  els.body.innerHTML = `<tr><td colspan="10"><div class="loading">불러오는 중…</div></td></tr>`;
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
  els.stoppedToggle.addEventListener('click', () => {
    stoppedOnly = !stoppedOnly;
    els.stoppedToggle.classList.toggle('active', stoppedOnly);
    els.stoppedToggle.setAttribute('aria-pressed', String(stoppedOnly));
    render(false);
  });
  await load();
}
