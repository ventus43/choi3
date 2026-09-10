/* 이름 부분일치(대소문자·공백 무시) */
export function nameMatch(name, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return String(name ?? '').toLowerCase().includes(q);
}

/* CHOIMEMBER.TA — 0=일반 / 1=상담사 / 2=교사. 구 데이터('Y'=교사, 'N'·null=일반) 호환. */
export const TA_LABEL = { 0: '일반', 1: '상담사', 2: '교사' };

export function taCode(v) {
  if (v === 'Y') return 2;
  if (v === 'N' || v == null || v === '') return 0;
  const n = Number(v);
  return (n === 1 || n === 2) ? n : 0;
}
