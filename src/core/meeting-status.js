import { todayIso } from './date.js';

// 날짜가 지난 '선택' 일정은 데이터는 보존하되, 화면의 업무 상태에서는 취소로 본다.
export function effectiveMeetingStatus(meeting) {
  if (meeting.meetSt === 2) return 'cancel';
  if (meeting.meetSt === 3) return 'confirm';
  if (meeting.meetDt && meeting.meetDt < todayIso()) return 'cancel';
  return 'select';
}
