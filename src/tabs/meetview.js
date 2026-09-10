import { meetingApi } from '../core/api.js';
import { nameMatch } from '../core/format.js';
import { isoOffset } from '../core/date.js';
import {
  bindOutsideClose, expandableCell, meetPersonLabel, renderMeetingDays,
} from './_meetings-table.js';

export const TEMPLATE = `
    <div class="panel-head">
      <div>
        <h2>만남 일정</h2>
        <p>기본: 어제 ~ 이후 2주. 기간·이름으로 조회할 수 있습니다.</p>
      </div>
      <span class="date-range">
        <input type="date" id="mv-from"> ~ <input type="date" id="mv-to">
        <input type="text" class="filter-search" id="mv-name" placeholder="이름" autocomplete="off">
        <button type="button" class="btn btn-ghost btn-sm" id="mv-search">검색</button>
        <button type="button" class="btn btn-ghost btn-sm" id="mv-reset">초기화</button>
      </span>
    </div>
    <div id="meetsched-list" class="ms-list"></div>
`;

const els = {};

let allRows   = [];   // 현재 기간으로 불러온 만남 전체 (이름 필터 전)
let nameQuery = '';
let expandedCellKey = null;   // 펼쳐진 시간장소/목표/비고 셀 키 ("<id>-meetCn" 등, 동시에 하나만)

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
const columns = (personCol) =>
  ['날짜', '구역', '이름', '만남자', personCol, '시간장소', '목표', '피드백', '진행여부', '비고'];

function renderRow(m) {
  const prog = progLabel(m);
  return `
    <tr>
      <td data-label="날짜">${dateText(m)}</td>
      <td data-label="구역">${m.zone || '-'}</td>
      <td data-label="이름">${m.hireName || '-'}</td>
      <td data-label="만남자">${meetPersonLabel(m)}</td>
      <td data-label="상담자 · 인도자">${m.gyosa || '-'}</td>
      ${expandableCell(m, 'meetCn', '시간장소', expandedCellKey)}
      ${expandableCell(m, 'goal', '목표', expandedCellKey)}
      <td data-label="피드백"><span class="ms-view-badge ms-fb${m.feedbackYn === 'Y' ? ' on' : ''}">${m.feedbackYn === 'Y' ? '완료' : '대기'}</span></td>
      <td data-label="진행 여부"><span class="ms-view-badge${prog.cls ? ` ${prog.cls}` : ''}">${prog.text}</span></td>
      ${expandableCell(m, 'cancelRs', '비고', expandedCellKey)}
    </tr>`;
}

function render(list) {
  if (!list.length) {
    els.list.innerHTML = allRows.length
      ? '<div class="ms-empty">해당 조건의 만남이 없습니다.</div>'
      : '<div class="ms-empty">선택한 기간에 등록된 만남이 없습니다.</div>';
    return;
  }
  els.list.innerHTML = renderMeetingDays(list, { columns, renderRow });
  bindExpand();
}

/* 셀 클릭 시 펼치기/접기 토글 (다른 곳 클릭하면 bindOutsideClose 가 접음) */
function bindExpand() {
  els.list.querySelectorAll('.sched2-expandable').forEach((td) => {
    td.addEventListener('click', (ev) => {
      ev.stopPropagation();   // 문서 클릭 리스너로 버블링 안 되게(같은 클릭에 바로 접히는 것 방지)
      const key = td.dataset.expandKey;
      expandedCellKey = expandedCellKey === key ? null : key;
      refresh();
    });
  });
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
  expandedCellKey = null;
  if (els.list) await load();
}

export async function initMeetSchedTab() {
  els.list  = document.getElementById('meetsched-list');
  els.count = document.getElementById('count-meetsched');
  els.from  = document.getElementById('mv-from');
  els.to    = document.getElementById('mv-to');
  els.name  = document.getElementById('mv-name');

  // 펼쳐진 셀 밖을 클릭하면 원래(말줄임) 상태로 되돌림
  bindOutsideClose(() => {
    if (expandedCellKey !== null) { expandedCellKey = null; refresh(); }
  });

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
