"""/mychecklist  — 사명자(ISMISSION='Y') 체크리스트. 관리시스템(choi3 SPA) 밖의
독립 공개 페이지(public/c0p3X0jZsu.html) 전용 API — 본프로젝트 백오피스 인증(X-Office-Auth)과
완전히 분리되어 있다(auth.EXEMPT_PREFIXES 에 등록, 이 블루프린트 전체가 무인증으로 열려 있음).

접근 두 갈래:
  - 사용자: 이름을 입력해 본인을 찾고, 본인 체크(요일×항목)를 직접 토글한다. 인증 없음.
  - 관리자: 같은 입력창에 비밀번호를 넣으면(프론트에서 로그인 시도) 이 아래 /admin/* 로
    들어간다. 비밀번호는 CHOICHECKLIST_ADMIN 테이블에 저장돼 있어 관리자가 바꿀 수 있고,
    로그인 성공 시 발급되는 토큰(X-Checklist-Auth 헤더)으로 /admin/* 만 보호한다.
"""
import datetime

from flask import Blueprint, jsonify, request

from auth import checklist_token_valid, issue_checklist_token
from config import CHECKLIST_SESSION_TTL
from db import db_cursor

mychecklist_bp = Blueprint('mychecklist', __name__)

DOWS = (1, 2, 3, 4, 5, 6, 7)   # 1=월 ... 7=일


def _today_dow():
    return datetime.date.today().isoweekday()


def _require_admin():
    """관리자 토큰 검사 — 유효하면 None, 아니면 (response, status) 튜플을 반환한다."""
    if not checklist_token_valid(request.headers.get('X-Checklist-Auth', '')):
        return jsonify({'message': '관리자 세션이 만료되었습니다. 다시 로그인해 주세요.'}), 401
    return None


# ── 사용자: 이름 조회 · 본인 체크 ───────────────────────────────────────────

@mychecklist_bp.route('/mychecklist/search', methods=['GET'])
def mychecklist_search():
    """이름으로 조회 — 동명이인이 있을 수 있어 구역 정보를 같이 내려 프론트가 선택하게 한다."""
    name = (request.args.get('name') or '').strip()
    if not name:
        return jsonify([])
    with db_cursor() as cur:
        cur.execute(
            "SELECT NTT_ID, GU, NAME FROM CHOIMEMBER WHERE ISMISSION='Y' AND NAME=%s ORDER BY GU",
            (name,),
        )
        return jsonify(cur.fetchall())


@mychecklist_bp.route('/mychecklist/<int:ntt_id>', methods=['GET'])
def mychecklist_detail(ntt_id):
    with db_cursor() as cur:
        cur.execute(
            "SELECT NTT_ID, GU, NAME FROM CHOIMEMBER WHERE ISMISSION='Y' AND NTT_ID=%s",
            (ntt_id,),
        )
        member = cur.fetchone()
        if not member:
            return jsonify({'message': '대상을 찾을 수 없습니다.'}), 404

        cur.execute('SELECT ID, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY SORT_ORDER, ID')
        items = cur.fetchall()

        cur.execute('SELECT DOW, ITEM_ID, CHECKED FROM CHOICHECKLIST WHERE NTT_ID=%s', (ntt_id,))
        state = cur.fetchall()

        cur.execute('SELECT DOW FROM CHOICHECKLIST_STAMP WHERE NTT_ID=%s', (ntt_id,))
        stamped = [r['DOW'] for r in cur.fetchall()]

        return jsonify({'member': member, 'items': items, 'state': state, 'stamped': stamped, 'today': _today_dow()})


