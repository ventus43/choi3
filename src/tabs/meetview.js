import { meetingApi } from '../api.js';
import { nameMatch } from '../utils.js';

const els = {};

let allRows   = [];   // 현재 기간으로 불러온 만남 전체 (이름 필터 전)
let nameQuery = '';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

function todayIso() {
  const n = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function dayLabel(iso) {
  if (!iso) return { md: '날짜 미정', dow: '' };
  const [y, m, d] = iso.split('-').map(Number);
  return { md: `${m}/${d}`, dow: WD[new Date(y, m - 1, d).getDay()] };
}

/* 만남자: 인도자/섬김이 (섬김이 없으면 "/섬김이" 생략) — 일정 관리와 동일 규칙 */
function meetPersonLabel(m) {
  const parts = [m.indo, m.seomgim].filter(Boolean);
  return parts.length ? parts.join('/') : '-';
}

/* 단계만남(2회차 이상)은 날짜 옆에 회차 표기: 날짜(2) — 일정 관리와 동일 */
function dateText(m) {
  const base = m.meetDt || '날짜 미정';
  return m.seq > 1 ? `${base}(${m.seq})` : base;
}

function progLabel(m) {
  if (m.cancelRs) return { text: '취소', cls: 'prog-cancel' };
  if (m.meetYn === 'Y') return { text: '만남', cls: 'prog-confirm' };
  return { text: '선택', cls: '' };
}

/* 일정 관리 표와 같은 컬럼 구성. 보기 전용이라 뱃지/텍스트로만 표시(수정 요소 없음) */
function section(title, personCol, list) {
  if (!list.length) return '';
  const trs = list.map((m) => {
    const prog = progLabel(m);
    return `
    <tr>
      <td>${dateText(m)}</td>
      <td>${m.zone || '-'}</td>
      <td>${m.hireName || '-'}</td>
      <td>${meetPersonLabel(m)}</td>
      <td>${m.gyosa || '-'}</td>
      <td class="sched2-col-goal">${m.meetCn || ''}</td>
      <td class="sched2-col-goal">${m.goal || ''}</td>
      <td><span class="ms-view-badge ms-fb${m.feedbackYn === 'Y' ? ' on' : ''}">${m.feedbackYn === 'Y' ? '완료' : '대기'}</span></td>
      <td><span class="ms-view-badge${prog.cls ? ` ${prog.cls}` : ''}">${prog.text}</span></td>
      <td class="sched2-col-goal">${m.cancelRs || ''}</td>
    </tr>`;
  }).join('');
  return `
    <div class="sched2-section">
      <div class="sched2-section-title">${title}</div>
      <table class="sched2-table">
        <thead><tr>
          <th>날짜</th><th>구역</th><th>이름</th><th>만남자</th><th>${personCol}</th>
          <th>시간장소</th><th>목표</th><th>피드백</th><th>진행여부</th><th>비고</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

function render(list) {
  if (!list.length) {
    els.list.innerHTML = allRows.length
      ? '<div class="ms-empty">해당 조건의 만남이 없습니다.</div>'
      : '<div class="ms-empty">선택한 기간에 등록된 만남이 없습니다.</div>';
    return;
  }

  const tIso = todayIso();
  const groups = new Map();
  list.forEach((m) => {
    if (!groups.has(m.meetDt)) groups.set(m.meetDt, []);
    groups.get(m.meetDt).push(m);
  });

  els.list.innerHTML = [...groups.keys()].sort().map((iso) => {
    const group = groups.get(iso);
    const first = group.filter((m) => m.seq === 1);   // 첫만남: 만남 카운트 없음
    const step  = group.filter((m) => m.seq > 1);     // 단계만남: 만남 카운트 있음(2회차~)
    const { md, dow } = dayLabel(iso);
    const headCls = iso === tIso ? 'sched2-datecell today' : 'sched2-datecell';
    return `
      <div class="sched2-daygroup">
        <div class="${headCls}">${md}${dow ? `<span class="dow">(${dow})</span>` : ''}</div>
        <div class="sched2-body">
          ${section('첫만남', '상담사', first)}
          ${section('단계만남', '교사', step)}
        </div>
      </div>`;
  }).join('');
}

function isoOffset(days) {
  const n = new Date();
  n.setDate(n.getDate() + days);
  const p = (v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}
const defaultRange = () => ({ from: isoOffset(-1), to: isoOffset(14) });   // 어제 ~ +2주

/* 불러온 목록에 이름 필터만 적용해 다시 그린다 (API 재호출 없음) */
function refresh() {
  els.count.textContent = allRows.length;
  render(allRows.filter((m) => nameMatch(m.hireName, nameQuery)));
}

async function load() {
  els.list.innerHTML = '<div class="loading">불러오는 중…</div>';
  try {
    allRows = await meetingApi.upcoming({ from: els.from.value, to: els.to.value });
    refresh();
  } catch (err) {
    allRows = [];
    els.list.innerHTML = `<div class="error-banner">만남 일정을 불러오지 못했습니다. (${err.message})</div>`;
  }
}

export async function reloadMeetSched() {
  if (els.list) await load();
}

export async function initMeetSchedTab() {
  els.list  = document.getElementById('meetsched-list');
  els.count = document.getElementById('count-meetsched');
  els.from  = document.getElementById('mv-from');
  els.to    = document.getElementById('mv-to');
  els.name  = document.getElementById('mv-name');

  const d = defaultRange();
  els.from.value = d.from;
  els.to.value = d.to;

  // 검색: 현재 날짜 범위로 재조회 + 이름 필터 적용 (버튼 하나로 통일)
  const search = () => { nameQuery = els.name.value; load(); };
  document.getElementById('mv-search').addEventListener('click', search);
  [els.name, els.from, els.to].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  });

  // 초기화: 날짜 기본값 · 이름 비우고 재조회
  document.getElementById('mv-reset').addEventListener('click', () => {
    const dd = defaultRange();
    els.from.value = dd.from;
    els.to.value = dd.to;
    els.name.value = '';
    nameQuery = '';
    load();
  });

  await load();
}
