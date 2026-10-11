"""/meetings/*, /outreach/<hire>/meetings  (CHOIMEETSCHEDULE) — 만남 스케줄."""
import datetime

from flask import Blueprint, jsonify, request

from db import db_cursor
from serializers import _MEET_HIRE_JOIN, meet_to_json, meeting_with_hire_to_json
from sqlpatch import build_update

meetings_bp = Blueprint('meetings', __name__)

_KST = datetime.timezone(datetime.timedelta(hours=9))

# 날짜가 지난 '선택'(MEETST=1) 건을 자동 취소 처리할 때 CANCELRS 에 심는 표식.
# meeting_update() 가 이 표식을 보고 "자동 취소였는지"(수동 취소와 구분)를 판단한다.
AUTO_EXPIRE_REASON = '날짜 경과로 자동 취소'


def _today_kst():
    return datetime.datetime.now(_KST).strftime('%Y-%m-%d')


def _expire_stale_pending(cur):
    """날짜가 지났는데 아직 '선택'(대기중) 상태로 남은 건을 '취소'로 굳힌다.
    (화면은 effectiveMeetingStatus() 로 이미 '취소'처럼 보여주고 있었는데 DB 값은 그대로였음
    — 그래서 날짜 범위 필터와 무관하게 노출되는 MEETST=1 예외에 영원히 걸려 있었다.)"""
    cur.execute(
        "UPDATE CHOIMEETSCHEDULE"
        "   SET MEETST = 2, CANCELRS = COALESCE(NULLIF(CANCELRS, ''), %s)"
        " WHERE DEL_YN = 'N' AND MEETST = 1"
        "   AND MEET_DT IS NOT NULL AND MEET_DT < CURDATE()",
        (AUTO_EXPIRE_REASON,),
    )


def _date_range():
    """쿼리스트링 from / to (YYYY-MM-DD). 둘 다 있으면 (기간필터 SQL, params) 반환, 아니면 (None, [])."""
    frm = (request.args.get('from') or '').strip()
    to  = (request.args.get('to') or '').strip()
    if frm and to:
        return ' AND m.MEET_DT BETWEEN %s AND %s', [frm, to]
    return None, []


@meetings_bp.route('/meetings/upcoming', methods=['GET'])
def meeting_upcoming():
    # 기본: 어제(-1일) ~ 이후 2주(+14일). from/to 쿼리로 기간 지정 가능.
    rng_sql, rng_params = _date_range()
    with db_cursor(commit=True) as cur:
        _expire_stale_pending(cur)
        where = " WHERE m.DEL_YN = 'N' AND m.MEET_DT IS NOT NULL"
        if rng_sql:
            where += rng_sql
        else:
            where += ("   AND m.MEET_DT BETWEEN (CURDATE() - INTERVAL 1 DAY)"
                      "                     AND (CURDATE() + INTERVAL 14 DAY)")
        cur.execute(_MEET_HIRE_JOIN + where + " ORDER BY m.MEET_DT, m.SEQ, m.NTT_ID", rng_params)
        return jsonify([meeting_with_hire_to_json(r) for r in cur.fetchall()])


@meetings_bp.route('/meetings/schedule', methods=['GET'])
def meeting_schedule():
    # 중단(PRG='중단') 섭외자 제외.
    # from/to 없으면: 날짜가 잡힌 모든 만남 + 아직 날짜 없는 첫만남(SEQ=1).
    # from/to 있으면: 그 기간의 만남 + (기간 밖이어도) 아직 '진행여부=선택'(MEETST=1) 으로 남은 만남 + 날짜 미정 만남.
    #   '선택' 은 처리해야 할 항목이라 기간과 무관하게 노출.
    frm = (request.args.get('from') or '').strip()
    to  = (request.args.get('to') or '').strip()
    with db_cursor(commit=True) as cur:
        _expire_stale_pending(cur)
        where = (" WHERE m.DEL_YN = 'N' AND h.DEL_YN = 'N'"
                 "   AND (h.PRG IS NULL OR h.PRG <> '중단')")
        params = []
        if frm and to:
            where += (
                "   AND ((m.MEET_DT BETWEEN %s AND %s)"
                "        OR m.MEET_DT IS NULL"
                "        OR m.MEETST = 1)"
            )
            params = [frm, to]
        else:
            where += "   AND (m.SEQ = 1 OR m.MEET_DT IS NOT NULL)"
        cur.execute(_MEET_HIRE_JOIN + where + " ORDER BY m.MEET_DT, m.SEQ, m.NTT_ID", params)
        return jsonify([meeting_with_hire_to_json(r) for r in cur.fetchall()])


@meetings_bp.route('/outreach/<int:hire_id>/meetings', methods=['GET'])
def meeting_list(hire_id):
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM CHOIMEETSCHEDULE WHERE HIREID=%s AND DEL_YN='N'"
            ' ORDER BY SEQ, NTT_ID',
            (hire_id,),
        )
        return jsonify([meet_to_json(r) for r in cur.fetchall()])