@mychecklist_bp.route('/mychecklist/<int:ntt_id>/check', methods=['PUT'])
def mychecklist_check(ntt_id):
    """본인 체크 토글 — 무인증(이름으로 본인을 찾은 사용자가 직접 체크)."""
    body = request.get_json(silent=True) or {}
    dow = body.get('DOW')
    item_id = body.get('ITEM_ID')
    checked = 'Y' if body.get('CHECKED') else 'N'
    if dow not in DOWS or not isinstance(item_id, int):
        return jsonify({'message': '잘못된 요청입니다.'}), 400

    with db_cursor(commit=True) as cur:
        cur.execute("SELECT NTT_ID FROM CHOIMEMBER WHERE ISMISSION='Y' AND NTT_ID=%s", (ntt_id,))
        if not cur.fetchone():
            return jsonify({'message': '대상을 찾을 수 없습니다.'}), 404
        cur.execute('SELECT 1 FROM CHOICHECKLIST_ITEM WHERE ID=%s', (item_id,))
        if not cur.fetchone():
            return jsonify({'message': '존재하지 않는 항목입니다.'}), 400

        cur.execute(
            'INSERT INTO CHOICHECKLIST (NTT_ID, DOW, ITEM_ID, CHECKED) VALUES (%s,%s,%s,%s)'
            ' ON DUPLICATE KEY UPDATE CHECKED=%s',
            (ntt_id, dow, item_id, checked, checked),
        )
        return jsonify({'ok': True})


