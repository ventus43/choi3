export function fmtDateLabel(iso) {
  if (!iso) return '날짜 미정';
  const d = new Date(`${iso}T00:00:00`);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}.${d.getDate()}(${days[d.getDay()]})`;
}

export function fmtMonthShort(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}월`;
}

export function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}
