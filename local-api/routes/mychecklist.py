"""/mychecklist  — 사명자(ISMISSION='Y') 체크리스트. 관리시스템(choi3 SPA) 밖의
독립 공개 페이지(public/c0p3X0jZsu.html) 전용 API — 본프로젝트 백오피스 인증(X-Office-Auth)과
완전히 분리되어 있다(auth.EXEMPT_PREFIXES 에 등록, 이 블루프린트 전체가 무인증으로 열려 있음).

체크 항목은 요일별로 완전히 분리돼 있다 — 항목(CHOICHECKLIST_ITEM)이 자기 DOW를 갖고 있다.

체크/스탬프는 실제 캘린더 날짜(CHK_DATE/STAMP_DATE) 기준으로 기록된다 — "이번 주 마감" 같은
수동 초기화가 필요 없다. 화면엔 "이번 주(월~일)"가 아무 요일이나 체크할 수 있게 나오지만
(다른 요일 체크 = 캐치업), 저장될 땐 그 요일이 속한 이번 주의 실제 날짜로 기록되고, 다음 주가
되면 같은 요일이라도 날짜가 달라져 자동으로 새로 시작된다. "오늘"의 기준은 KST 이지만 하루
경계는 자정이 아니라 오전 10시다(그 전엔 전날로 취급) — 이른 아침 항목(예: 아침 기도회) 때문에
자정 컷오프면 애매해지는 걸 피하기 위함.

접근 두 갈래:
  - 사용자: 이름을 입력해 본인을 찾고, 본인 체크를 직접 토글한다. 인증 없음.
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
_KST = datetime.timezone(datetime.timedelta(hours=9))
_DAY_CUTOFF_HOUR = 10   # KST 오전 10시 이전은 "전날"로 취급
_CHECK_DEADLINE_HOUR = 1   # 체크 마감: 그 날짜(CHK_DATE) 다음날 KST 오전 1시가 지나면 체크/해제 불가
                           # (예: 수요일 항목은 목요일 오전 1시 이후 잠김)


def _checklist_today():
    """체크리스트 기준 '오늘' 날짜 — KST, 오전 10시 컷오프."""
    now = datetime.datetime.now(_KST)
    d = now.date()
    if now.hour < _DAY_CUTOFF_HOUR:
        d -= datetime.timedelta(days=1)
    return d


def _check_deadline_passed(chk_date):
    """그 날짜 체크/해제가 더 이상 허용되지 않는지 — 다음날 오전 1시 마감."""
    deadline = datetime.datetime.combine(
        chk_date + datetime.timedelta(days=1), datetime.time(_CHECK_DEADLINE_HOUR, 0), tzinfo=_KST,
    )
    return datetime.datetime.now(_KST) >= deadline


def _week_start(d):
    """d가 속한 주의 월요일."""
    return d - datetime.timedelta(days=d.weekday())


def _date_for_dow(dow, base_date=None):
    """base_date(기본: 체크리스트 기준 오늘)가 속한 주 안에서 그 요일(dow)의 실제 날짜."""
    base = base_date or _checklist_today()
    return _week_start(base) + datetime.timedelta(days=dow - 1)


def _today_dow():
    return _checklist_today().isoweekday()


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

        # 빈 라벨(관리자가 아직 채우지 않은 기본 슬롯)은 사용자에게 체크할 게 없으니 아예 안 보여준다
        # — total 계산에도 빠져야 나머지 항목만으로도 스탬프(전체 완료) 달성이 가능해진다.
        cur.execute("SELECT ID, DOW, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM WHERE LABEL<>'' ORDER BY DOW, SORT_ORDER, ID")
        items = cur.fetchall()

        week_dates = [_date_for_dow(dow) for dow in DOWS]
        placeholders = ','.join(['%s'] * len(week_dates))

        cur.execute(
            f'SELECT ITEM_ID, CHECKED FROM CHOICHECKLIST WHERE NTT_ID=%s AND CHK_DATE IN ({placeholders})',
            (ntt_id, *week_dates),
        )
        state = cur.fetchall()

        cur.execute(
            f'SELECT DOW FROM CHOICHECKLIST_STAMP WHERE NTT_ID=%s AND STAMP_DATE IN ({placeholders})',
            (ntt_id, *week_dates),
        )
        stamped = [r['DOW'] for r in cur.fetchall()]

        locked = [dow for dow, d in zip(DOWS, week_dates) if _check_deadline_passed(d)]
        return jsonify({'member': member, 'items': items, 'state': state, 'stamped': stamped, 'today': _today_dow(), 'locked': locked})


@mychecklist_bp.route('/mychecklist/<int:ntt_id>/check', methods=['PUT'])
def mychecklist_check(ntt_id):
    """본인 체크 토글 — 무인증(이름으로 본인을 찾은 사용자가 직접 체크).
    항목의 요일(DOW)이 속한 이번 주의 실제 날짜(CHK_DATE)로 기록한다."""
    body = request.get_json(silent=True) or {}
    item_id = body.get('ITEM_ID')
    checked = 'Y' if body.get('CHECKED') else 'N'
    if not isinstance(item_id, int):
        return jsonify({'message': '잘못된 요청입니다.'}), 400

    with db_cursor(commit=True) as cur:
        cur.execute("SELECT NTT_ID FROM CHOIMEMBER WHERE ISMISSION='Y' AND NTT_ID=%s", (ntt_id,))
        if not cur.fetchone():
            return jsonify({'message': '대상을 찾을 수 없습니다.'}), 404
        cur.execute('SELECT DOW FROM CHOICHECKLIST_ITEM WHERE ID=%s', (item_id,))
        item = cur.fetchone()
        if not item:
            return jsonify({'message': '존재하지 않는 항목입니다.'}), 400
        chk_date = _date_for_dow(item['DOW'])
        if _check_deadline_passed(chk_date):
            return jsonify({'message': '마감 시간(새벽 1시)이 지나 체크할 수 없습니다.'}), 403

        cur.execute(
            'INSERT INTO CHOICHECKLIST (NTT_ID, ITEM_ID, CHK_DATE, CHECKED) VALUES (%s,%s,%s,%s)'
            ' ON DUPLICATE KEY UPDATE CHECKED=%s',
            (ntt_id, item_id, chk_date, checked, checked),
        )
        return jsonify({'ok': True})


@mychecklist_bp.route('/mychecklist/<int:ntt_id>/history', methods=['GET'])
def mychecklist_history(ntt_id):
    """'이전주차요약' 버튼용 — 지난주(이번 주 이전 월~일) 요일별 요약(체크 개수/전체/스탬프).
    체크/스탬프가 이제 날짜 기반이라 마감 여부와 무관하게 항상 계산할 수 있다."""
    last_week_start = _week_start(_checklist_today()) - datetime.timedelta(days=7)
    week_dates = [last_week_start + datetime.timedelta(days=i) for i in range(7)]
    placeholders = ','.join(['%s'] * 7)

    with db_cursor() as cur:
        cur.execute("SELECT ID, DOW FROM CHOICHECKLIST_ITEM WHERE LABEL<>''")
        item_dow = {}
        total_by_dow = {}
        for r in cur.fetchall():
            item_dow[r['ID']] = r['DOW']
            total_by_dow[r['DOW']] = total_by_dow.get(r['DOW'], 0) + 1

        cur.execute(
            f"SELECT ITEM_ID FROM CHOICHECKLIST WHERE NTT_ID=%s AND CHECKED='Y' AND CHK_DATE IN ({placeholders})",
            (ntt_id, *week_dates),
        )
        checked_by_dow = {}
        for r in cur.fetchall():
            dow = item_dow.get(r['ITEM_ID'])
            if dow is None:
                continue
            checked_by_dow[dow] = checked_by_dow.get(dow, 0) + 1

        cur.execute(
            f"SELECT DOW FROM CHOICHECKLIST_STAMP WHERE NTT_ID=%s AND STAMP_DATE IN ({placeholders})",
            (ntt_id, *week_dates),
        )
        stamped_dows = {r['DOW'] for r in cur.fetchall()}

    days = [{
        'DOW': dow,
        'CHECKED_COUNT': checked_by_dow.get(dow, 0),
        'TOTAL_COUNT': total_by_dow.get(dow, 0),
        'STAMPED': 'Y' if dow in stamped_dows else 'N',
    } for dow in DOWS]
    return jsonify({'weekStart': last_week_start.strftime('%Y-%m-%d'), 'days': days})


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


# ── 관리자: 요일별 항목 관리 ─────────────────────────────────────────────────

@mychecklist_bp.route('/mychecklist/admin/items', methods=['GET'])
def mychecklist_admin_items():
    guard = _require_admin()
    if guard:
        return guard
    with db_cursor() as cur:
        cur.execute('SELECT ID, DOW, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY DOW, SORT_ORDER, ID')
        return jsonify(cur.fetchall())


@mychecklist_bp.route('/mychecklist/admin/items', methods=['POST'])
def mychecklist_admin_item_create():
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    dow = body.get('DOW')
    label = (body.get('LABEL') or '').strip()
    if dow not in DOWS:
        return jsonify({'message': '잘못된 요일입니다.'}), 400
    with db_cursor(commit=True) as cur:
        cur.execute('SELECT COALESCE(MAX(SORT_ORDER), 0) + 1 AS n FROM CHOICHECKLIST_ITEM WHERE DOW=%s', (dow,))
        sort_order = cur.fetchone()['n']
        cur.execute(
            'INSERT INTO CHOICHECKLIST_ITEM (DOW, LABEL, SORT_ORDER) VALUES (%s,%s,%s)',
            (dow, label, sort_order),
        )
        cur.execute('SELECT ID, DOW, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY DOW, SORT_ORDER, ID')
        return jsonify(cur.fetchall()), 201


@mychecklist_bp.route('/mychecklist/admin/items/<int:item_id>', methods=['PUT'])
def mychecklist_admin_item_update(item_id):
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    label = (body.get('LABEL') or '').strip()
    with db_cursor(commit=True) as cur:
        cur.execute('UPDATE CHOICHECKLIST_ITEM SET LABEL=%s WHERE ID=%s', (label, item_id))
        cur.execute('SELECT ID, DOW, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY DOW, SORT_ORDER, ID')
        return jsonify(cur.fetchall())


@mychecklist_bp.route('/mychecklist/admin/items/<int:item_id>', methods=['DELETE'])
def mychecklist_admin_item_delete(item_id):
    guard = _require_admin()
    if guard:
        return guard
    with db_cursor(commit=True) as cur:
        cur.execute('DELETE FROM CHOICHECKLIST_ITEM WHERE ID=%s', (item_id,))
        cur.execute('DELETE FROM CHOICHECKLIST WHERE ITEM_ID=%s', (item_id,))
        cur.execute('SELECT ID, DOW, LABEL, SORT_ORDER FROM CHOICHECKLIST_ITEM ORDER BY DOW, SORT_ORDER, ID')
        return jsonify(cur.fetchall())


# ── 관리자: 구역별 현황판 · 스탬프 · 기간별 달성 현황 ────────────────────────

@mychecklist_bp.route('/mychecklist/admin/board', methods=['GET'])
def mychecklist_admin_board():
    """구역별로 구분해 사용자별 요일별 체크 현황(개수/전체)과 스탬프 여부를 보여준다.
    항목이 요일별로 다르므로 요일별 전체 개수(total)도 요일마다 다르게 계산한다.
    조회 범위는 이번 주(월~일)의 실제 날짜들로 한정한다."""
    guard = _require_admin()
    if guard:
        return guard
    week_dates = [_date_for_dow(dow) for dow in DOWS]
    placeholders = ','.join(['%s'] * len(week_dates))

    with db_cursor() as cur:
        cur.execute("SELECT NTT_ID, GU, NAME FROM CHOIMEMBER WHERE ISMISSION='Y' ORDER BY GU, NTT_ID")
        members = cur.fetchall()

        cur.execute("SELECT ID, DOW FROM CHOICHECKLIST_ITEM WHERE LABEL<>''")
        item_dow = {}          # item_id -> dow
        total_by_dow = {}      # dow -> 항목 개수
        for r in cur.fetchall():
            item_dow[r['ID']] = r['DOW']
            total_by_dow[r['DOW']] = total_by_dow.get(r['DOW'], 0) + 1

        cur.execute(
            f"SELECT NTT_ID, ITEM_ID FROM CHOICHECKLIST WHERE CHECKED='Y' AND CHK_DATE IN ({placeholders})",
            week_dates,
        )
        checked_map = {}        # ntt_id -> {dow: count}
        for r in cur.fetchall():
            dow = item_dow.get(r['ITEM_ID'])
            if dow is None:
                continue
            checked_map.setdefault(r['NTT_ID'], {})
            checked_map[r['NTT_ID']][dow] = checked_map[r['NTT_ID']].get(dow, 0) + 1

        cur.execute(
            f"SELECT NTT_ID, DOW FROM CHOICHECKLIST_STAMP WHERE STAMP_DATE IN ({placeholders})",
            week_dates,
        )
        stamped_map = {}
        for r in cur.fetchall():
            stamped_map.setdefault(r['NTT_ID'], set()).add(r['DOW'])

    for m in members:
        days = []
        for dow in DOWS:
            total = total_by_dow.get(dow, 0)
            checked = checked_map.get(m['NTT_ID'], {}).get(dow, 0)
            days.append({
                'DOW': dow,
                'checked': checked,
                'total': total,
                'stamped': dow in stamped_map.get(m['NTT_ID'], set()),
            })
        m['days'] = days

    return jsonify({'members': members, 'today': _today_dow()})


@mychecklist_bp.route('/mychecklist/admin/history-range', methods=['GET'])
def mychecklist_admin_history_range():
    """기간(from~to) 달성 현황 — CHOICHECKLIST/CHOICHECKLIST_STAMP 가 이제 날짜 기반이라
    마감 여부와 무관하게 그 기간에 실제로 존재한 날짜들을 직접 집계한다."""
    guard = _require_admin()
    if guard:
        return guard
    frm = (request.args.get('from') or '').strip()
    to = (request.args.get('to') or '').strip()
    if not frm or not to:
        return jsonify({'message': '조회 기간(from, to)을 지정해 주세요.'}), 400
    with db_cursor() as cur:
        cur.execute(
            "WITH RECURSIVE dates AS ("
            "  SELECT CAST(%s AS DATE) AS d"
            "  UNION ALL"
            "  SELECT d + INTERVAL 1 DAY FROM dates WHERE d < CAST(%s AS DATE)"
            "),"
            " day_totals AS ("
            "  SELECT dates.d AS d, COUNT(i.ID) AS total"
            "  FROM dates"
            "  LEFT JOIN CHOICHECKLIST_ITEM i ON i.DOW = WEEKDAY(dates.d) + 1 AND i.LABEL <> ''"
            "  GROUP BY dates.d"
            "),"
            " checked_by_day AS ("
            "  SELECT c.NTT_ID, c.CHK_DATE AS d, COUNT(*) AS n"
            "  FROM CHOICHECKLIST c JOIN CHOICHECKLIST_ITEM i ON i.ID = c.ITEM_ID"
            "  WHERE c.CHECKED='Y' AND i.LABEL<>'' AND c.CHK_DATE BETWEEN %s AND %s"
            "  GROUP BY c.NTT_ID, c.CHK_DATE"
            ")"
            " SELECT m.NTT_ID, m.NAME, m.GU,"
            "        SUM(dt.total) AS TOTAL_SUM,"
            "        SUM(COALESCE(cb.n, 0)) AS CHECKED_SUM,"
            "        (SELECT COUNT(*) FROM CHOICHECKLIST_STAMP s"
            "          WHERE s.NTT_ID = m.NTT_ID AND s.STAMP_DATE BETWEEN %s AND %s) AS STAMP_COUNT,"
            "        COUNT(*) AS DAY_COUNT"
            " FROM CHOIMEMBER m"
            " CROSS JOIN day_totals dt"
            " LEFT JOIN checked_by_day cb ON cb.NTT_ID = m.NTT_ID AND cb.d = dt.d"
            " WHERE m.ISMISSION='Y'"
            " GROUP BY m.NTT_ID, m.NAME, m.GU"
            " HAVING TOTAL_SUM > 0"
            " ORDER BY m.GU, m.NAME",
            (frm, to, frm, to, frm, to),
        )
        return jsonify(cur.fetchall())


@mychecklist_bp.route('/mychecklist/admin/stamp', methods=['POST'])
def mychecklist_admin_stamp_grant():
    """지정 요일(이번 주 실제 날짜) 전 항목을 체크한 사용자에게만 스탬프를 부여한다."""
    guard = _require_admin()
    if guard:
        return guard
    body = request.get_json(silent=True) or {}
    ntt_id = body.get('NTT_ID')
    dow = body.get('DOW')
    if not isinstance(ntt_id, int) or dow not in DOWS:
        return jsonify({'message': '잘못된 요청입니다.'}), 400
    stamp_date = _date_for_dow(dow)

    with db_cursor(commit=True) as cur:
        # 빈 라벨 항목은 total에서 제외 — mychecklist_detail에서도 사용자에게 안 보여주므로 체크 대상이 아니다.
        cur.execute("SELECT COUNT(*) AS n FROM CHOICHECKLIST_ITEM WHERE DOW=%s AND LABEL<>''", (dow,))
        total = cur.fetchone()['n']
        cur.execute(
            "SELECT COUNT(*) AS n FROM CHOICHECKLIST c JOIN CHOICHECKLIST_ITEM i ON i.ID=c.ITEM_ID"
            " WHERE c.NTT_ID=%s AND c.CHK_DATE=%s AND i.LABEL<>'' AND c.CHECKED='Y'",
            (ntt_id, stamp_date),
        )
        checked = cur.fetchone()['n']
        if total == 0 or checked < total:
            return jsonify({'message': '해당 요일 항목이 전부 체크되지 않았습니다.'}), 400

        cur.execute(
            'INSERT IGNORE INTO CHOICHECKLIST_STAMP (NTT_ID, DOW, STAMP_DATE) VALUES (%s,%s,%s)',
            (ntt_id, dow, stamp_date),
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
    stamp_date = _date_for_dow(dow)
    with db_cursor(commit=True) as cur:
        cur.execute('DELETE FROM CHOICHECKLIST_STAMP WHERE NTT_ID=%s AND STAMP_DATE=%s', (ntt_id, stamp_date))
        return jsonify({'ok': True})