@mychecklist_bp.route('/mychecklist/<int:ntt_id>/history', methods=['GET'])
def mychecklist_history(ntt_id):
    """'이전주차요약' 버튼용 — 가장 최근에 마감된 주의 요일별 요약(체크 개수/전체/스탬프)."""
    with db_cursor() as cur:
        cur.execute(
            'SELECT WEEK_START FROM CHOICHECKLIST_HISTORY WHERE NTT_ID=%s'
            ' ORDER BY WEEK_START DESC LIMIT 1',
            (ntt_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({'weekStart': None, 'days': []})
        week_start = row['WEEK_START']

        cur.execute(
            'SELECT DOW, CHECKED_COUNT, TOTAL_COUNT, STAMPED FROM CHOICHECKLIST_HISTORY'
            ' WHERE NTT_ID=%s AND WEEK_START=%s ORDER BY DOW',
            (ntt_id, week_start),
        )
        days = cur.fetchall()
        return jsonify({'weekStart': week_start.strftime('%Y-%m-%d'), 'days': days})


# ── 관리자: 로그인 ──────────────────────────────────────────────────────────

@mychecklist_bp.route('/mychecklist/admin/login', methods=['POST'])
def mychecklist_admin_login():
    body = request.get_json(silent=True) or {}
    password = body.get('password') or ''
    with db_cursor() as cur:
        cur.execute('SELECT PASSWORD FROM CHOICHECKLIST_ADMIN WHERE ID=1')
        row = cur.fetchone()
    if not row or password != row['PASSWORD']:
        return jsonify({'message': '비밀번호가 올바르지 않습니다.'}), 401
    return jsonify({'token': issue_checklist_token(), 'ttl': CHECKLIST_SESSION_TTL})


@mychecklist_bp.route('/mychecklist/admin/password', methods=['PUT'])
def mychecklist_admin_password():
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    new_password = (body.get('password') or '').strip()
    if not new_password:
        return jsonify({'message': '새 비밀번호를 입력해 주세요.'}), 400
    with db_cursor(commit=True) as cur:
        cur.execute('UPDATE CHOICHECKLIST_ADMIN SET PASSWORD=%s WHERE ID=1', (new_password,))
    return jsonify({'ok': True})


# ── 관리자: 항목 관리 ───────────────────────────────────────────────────────

@mychecklist_bp.route('/mychecklist/admin/items', methods=['GET'])
def mychecklist_admin_items():
    guard = _require_admin()
    if guard:
        return guard
    with db_cursor() as cur:
        cur.execute('SELECT ID, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY SORT_ORDER, ID')
        return jsonify(cur.fetchall())


@mychecklist_bp.route('/mychecklist/admin/items', methods=['POST'])
def mychecklist_admin_item_create():
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    label = (body.get('LABEL') or '').strip()
    if not label:
        return jsonify({'message': '항목 이름을 입력해 주세요.'}), 400
    with db_cursor(commit=True) as cur:
        cur.execute('SELECT COALESCE(MAX(SORT_ORDER), 0) + 1 AS n FROM CHOICHECKLIST_ITEM')
        sort_order = cur.fetchone()['n']
        cur.execute('INSERT INTO CHOICHECKLIST_ITEM (LABEL, SORT_ORDER) VALUES (%s,%s)', (label, sort_order))
        cur.execute('SELECT ID, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY SORT_ORDER, ID')
        return jsonify(cur.fetchall()), 201


@mychecklist_bp.route('/mychecklist/admin/items/<int:item_id>', methods=['PUT'])
def mychecklist_admin_item_update(item_id):
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    label = (body.get('LABEL') or '').strip()
    if not label:
        return jsonify({'message': '항목 이름을 입력해 주세요.'}), 400
    with db_cursor(commit=True) as cur:
        cur.execute('UPDATE CHOICHECKLIST_ITEM SET LABEL=%s WHERE ID=%s', (label, item_id))
        cur.execute('SELECT ID, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY SORT_ORDER, ID')
        return jsonify(cur.fetchall())


@mychecklist_bp.route('/mychecklist/admin/items/<int:item_id>', methods=['DELETE'])
def mychecklist_admin_item_delete(item_id):
    guard = _require_admin()
    if guard:
        return guard
    with db_cursor(commit=True) as cur:
        cur.execute('DELETE FROM CHOICHECKLIST_ITEM WHERE ID=%s', (item_id,))
        cur.execute('DELETE FROM CHOICHECKLIST WHERE ITEM_ID=%s', (item_id,))
        cur.execute('SELECT ID, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY SORT_ORDER, ID')
        return jsonify(cur.fetchall())


# ── 관리자: 구역별 현황판 · 스탬프 · 주 마감 ─────────────────────────────────

@mychecklist_bp.route('/mychecklist/admin/board', methods=['GET'])
def mychecklist_admin_board():
    """구역별로 구분해 사용자별 요일별 체크 현황(개수/전체)과 스탬프 여부를 보여준다."""
    guard = _require_admin()
    if guard:
        return guard
    with db_cursor() as cur:
        cur.execute("SELECT NTT_ID, GU, NAME FROM CHOIMEMBER WHERE ISMISSION='Y' ORDER BY GU, NTT_ID")
        members = cur.fetchall()

        cur.execute('SELECT COUNT(*) AS n FROM CHOICHECKLIST_ITEM')
        total_items = cur.fetchone()['n']

        cur.execute(
            "SELECT NTT_ID, DOW, COUNT(*) AS n FROM CHOICHECKLIST WHERE CHECKED='Y' GROUP BY NTT_ID, DOW"
        )
        checked_map = {}
        for r in cur.fetchall():
            checked_map.setdefault(r['NTT_ID'], {})[r['DOW']] = r['n']

        cur.execute('SELECT NTT_ID, DOW FROM CHOICHECKLIST_STAMP')
        stamped_map = {}
        for r in cur.fetchall():
            stamped_map.setdefault(r['NTT_ID'], set()).add(r['DOW'])

    for m in members:
        days = []
        for dow in DOWS:
            checked = checked_map.get(m['NTT_ID'], {}).get(dow, 0)
            days.append({
                'DOW': dow,
                'checked': checked,
                'total': total_items,
                'stamped': dow in stamped_map.get(m['NTT_ID'], set()),
            })
        m['days'] = days

    return jsonify({'totalItems': total_items, 'members': members, 'today': _today_dow()})


@mychecklist_bp.route('/mychecklist/admin/stamp', methods=['POST'])
def mychecklist_admin_stamp_grant():
    """당일(혹은 지정 요일) 전 항목을 체크한 사용자에게만 스탬프를 부여한다."""
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    ntt_id = body.get('NTT_ID')
    dow = body.get('DOW')
    if not isinstance(ntt_id, int) or dow not in DOWS:
        return jsonify({'message': '잘못된 요청입니다.'}), 400

    with db_cursor(commit=True) as cur:
        cur.execute('SELECT COUNT(*) AS n FROM CHOICHECKLIST_ITEM')
        total = cur.fetchone()['n']
        cur.execute(
            "SELECT COUNT(*) AS n FROM CHOICHECKLIST WHERE NTT_ID=%s AND DOW=%s AND CHECKED='Y'",
            (ntt_id, dow),
        )
        checked = cur.fetchone()['n']
        if total == 0 or checked < total:
            return jsonify({'message': '해당 요일 항목이 전부 체크되지 않았습니다.'}), 400

        cur.execute(
            'INSERT IGNORE INTO CHOICHECKLIST_STAMP (NTT_ID, DOW) VALUES (%s,%s)', (ntt_id, dow)
        )
        return jsonify({'ok': True})


@mychecklist_bp.route('/mychecklist/admin/stamp', methods=['DELETE'])
def mychecklist_admin_stamp_revoke():
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    ntt_id = body.get('NTT_ID')
    dow = body.get('DOW')
    if not isinstance(ntt_id, int) or dow not in DOWS:
        return jsonify({'message': '잘못된 요청입니다.'}), 400
    with db_cursor(commit=True) as cur:
        cur.execute('DELETE FROM CHOICHECKLIST_STAMP WHERE NTT_ID=%s AND DOW=%s', (ntt_id, dow))
        return jsonify({'ok': True})


@mychecklist_bp.route('/mychecklist/admin/close-week', methods=['POST'])
def mychecklist_admin_close_week():
    """이번 주 요일별 체크/스탬프 현황을 인원×요일 단위 요약으로 이력에 남기고 초기화한다."""
    guard = _require_admin()
    if guard:
        return guard
    with db_cursor(commit=True) as cur:
        cur.execute('SELECT CURDATE() AS today')
        today = cur.fetchone()['today']
        week_start = today - datetime.timedelta(days=today.weekday())

        cur.execute("SELECT NTT_ID FROM CHOIMEMBER WHERE ISMISSION='Y'")
        member_ids = [r['NTT_ID'] for r in cur.fetchall()]

        cur.execute('SELECT COUNT(*) AS n FROM CHOICHECKLIST_ITEM')
        total = cur.fetchone()['n']

        cur.execute("SELECT NTT_ID, DOW, COUNT(*) AS n FROM CHOICHECKLIST WHERE CHECKED='Y' GROUP BY NTT_ID, DOW")
        checked_map = {}
        for r in cur.fetchall():
            checked_map.setdefault(r['NTT_ID'], {})[r['DOW']] = r['n']

        cur.execute('SELECT NTT_ID, DOW FROM CHOICHECKLIST_STAMP')
        stamped_map = {}
        for r in cur.fetchall():
            stamped_map.setdefault(r['NTT_ID'], set()).add(r['DOW'])

        for ntt_id in member_ids:
            for dow in DOWS:
                checked = checked_map.get(ntt_id, {}).get(dow, 0)
                stamped = 'Y' if dow in stamped_map.get(ntt_id, set()) else 'N'
                cur.execute(
                    'INSERT INTO CHOICHECKLIST_HISTORY (NTT_ID, WEEK_START, DOW, CHECKED_COUNT, TOTAL_COUNT, STAMPED)'
                    ' VALUES (%s,%s,%s,%s,%s,%s)'
                    ' ON DUPLICATE KEY UPDATE CHECKED_COUNT=%s, TOTAL_COUNT=%s, STAMPED=%s',
                    (ntt_id, week_start, dow, checked, total, stamped, checked, total, stamped),
                )

        cur.execute('DELETE FROM CHOICHECKLIST')
        cur.execute('DELETE FROM CHOICHECKLIST_STAMP')
        return jsonify({'ok': True, 'weekStart': week_start.strftime('%Y-%m-%d')})
