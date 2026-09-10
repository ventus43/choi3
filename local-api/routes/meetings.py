"""/meetings/*, /outreach/<hire>/meetings  (CHOIMEETSCHEDULE) — 만남 스케줄."""
from flask import Blueprint, jsonify, request

from db import db_cursor
from serializers import _MEET_HIRE_JOIN, meet_to_json, meeting_with_hire_to_json
from sqlpatch import build_update

meetings_bp = Blueprint('meetings', __name__)


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
    with db_cursor() as cur:
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
    # 날짜가 잡힌 모든 만남 + 아직 날짜 없는 첫만남(SEQ=1). 중단(PRG='중단') 섭외자 제외.
    # 기본은 기간 제한 없음. from/to 쿼리로 지정 시 그 기간의 만남만.
    rng_sql, rng_params = _date_range()
    with db_cursor() as cur:
        where = (" WHERE m.DEL_YN = 'N' AND h.DEL_YN = 'N'"
                 "   AND (h.PRG IS NULL OR h.PRG <> '중단')")
        if rng_sql:
            where += rng_sql
        else:
            where += "   AND (m.SEQ = 1 OR m.MEET_DT IS NOT NULL)"
        cur.execute(_MEET_HIRE_JOIN + where + " ORDER BY m.MEET_DT, m.SEQ, m.NTT_ID", rng_params)
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

        seq = body.get('seq')
        if not seq:
            cur.execute(
                'SELECT COALESCE(MAX(SEQ), 0) + 1 AS n FROM CHOIMEETSCHEDULE WHERE HIREID=%s',
                (hire_id,),
            )
            seq = cur.fetchone()['n']
        cur.execute(
            'INSERT INTO CHOIMEETSCHEDULE'
            ' (HIREID, SEQ, MEET_DT, MEETCN, GOAL, FEEDBACKYN, MEETYN, CANCELRS)'
            ' VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
            (hire_id, seq, body.get('meetDt') or None, body.get('meetCn'), body.get('goal'),
             body.get('feedbackYn') or 'N', body.get('meetYn') or 'N',
             body.get('cancelRs')),
        )
        cur.execute('SELECT * FROM CHOIMEETSCHEDULE WHERE NTT_ID=%s', (cur.lastrowid,))
        return jsonify(meet_to_json(cur.fetchone())), 201


@meetings_bp.route('/meetings/<int:mid>', methods=['PATCH'])
def meeting_update(mid):
    body = request.get_json(silent=True) or {}
    col_map = {
        'seq': 'SEQ', 'meetDt': 'MEET_DT', 'meetCn': 'MEETCN', 'goal': 'GOAL',
        'feedbackYn': 'FEEDBACKYN', 'meetYn': 'MEETYN', 'cancelRs': 'CANCELRS',
    }
    sets, vals = build_update(col_map, body)
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    vals.append(mid)
    with db_cursor(commit=True) as cur:
        cur.execute(f'UPDATE CHOIMEETSCHEDULE SET {",".join(sets)} WHERE NTT_ID=%s', vals)
        return jsonify({'ok': True})


@meetings_bp.route('/meetings/<int:mid>', methods=['DELETE'])
def meeting_delete(mid):
    # 이력 보존 위해 물리 삭제 대신 숨김 처리
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE CHOIMEETSCHEDULE SET DEL_YN='Y' WHERE NTT_ID=%s", (mid,))
        return ('', 204)
