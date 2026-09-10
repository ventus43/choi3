/* 일정 목록(schedule)·만남 일정(meetview) 공용 — 날짜별 첫만남/단계만남 표 골격.
   셀 내용과 이벤트 바인딩은 각 탭이 담당하고, 여기서는 그룹핑·섹션·thead 뼈대만 만든다. */
import { dayLabel, todayIso } from '../core/date.js';

/* 만남자: 인도자/섬김이 (섬김이 없으면 "/섬김이" 생략) */
export function meetPersonLabel(m) {
  const parts = [m.indo, m.seomgim].filter(Boolean);
  return parts.length ? parts.join('/') : '-';
}

/* 시간장소/목표/비고 셀: 평소엔 한 줄 말줄임, expandedKey 가 이 셀이면 펼침.
   expandedKey 상태는 호출부가 관리(클릭 → 토글 → 다시 render). */
export function expandableCell(m, field, labelText, expandedKey) {
  const key = `${m.id}-${field}`;
  const cls = expandedKey === key ? 'sched2-expandable expanded' : 'sched2-expandable';
  return `<td class="${cls}" data-expand-key="${key}" data-label="${labelText}">${m[field] || ''}</td>`;
}

/* 펼쳐진 셀/수정 중인 행 밖을 클릭하면 닫히도록 document 리스너 등록. onClose 에서 상태 초기화 + render. */
export function bindOutsideClose(onClose) {
  document.addEventListener('click', onClose);
}

/* 날짜별 그룹 → 각 날짜마다 첫만남(SEQ=1)·단계만남(SEQ>1) 섹션.
   columns(personCol) → thead 라벨 배열, renderRow(m, personCol) → '<tr>…</tr>' 문자열. */
export function renderMeetingDays(list, { columns, renderRow }) {
  const tIso = todayIso();
  const groups = new Map();
  list.forEach((m) => {
    if (!groups.has(m.meetDt)) groups.set(m.meetDt, []);
    groups.get(m.meetDt).push(m);
  });

  const section = (title, personCol, rows) => {
    if (!rows.length) return '';
    return `
    <div class="sched2-section">
      <div class="sched2-section-title">${title}</div>
      <table class="sched2-table">
        <thead><tr>${columns(personCol).map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((m) => renderRow(m, personCol)).join('')}</tbody>
      </table>
    </div>`;
  };

  return [...groups.keys()].sort().map((iso) => {
    const group = groups.get(iso);
    const { md, dow } = dayLabel(iso);
    return `
      <div class="sched2-daygroup">
        <div class="sched2-datecell${iso === tIso ? ' today' : ''}">${md}${dow ? `<span class="dow">(${dow})</span>` : ''}</div>
        <div class="sched2-body">
          ${section('첫만남', '상담사', group.filter((m) => m.seq === 1))}
          ${section('단계만남', '교사', group.filter((m) => m.seq > 1))}
        </div>
      </div>`;
  }).join('');
}
