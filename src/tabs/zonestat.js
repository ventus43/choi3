import { outreachApi, meetingApi } from '../api.js';
import { STATUS_OPTIONS } from './outreach.js';

const els = {};

const ZONES = ['1', '2', '3', '4', '5', '6', '7'];   // personZones()가 항상 문자열을 반환하므로 여기도 문자열로 통일
const LONG_TERM = '장기';   // 이름만 기록, 수치(점수)·합계 계산에서 제외
const CORE_STATUSES = ['S2', 'S3', 'S4'];   // 구역 오른쪽 끝 "종합" 컬럼 = 이 세 상태 수치의 합

function statusKeyOf(status) {
  return STATUS_OPTIONS.includes(status) ? status : 'S0';
}

function cacheEls() {
  els.wrap  = document.getElementById('zonestat-wrap');
  els.count = document.getElementById('count-zonestat');
}

/* 해당 구역: 인도구역 + (섬김구역 있으면 섬김구역, 없으면 교사구역). 중복되면 하나로. */
function personZones(e) {
  const has = (v) => v !== '' && v != null;
  const zones = [];
  if (has(e.inGu)) zones.push(String(e.inGu));
  const second = has(e.sumGu) ? String(e.sumGu) : (has(e.gyoGu) ? String(e.gyoGu) : null);
  if (second && !zones.includes(second)) zones.push(second);
  return zones;
}

function fmtDate(iso) {
  return iso ? iso.replaceAll('-', '.') : '';
}

function fmtScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* 명단 괄호 안에 뭘 보여줄지: 장기=아무것도(이름만), S5/S6=센터(CT), 그 외=최근 만남 날짜 */
function displayValue(statusKey, date, ct) {
  if (statusKey === LONG_TERM) return '';
  if (statusKey === 'S5' || statusKey === 'S6') return ct || '';
  return date;
}

async function buildData() {
  const [people, meetings] = await Promise.all([outreachApi.list(), meetingApi.schedule()]);
  const active = people.filter((p) => p.prg !== '중단');   // 취소(PRG='중단') 인원은 제외

  // hireId -> 가장 최근 만남 날짜(YYYY-MM-DD)
  const latestDate = new Map();
  meetings.forEach((m) => {
    if (!m.meetDt) return;
    const cur = latestDate.get(m.hireId);
    if (!cur || m.meetDt > cur) latestDate.set(m.hireId, m.meetDt);
  });

  // 사람별 (상태, 해당구역들, 점수, 최근날짜) 먼저 계산 — 1~7 밖 구역이 있으면 컬럼에 추가
  const entries = [];
  const zones = [...ZONES];
  active.forEach((p) => {
    const pZones = personZones(p);
    if (!pZones.length) return;   // 인도구역조차 없는 데이터는 표에서 제외
    pZones.forEach((z) => { if (!zones.includes(z)) zones.push(z); });

    entries.push({
      statusKey: statusKeyOf(p.status),
      zones: pZones,
      score: pZones.length === 2 ? 0.5 : 1,
      name: p.name,
      date: fmtDate(latestDate.get(p.id)),
      ct: p.ct || '',
    });
  });

  const grid = {};
  STATUS_OPTIONS.forEach((s) => { grid[s] = {}; zones.forEach((z) => { grid[s][z] = []; }); });
  // zoneTotals/grandTotal = 표의 "종합" 컬럼·모서리 값. 전체 합계가 아니라 S2~S4 수치만의 합.
  const zoneTotals = {};
  zones.forEach((z) => { zoneTotals[z] = 0; });
  const statusTotals = {};
  STATUS_OPTIONS.forEach((s) => { statusTotals[s] = 0; });
  let grandTotal = 0;

  entries.forEach(({ statusKey, zones: pZones, score, name, date, ct }) => {
    pZones.forEach((z) => {
      grid[statusKey][z].push({ name, score, display: displayValue(statusKey, date, ct) });
      if (statusKey !== LONG_TERM) statusTotals[statusKey] += score;
      if (CORE_STATUSES.includes(statusKey)) {
        zoneTotals[z] += score;
        grandTotal += score;
      }
    });
  });

  return { zones, grid, zoneTotals, statusTotals, grandTotal, count: active.length };
}

/* 상태 칸을 명단(이름+날짜) / 수치(점수) 두 서브컬럼으로 나눠서, 같은 줄끼리 짝이 맞게 표시 */
function cellNames(list) {
  if (!list.length) return '<span class="zv-empty">-</span>';
  return list.map((p) => `<div class="zv-entry">${p.name}${p.display ? `(${p.display})` : ''}</div>`).join('');
}

function cellScores(list) {
  if (!list.length) return '<span class="zv-empty">-</span>';
  return list.map((p) => `<div class="zv-entry">${fmtScore(p.score)}</div>`).join('');
}

function render(data) {
  const { zones, grid, zoneTotals, statusTotals, grandTotal, count } = data;
  els.count.textContent = count;

  if (count === 0) {
    els.wrap.innerHTML = '<div class="empty">취소 아닌 섭외자가 없습니다.</div>';
    return;
  }

  const statusHead1 = STATUS_OPTIONS
    .map((s) => (s === LONG_TERM ? `<th>${s}</th>` : `<th colspan="2">${s}</th>`))
    .join('');
  const statusHead2 = STATUS_OPTIONS
    .map((s) => (s === LONG_TERM ? '<th>명단</th>' : '<th>명단</th><th>수치</th>'))
    .join('');

  const bodyRows = zones.map((z) => {
    const cells = STATUS_OPTIONS.map((s) => {
      const list = grid[s][z];
      if (s === LONG_TERM) return `<td>${cellNames(list)}</td>`;
      return `<td>${cellNames(list)}</td><td class="zv-score-col">${cellScores(list)}</td>`;
    }).join('');
    return `<tr><th class="zv-rowhead">${z}구역</th>${cells}<td class="zv-total">${fmtScore(zoneTotals[z])}</td></tr>`;
  }).join('');

  const footCells = STATUS_OPTIONS
    .map((s) => (s === LONG_TERM
      ? '<td class="zv-empty" style="text-align:center;">-</td>'
      : `<td colspan="2" class="zv-total">${fmtScore(statusTotals[s])}</td>`))
    .join('');

  els.wrap.innerHTML = `
    <table class="zv-table">
      <thead>
        <tr><th rowspan="2">구역\\상태</th>${statusHead1}<th rowspan="2">종합<br>(S2~S4)</th></tr>
        <tr>${statusHead2}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr><th class="zv-rowhead">합계</th>${footCells}<td class="zv-total">${fmtScore(grandTotal)}</td></tr></tfoot>
    </table>`;
}

export async function reloadZoneStat() {
  try {
    render(await buildData());
  } catch (err) {
    els.wrap.innerHTML = `<div class="error-banner">구역 현황을 불러오지 못했습니다. (${err.message})</div>`;
  }
}

export async function initZoneStatTab() {
  cacheEls();
  els.wrap.innerHTML = '<div class="loading">불러오는 중…</div>';
  await reloadZoneStat();
}
