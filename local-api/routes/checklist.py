"""/checklist  (CHOICHECKLIST_ITEM / CHOICHECKLIST / CHOICHECKLIST_HISTORY)
사명자(ISMISSION='Y') 요일별 체크리스트 — 관리자 전용 CRUD.

본프로젝트 로그인(X-Office-Auth)이 그대로 적용된다(별도 인증 없음) — 관리자 SPA 전용 라우트.
공개(무인증) 개인 조회는 routes/mychecklist.py 참고 — 체크는 여기서만 하고, 그쪽은 읽기 전용이다.
"""
import datetime

from flask import Blueprint, jsonify, request

from db import db_cursor

checklist_bp = Blueprint('checklist', __name__)

ITEM_SEQS = (1, 2, 3, 4, 5)
DOWS = (1, 2, 3, 4, 5, 6, 7)   # 1=월 ... 7=일


@checklist_bp.route('/checklist/items', methods=['GET'])
def checklist_items():
    with db_cursor() as cur:
        cur.execute('SELECT SEQ, LABEL FROM CHOICHECKLIST_ITEM ORDER BY SEQ')
        return jsonify(cur.fetchall())


@checklist_bp.route('/checklist/items', methods=['PUT'])
def checklist_items_update():
    body = request.get_json(silent=True) or {}
    items = body.get('items') or []
    with db_cursor(commit=True) as cur:
        for it in items:
            seq = it.get('SEQ')
            if seq not in ITEM_SEQS:
                continue
            cur.execute('UPDATE CHOICHECKLIST_ITEM SET LABEL=%s WHERE SEQ=%s', (it.get('LABEL', ''), seq))
        cur.execute('SELECT SEQ, LABEL FROM CHOICHECKLIST_ITEM ORDER BY SEQ')
        return jsonify(cur.fetchall())


@checklist_bp.route('/checklist/members', methods=['GET'])
def checklist_members():
    with db_cursor() as cur:
        cur.execute("SELECT NTT_ID, GU, NAME FROM CHOIMEMBER WHERE ISMISSION='Y' ORDER BY GU, NTT_ID")
        return jsonify(cur.fetchall())


@checklist_bp.route('/checklist/state', methods=['GET'])
def checklist_state():
    """이번 주(마감 전) 체크 상태 전체 — 없는 조합은 프론트에서 미체크로 취급."""
    with db_cursor() as cur:
        cur.execute('SELECT NTT_ID, DOW, ITEM_SEQ, CHECKED FROM CHOICHECKLIST')
        return jsonify(cur.fetchall())


@checklist_bp.route('/checklist/state', methods=['PUT'])
def checklist_state_toggle():
    body = request.get_json(silent=True) or {}
    ntt_id = body.get('NTT_ID')
    dow = body.get('DOW')
    item_seq = body.get('ITEM_SEQ')
    checked = 'Y' if body.get('CHECKED') else 'N'
    if ntt_id is None or dow not in DOWS or item_seq not in ITEM_SEQS:
        return jsonify({'message': '잘못된 요청입니다.'}), 400
    with db_cursor(commit=True) as cur:
        cur.execute(
            'INSERT INTO CHOICHECKLIST (NTT_ID, DOW, ITEM_SEQ, CHECKED) VALUES (%s,%s,%s,%s)'
            ' ON DUPLICATE KEY UPDATE CHECKED=%s',
            (ntt_id, dow, item_seq, checked, checked),
        )
        return jsonify({'ok': True})


@checklist_bp.route('/checklist/close-week', methods=['POST'])
def checklist_close_week():
    """이번 주 체크 상태를 인원별 개수 요약(간단 이력)으로 남기고, 다음 주를 위해 초기화한다."""
    with db_cursor(commit=True) as cur:
        cur.execute('SELECT CURDATE() AS today')
        today = cur.fetchone()['today']
        week_start = today - datetime.timedelta(days=today.weekday())

        cur.execute("SELECT NTT_ID FROM CHOIMEMBER WHERE ISMISSION='Y'")
        member_ids = [r['NTT_ID'] for r in cur.fetchall()]

        cur.execute("SELECT NTT_ID, COUNT(*) AS n FROM CHOICHECKLIST WHERE CHECKED='Y' GROUP BY NTT_ID")
        checked_map = {r['NTT_ID']: r['n'] for r in cur.fetchall()}

        total = len(ITEM_SEQS) * len(DOWS)
        for ntt_id in member_ids:
            checked_count = checked_map.get(ntt_id, 0)
            cur.execute(
                'INSERT INTO CHOICHECKLIST_HISTORY (NTT_ID, WEEK_START, CHECKED_COUNT, TOTAL_COUNT)'
                ' VALUES (%s,%s,%s,%s)'
                ' ON DUPLICATE KEY UPDATE CHECKED_COUNT=%s, TOTAL_COUNT=%s',
                (ntt_id, week_start, checked_count, total, checked_count, total),
            )

        cur.execute('DELETE FROM CHOICHECKLIST')
        return jsonify({'ok': True, 'weekStart': week_start.strftime('%Y-%m-%d')})


@checklist_bp.route('/checklist/history', methods=['GET'])
def checklist_history():
    with db_cursor() as cur:
        cur.execute(
            'SELECT NTT_ID, WEEK_START, CHECKED_COUNT, TOTAL_COUNT FROM CHOICHECKLIST_HISTORY'
            ' ORDER BY WEEK_START DESC'
        )
        rows = cur.fetchall()
        for r in rows:
            r['WEEK_START'] = r['WEEK_START'].strftime('%Y-%m-%d')
        return jsonify(rows)