@meetings_bp.route('/outreach/<int:hire_id>/meetings', methods=['POST'])
def meeting_create(hire_id):
    body = request.get_json(silent=True) or {}
    with db_cursor(commit=True) as cur:
        # 첫만남(SEQ=1)에 날짜가 없으면 다음 만남을 추가할 수 없음 — 먼저 첫만남 일정을 수정해야 함.
        cur.execute(
            "SELECT MEET_DT FROM CHOIMEETSCHEDULE WHERE HIREID=%s AND SEQ=1 AND DEL_YN='N'",
            (hire_id,),
        )
        first = cur.fetchone()
        if first is not None and not first['MEET_DT']:
            return jsonify({'message': '첫만남 일정에 날짜가 없습니다. 첫만남 일정을 먼저 수정해 주세요.'}), 400

        # 같은 대상자는 첫만남/단계만남 구분 없이 같은 날짜에 두 건 이상 등록할 수 없음.
        meet_dt = body.get('meetDt') or None
        if meet_dt:
            cur.execute(
                "SELECT 1 FROM CHOIMEETSCHEDULE WHERE HIREID=%s AND MEET_DT=%s AND DEL_YN='N' LIMIT 1",
                (hire_id, meet_dt),
            )
            if cur.fetchone():
                return jsonify({'message': f'{meet_dt} 에 이미 만남 일정이 등록되어 있습니다.'}), 400

        seq = body.get('seq')
        if not seq:
            cur.execute(
                'SELECT COALESCE(MAX(SEQ), 0) + 1 AS n FROM CHOIMEETSCHEDULE WHERE HIREID=%s',
                (hire_id,),
            )
            seq = cur.fetchone()['n']
        cur.execute(
            'INSERT INTO CHOIMEETSCHEDULE'
            ' (HIREID, SEQ, MEET_DT, MEETCN, GOAL, FEEDBACKYN, MEETST, CANCELRS)'
            ' VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
            (hire_id, seq, body.get('meetDt') or None, body.get('meetCn'), body.get('goal'),
             body.get('feedbackYn') or 'N', body.get('meetSt') or 1,
             body.get('cancelRs')),
        )
        cur.execute('SELECT * FROM CHOIMEETSCHEDULE WHERE NTT_ID=%s', (cur.lastrowid,))
        return jsonify(meet_to_json(cur.fetchone())), 201


@meetings_bp.route('/meetings/<int:mid>', methods=['PATCH'])
def meeting_update(mid):
    body = request.get_json(silent=True) or {}
    col_map = {
        'seq': 'SEQ', 'meetDt': 'MEET_DT', 'meetCn': 'MEETCN', 'goal': 'GOAL',
        'feedbackYn': 'FEEDBACKYN', 'meetSt': 'MEETST', 'cancelRs': 'CANCELRS',
    }
    sets, vals = build_update(col_map, body)
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    with db_cursor(commit=True) as cur:
        row = None
        if 'meetDt' in body:
            cur.execute('SELECT HIREID, SEQ, MEETST, CANCELRS FROM CHOIMEETSCHEDULE WHERE NTT_ID=%s', (mid,))
            row = cur.fetchone()
            meet_dt = body.get('meetDt') or None
            # 같은 대상자는 첫만남/단계만남 구분 없이 같은 날짜에 두 건 이상 등록할 수 없음 (자기 자신은 제외).
            if meet_dt and row:
                cur.execute(
                    "SELECT 1 FROM CHOIMEETSCHEDULE"
                    " WHERE HIREID=%s AND MEET_DT=%s AND DEL_YN='N' AND NTT_ID<>%s LIMIT 1",
                    (row['HIREID'], meet_dt, mid),
                )
                if cur.fetchone():
                    return jsonify({'message': f'{meet_dt} 에 이미 만남 일정이 등록되어 있습니다.'}), 400

            # 날짜 경과로 자동 취소됐던 건을 다시 오늘 이후 날짜로 고치면 선택(대기중)으로 되돌린다.
            # meetSt 를 사용자가 같이 보냈으면(명시적으로 상태도 바꾼 경우) 그 값을 그대로 따르고 건드리지 않음.
            if (row and 'meetSt' not in body and row['MEETST'] == 2
                    and row['CANCELRS'] == AUTO_EXPIRE_REASON
                    and meet_dt and meet_dt >= _today_kst()):
                sets += ['`MEETST`=%s', '`CANCELRS`=%s']
                vals += [1, '']

        vals.append(mid)
        cur.execute(f'UPDATE CHOIMEETSCHEDULE SET {",".join(sets)} WHERE NTT_ID=%s', vals)
        # 첫만남(SEQ=1) 날짜 변경 시, 섭외자 등록 시점에 CHOIHIRE 에 복제해둔 MEET_DATE 도 함께 맞춘다.
        # 안 맞추면 섭외자 목록/TM현황 탭엔 옛 날짜가 그대로 남아 일정 목록 탭과 서로 다른 날짜가 보임.
        if row and row['SEQ'] == 1:
            cur.execute('UPDATE CHOIHIRE SET MEET_DATE=%s WHERE NTT_ID=%s',
                         (body.get('meetDt') or None, row['HIREID']))
        return jsonify({'ok': True})


@meetings_bp.route('/meetings/<int:mid>', methods=['DELETE'])
def meeting_delete(mid):
    # 이력 보존 위해 물리 삭제 대신 숨김 처리
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE CHOIMEETSCHEDULE SET DEL_YN='Y' WHERE NTT_ID=%s", (mid,))
        return ('', 204)
