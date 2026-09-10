/* 날짜 헬퍼 — 일정 목록(schedule)·만남 일정(meetview) 공용. */

export const WD = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (v) => String(v).padStart(2, '0');

/* 로컬 기준 YYYY-MM-DD */
export function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

/* 오늘 기준 days 만큼 이동한 YYYY-MM-DD (음수 가능) */
export function isoOffset(days) {
  const n = new Date();
  n.setDate(n.getDate() + days);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

/* 'YYYY-MM-DD' → { md: 'M/D', dow: '요일' }. 빈 값이면 '날짜 미정'. */
export function dayLabel(iso) {
  if (!iso) return { md: '날짜 미정', dow: '' };
  const [y, m, d] = iso.split('-').map(Number);
  return { md: `${m}/${d}`, dow: WD[new Date(y, m - 1, d).getDay()] };
}
