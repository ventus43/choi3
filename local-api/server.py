import os
import json
import uuid
import urllib.request
import urllib.error
from datetime import datetime
import pymysql
from flask import Flask, request, jsonify
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

app = Flask(__name__)

DB = dict(host=os.environ.get('DB_HOST', '127.0.0.1'), port=int(os.environ.get('DB_PORT', 3306)),
          user=os.environ.get('DB_USER', 'choi3'),
          password=os.environ.get('DB_PASS', 'tjdgh2814@@'),
          database=os.environ.get('DB_NAME', 'choi3'),
          charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor,
          init_command="SET time_zone = '+09:00'")  # REG_DT/MOD_DT 등 CURRENT_TIMESTAMP 를 KST 로 저장

def get_conn():
    return pymysql.connect(**DB)


# ── 백오피스 공통 비밀번호 인증 + 세션 만료 ──────────────────────────────────
# 로그인: POST /auth/login {password} → 서명된 토큰 발급.
# 이후: 프론트가 매 요청 헤더(X-Office-Auth)로 토큰을 실어 보냄.
#   - 서명이 틀리거나(위조) 발급 후 SESSION_TTL(기본 30분)이 지나면 401.
#   - 프론트는 401 을 받으면 저장 토큰을 지우고 로그인 화면으로 돌아감.
# 토큰은 stateless(itsdangerous 서명) — 별도 세션 저장소/DB 불필요. 만료 전 강제 폐기는 불가.

OFFICE_PASSWORD = os.environ.get('OFFICE_PASSWORD', 'choi3')
SESSION_TTL     = int(os.environ.get('SESSION_TTL', '1800'))   # 세션 유효시간(초). 1800 = 30분
SESSION_SECRET  = os.environ.get('SESSION_SECRET', 'choi3-office::' + OFFICE_PASSWORD)

_signer = URLSafeTimedSerializer(SESSION_SECRET, salt='office-session')
PUBLIC_PATHS = {'/auth/login'}

def issue_token():
    return _signer.dumps({'ok': True})

def token_valid(token):
    try:
        _signer.loads(token, max_age=SESSION_TTL)
        return True
    except (BadSignature, SignatureExpired):
        return False

@app.before_request
def check_office_auth():
    if request.method == 'OPTIONS':
        return None
    if request.path in PUBLIC_PATHS:
        return None
    if not token_valid(request.headers.get('X-Office-Auth', '')):
        return jsonify({'message': '세션이 만료되었습니다. 다시 로그인해 주세요.'}), 401

@app.route('/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(silent=True) or {}
    if body.get('password') != OFFICE_PASSWORD:
        return jsonify({'message': '비밀번호가 올바르지 않습니다.'}), 401
    return jsonify({'token': issue_token(), 'ttl': SESSION_TTL})


# ── /member  (CHOIMEMBER) ────────────────────────────────────────────────────

@app.route('/member', methods=['GET'])
def member_list():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT NTT_ID, GU, NAME, TA, ISMISSION FROM CHOIMEMBER ORDER BY GU, NTT_ID')
            return jsonify(cur.fetchall())
    finally:
        conn.close()

@app.route('/member', methods=['POST'])
def member_create():
    body = request.get_json(silent=True) or {}
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO CHOIMEMBER (NTT_ID, GU, NAME, TA, ISMISSION) VALUES (%s,%s,%s,%s,%s)',
                # TA: 0=일반 / 1=상담사 / 2=교사 (기본 0)
                (body.get('NTT_ID'), body.get('GU'), body.get('NAME'), body.get('TA', 0), body.get('ISMISSION','N'))
            )
            conn.commit()
            cur.execute('SELECT NTT_ID, GU, NAME, TA, ISMISSION FROM CHOIMEMBER WHERE NTT_ID=%s', (body.get('NTT_ID'),))
            return jsonify(cur.fetchone()), 201
    finally:
        conn.close()

@app.route('/member/<int:ntt_id>', methods=['PUT'])
def member_update(ntt_id):
    body = request.get_json(silent=True) or {}
    sets, vals = [], []
    for col in ('GU','NAME','TA','ISMISSION'):
        if col in body:
            sets.append(f'{col}=%s')
            vals.append(body[col])
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    vals.append(ntt_id)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f'UPDATE CHOIMEMBER SET {",".join(sets)} WHERE NTT_ID=%s', vals)
            conn.commit()
            return jsonify({'ok': True})
    finally:
        conn.close()

@app.route('/member/<int:ntt_id>', methods=['DELETE'])
def member_delete(ntt_id):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM CHOIMEMBER WHERE NTT_ID=%s', (ntt_id,))
            conn.commit()
            return ('', 204)
    finally:
        conn.close()


# ── /outreach  (CHOIHIRE) ────────────────────────────────────────────────────
# 인원: IN_GU/INDO=인도자, SEOM_GU/SEOMGIM=섬김이, GYO_GU/GYOSA=교사
#       사용구역 = IN_GU. 표시구역 = SEOM_GU 있으면 IN_GU+SEOM_GU, 없으면 IN_GU+GYO_GU
#       MEET_DATE=만남 날짜, MEETCN=시간·장소, 1ST/2ND/3RD=TM차수,
#       PRG=선택('')/진행/중단, STATUS=S0~S4, DEL_YN='Y'면 숨김

def _num(v):
    return str(v) if v is not None else ''

def _zone_display(row):
    in_gu = '' if row['IN_GU'] is None else str(row['IN_GU'])
    if row['SEOM_GU'] is not None:
        return '+'.join(v for v in (in_gu, str(row['SEOM_GU'])) if v)
    if row['GYO_GU'] is not None:
        return '+'.join(v for v in (in_gu, str(row['GYO_GU'])) if v)
    return in_gu

def hire_to_outreach(row):
    return {
        'id':       row['NTT_ID'],
        'name':     row['NAME'] or '',
        'inGu':     _num(row['IN_GU']),
        'indo':     row['INDO'] or '',
        'sumGu':    _num(row['SEOM_GU']),
        'seomgim':  row['SEOMGIM'] or '',
        'gyoGu':    _num(row['GYO_GU']),
        'gyosa':    row['GYOSA'] or '',
        'zone':     _zone_display(row),
        'zoneMain': _num(row['IN_GU']),
        'meetDate': row['MEET_DATE'] or '',
        'regDt':    row['REG_DT'].strftime('%Y-%m-%d %H:%M:%S') if row.get('REG_DT') else '',
        'meetCn':   row.get('MEETCN') or '',
        'tmName':   row.get('REMARK') or '',
        'tm1':      row.get('1ST') or '',
        'tm2':      row.get('2ND') or '',
        'tm3':      row.get('3RD') or '',
        'prg':      row['PRG'] or '',
        'status':   row['STATUS'] or '',
        'ct':       _num(row.get('CT')),
    }

@app.route('/outreach', methods=['GET'])
def outreach_list():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM CHOIHIRE WHERE DEL_YN = 'N' ORDER BY NTT_ID DESC")
            return jsonify([hire_to_outreach(r) for r in cur.fetchall()])
    finally:
        conn.close()

@app.route('/outreach', methods=['POST'])
def outreach_create():
    body = request.get_json(silent=True) or {}
    # 날짜 없이 등록되면 첫만남(SEQ=1)에 날짜가 안 잡혀서, 이후 "다음 만남 추가" 제약(첫만남 날짜 필요)에
    # 무조건 걸리게 됨 — 등록 시점에 필수로 막음(프론트 검증과 별개로 API 직접 호출도 방어).
    if not body.get('meetDate'):
        return jsonify({'message': '날짜는 필수 입력입니다.'}), 400
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO CHOIHIRE (NAME, IN_GU, GYO_GU, REMARK, MEET_DATE, MEETCN)'
                ' VALUES (%s,%s,%s,%s,%s,%s)',
                (body.get('name'),
                 body.get('inGu') or None,
                 body.get('gyoGu') or None,
                 body.get('tmName') or None,
                 body.get('meetDate'), body.get('meetCn'))
            )
            new_id = cur.lastrowid
            # 섭외자 등록 시 1차 만남을 함께 생성 (섭외자ID + 날짜 + 시간·장소)
            cur.execute(
                'INSERT INTO CHOIMEETSCHEDULE (HIREID, SEQ, MEET_DT, MEETCN, GOAL)'
                ' VALUES (%s, 1, %s, %s, %s)',
                (new_id, body.get('meetDate') or None, body.get('meetCn'), body.get('goal'))
            )
            conn.commit()
            cur.execute('SELECT * FROM CHOIHIRE WHERE NTT_ID=%s', (new_id,))
            return jsonify(hire_to_outreach(cur.fetchone())), 201
    finally:
        conn.close()

@app.route('/outreach/<int:ntt_id>', methods=['PATCH'])
def outreach_update(ntt_id):
    body = request.get_json(silent=True) or {}

    # MEETCN(시간·장소) 누적 추가
    if 'appendMeet' in body:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT MEETCN FROM CHOIHIRE WHERE NTT_ID=%s', (ntt_id,))
                row = cur.fetchone()
                if not row:
                    return jsonify({'message': '없음'}), 404
                cur_val  = row['MEETCN'] or ''
                new_val  = f"{cur_val}|{body['appendMeet']}" if cur_val else body['appendMeet']
                cur.execute('UPDATE CHOIHIRE SET MEETCN=%s WHERE NTT_ID=%s', (new_val, ntt_id))
                conn.commit()
                return jsonify({'ok': True})
        finally:
            conn.close()

    col_map = {
        'name': 'NAME',
        'inGu': 'IN_GU', 'indo': 'INDO',
        'sumGu': 'SEOM_GU', 'seomgim': 'SEOMGIM',
        'gyoGu': 'GYO_GU', 'gyosa': 'GYOSA',
        'meetDate': 'MEET_DATE', 'meetCn': 'MEETCN',
        'tmName': 'REMARK',
        'tm1': '1ST', 'tm2': '2ND', 'tm3': '3RD',
        'prg': 'PRG', 'status': 'STATUS', 'ct': 'CT',
    }
    int_cols = {'IN_GU', 'SEOM_GU', 'GYO_GU', 'CT'}
    sets, vals = [], []
    for fk, col in col_map.items():
        if fk in body:
            sets.append(f'`{col}`=%s')
            v = body[fk]
            if v == '' or (col in int_cols and v in ('', None)):
                v = None
            vals.append(v)
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    vals.append(ntt_id)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f'UPDATE CHOIHIRE SET {",".join(sets)} WHERE NTT_ID=%s', vals)
            conn.commit()
            return jsonify({'ok': True})
    finally:
        conn.close()

@app.route('/outreach/<int:ntt_id>', methods=['DELETE'])
def outreach_delete(ntt_id):
    # 물리 삭제 대신 숨김 처리(soft delete)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE CHOIHIRE SET DEL_YN='Y' WHERE NTT_ID=%s", (ntt_id,))
            conn.commit()
            return ('', 204)
    finally:
        conn.close()


# ── /check  (CHOIHIRE read-only, different view) ─────────────────────────────
# TM 현황에는 "진행 여부 = 선택" 인원만 노출한다.
# PRG=선택('' 또는 NULL) / 진행 / 중단 이므로, 진행·중단이 아닌 인원만 조회.

def hire_to_check(row):
    return {
        'date':   row['MEET_DATE'] or '',
        'zone':   str(row['IN_GU']) if row['IN_GU'] is not None else '',
        'name':   row['NAME'] or '',
        'tm':     'O' if row['PRG'] == 'O' else '',
        'check1': row.get('1ST') or '',
        'check2': row.get('2ND') or '',
        'check3': row.get('3RD') or '',
        'status': row['STATUS'] or '진행',
        'note':   row['COMMENT'] or '',
    }

@app.route('/check', methods=['GET'])
def check_list():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM CHOIHIRE"
                " WHERE DEL_YN = 'N'"
                "   AND (PRG IS NULL OR PRG NOT IN ('진행', '중단'))"
                " ORDER BY MEET_DATE DESC"
            )
            return jsonify([hire_to_check(r) for r in cur.fetchall()])
    finally:
        conn.close()


# ── /schedule  (CHOIHIRE 뷰: NAME/COMMENT=목표/MEET_DATE/MEETCN) ──────────────
# 일정 = MEET_DATE 가 잡힌 섭외자. 중단(PRG='중단') 인원은 제외.

def hire_to_schedule(row):
    return {
        'id':       row['NTT_ID'],
        'name':     row['NAME']    or '',
        'comment':  row['COMMENT'] or '',
        'meetDate': row['MEET_DATE'] or '',
        'meetCn':   row['MEETCN']  or '',
    }

@app.route('/schedule', methods=['GET'])
def schedule_list():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM CHOIHIRE"
                " WHERE DEL_YN = 'N' AND MEET_DATE IS NOT NULL AND MEET_DATE <> ''"
                "   AND (PRG IS NULL OR PRG <> '중단')"
                " ORDER BY MEET_DATE, NTT_ID"
            )
            return jsonify([hire_to_schedule(r) for r in cur.fetchall()])
    finally:
        conn.close()

@app.route('/schedule', methods=['POST'])
def schedule_create():
    body = request.get_json(silent=True) or {}
    ntt_id = body.get('id')
    if not ntt_id:
        return jsonify({'message': '대상자를 선택하세요'}), 400
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE CHOIHIRE SET COMMENT=%s, MEET_DATE=%s, MEETCN=%s WHERE NTT_ID=%s',
                (body.get('comment'), body.get('meetDate'), body.get('meetCn'), ntt_id)
            )
            conn.commit()
            cur.execute('SELECT * FROM CHOIHIRE WHERE NTT_ID=%s', (ntt_id,))
            return jsonify(hire_to_schedule(cur.fetchone())), 201
    finally:
        conn.close()

@app.route('/schedule/<int:sid>', methods=['DELETE'])
def schedule_delete(sid):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE CHOIHIRE SET COMMENT=NULL, MEET_DATE=NULL, MEETCN=NULL WHERE NTT_ID=%s',
                (sid,)
            )
            conn.commit()
            return ('', 204)
    finally:
        conn.close()


# ── /outreach/<hire>/meetings  (CHOIMEETSCHEDULE) ───────────────────────────
# 섭외자별 만남 스케줄. SEQ=회차, MEETYN=만남여부, FEEDBACKYN=피드백여부,
# CANCELRS=취소사유(있으면 취소된 만남).

def meet_to_json(row):
    return {
        'id':         row['NTT_ID'],
        'hireId':     row['HIREID'],
        'seq':        row['SEQ'],
        'meetDt':     row['MEET_DT'].strftime('%Y-%m-%d') if row.get('MEET_DT') else '',
        'meetCn':     row['MEETCN'] or '',
        'goal':       row['GOAL'] or '',
        'feedbackYn': row['FEEDBACKYN'] or 'N',
        'meetYn':     row['MEETYN'] or 'N',
        'cancelRs':   row['CANCELRS'] or '',
        'regDt':      row['REG_DT'].strftime('%Y-%m-%d %H:%M:%S') if row.get('REG_DT') else '',
        'modDt':      row['MOD_DT'].strftime('%Y-%m-%d %H:%M:%S') if row.get('MOD_DT') else '',
    }

_MEET_HIRE_JOIN = (
    "SELECT m.*, h.NAME AS HIRE_NAME, h.IN_GU, h.SEOM_GU, h.GYO_GU,"
    "       h.INDO, h.SEOMGIM, h.GYOSA, h.PRG"
    " FROM CHOIMEETSCHEDULE m"
    " LEFT JOIN CHOIHIRE h ON h.NTT_ID = m.HIREID"
)

def meeting_with_hire_to_json(row):
    d = meet_to_json(row)
    d['hireName']   = row.get('HIRE_NAME') or ''
    d['zone']       = _zone_display(row)
    d['indo']       = row.get('INDO') or ''
    d['seomgim']    = row.get('SEOMGIM') or ''
    d['gyosa']      = row.get('GYOSA') or ''
    d['meetPerson'] = row.get('SEOMGIM') or row.get('INDO') or ''  # 만남자: 섬김이 우선, 없으면 인도자
    return d

def _date_range():
    """쿼리스트링 from / to (YYYY-MM-DD). 둘 다 있으면 (기간필터 SQL, params) 반환, 아니면 (None, [])."""
    frm = (request.args.get('from') or '').strip()
    to  = (request.args.get('to') or '').strip()
    if frm and to:
        return ' AND m.MEET_DT BETWEEN %s AND %s', [frm, to]
    return None, []

@app.route('/meetings/upcoming', methods=['GET'])
def meeting_upcoming():
    # 기본: 어제(-1일) ~ 이후 2주(+14일). from/to 쿼리로 기간 지정 가능.
    rng_sql, rng_params = _date_range()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            where = " WHERE m.DEL_YN = 'N' AND m.MEET_DT IS NOT NULL"
            if rng_sql:
                where += rng_sql
            else:
                where += ("   AND m.MEET_DT BETWEEN (CURDATE() - INTERVAL 1 DAY)"
                          "                     AND (CURDATE() + INTERVAL 14 DAY)")
            cur.execute(_MEET_HIRE_JOIN + where + " ORDER BY m.MEET_DT, m.SEQ, m.NTT_ID", rng_params)
            return jsonify([meeting_with_hire_to_json(r) for r in cur.fetchall()])
    finally:
        conn.close()

@app.route('/meetings/schedule', methods=['GET'])
def meeting_schedule():
    # 날짜가 잡힌 모든 만남 + 아직 날짜 없는 첫만남(SEQ=1). 중단(PRG='중단') 섭외자 제외.
    # 기본은 기간 제한 없음. from/to 쿼리로 지정 시 그 기간의 만남만.
    rng_sql, rng_params = _date_range()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            where = (" WHERE m.DEL_YN = 'N' AND h.DEL_YN = 'N'"
                     "   AND (h.PRG IS NULL OR h.PRG <> '중단')")
            if rng_sql:
                where += rng_sql
            else:
                where += "   AND (m.SEQ = 1 OR m.MEET_DT IS NOT NULL)"
            cur.execute(_MEET_HIRE_JOIN + where + " ORDER BY m.MEET_DT, m.SEQ, m.NTT_ID", rng_params)
            return jsonify([meeting_with_hire_to_json(r) for r in cur.fetchall()])
    finally:
        conn.close()

@app.route('/outreach/<int:hire_id>/meetings', methods=['GET'])
def meeting_list(hire_id):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM CHOIMEETSCHEDULE WHERE HIREID=%s AND DEL_YN='N'"
                ' ORDER BY SEQ, NTT_ID',
                (hire_id,)
            )
            return jsonify([meet_to_json(r) for r in cur.fetchall()])
    finally:
        conn.close()

@app.route('/outreach/<int:hire_id>/meetings', methods=['POST'])
def meeting_create(hire_id):
    body = request.get_json(silent=True) or {}
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 첫만남(SEQ=1)에 날짜가 없으면 다음 만남을 추가할 수 없음 — 먼저 첫만남 일정을 수정해야 함.
            cur.execute(
                "SELECT MEET_DT FROM CHOIMEETSCHEDULE WHERE HIREID=%s AND SEQ=1 AND DEL_YN='N'",
                (hire_id,)
            )
            first = cur.fetchone()
            if first is not None and not first['MEET_DT']:
                return jsonify({'message': '첫만남 일정에 날짜가 없습니다. 첫만남 일정을 먼저 수정해 주세요.'}), 400

            seq = body.get('seq')
            if not seq:
                cur.execute(
                    'SELECT COALESCE(MAX(SEQ), 0) + 1 AS n FROM CHOIMEETSCHEDULE WHERE HIREID=%s',
                    (hire_id,)
                )
                seq = cur.fetchone()['n']
            cur.execute(
                'INSERT INTO CHOIMEETSCHEDULE'
                ' (HIREID, SEQ, MEET_DT, MEETCN, GOAL, FEEDBACKYN, MEETYN, CANCELRS)'
                ' VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
                (hire_id, seq, body.get('meetDt') or None, body.get('meetCn'), body.get('goal'),
                 body.get('feedbackYn') or 'N', body.get('meetYn') or 'N',
                 body.get('cancelRs'))
            )
            conn.commit()
            cur.execute('SELECT * FROM CHOIMEETSCHEDULE WHERE NTT_ID=%s', (cur.lastrowid,))
            return jsonify(meet_to_json(cur.fetchone())), 201
    finally:
        conn.close()

@app.route('/meetings/<int:mid>', methods=['PATCH'])
def meeting_update(mid):
    body = request.get_json(silent=True) or {}
    col_map = {
        'seq': 'SEQ', 'meetDt': 'MEET_DT', 'meetCn': 'MEETCN', 'goal': 'GOAL',
        'feedbackYn': 'FEEDBACKYN', 'meetYn': 'MEETYN', 'cancelRs': 'CANCELRS',
    }
    sets, vals = [], []
    for fk, col in col_map.items():
        if fk in body:
            sets.append(f'{col}=%s')
            v = body[fk]
            vals.append(v if v != '' else None)
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    vals.append(mid)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f'UPDATE CHOIMEETSCHEDULE SET {",".join(sets)} WHERE NTT_ID=%s', vals)
            conn.commit()
            return jsonify({'ok': True})
    finally:
        conn.close()

@app.route('/meetings/<int:mid>', methods=['DELETE'])
def meeting_delete(mid):
    # 이력 보존 위해 물리 삭제 대신 숨김 처리
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE CHOIMEETSCHEDULE SET DEL_YN='Y' WHERE NTT_ID=%s", (mid,))
            conn.commit()
            return ('', 204)
    finally:
        conn.close()


# ── /screenshot  (탭 화면 캡처 → 텔레그램 전송) ──────────────────────────────
# 프론트가 만든 PNG 를 받아 텔레그램 방으로 전송한다.
# 운영에서는 아래 값을 환경변수로 덮어쓸 것 (choi3.env 등).
TELEGRAM_BOT_TOKEN       = os.environ.get('TELEGRAM_BOT_TOKEN', '8231818005:AAHTZz07GMXJdxWmA2K21lyLfPhQsr2NsDQ')
TELEGRAM_SCREENSHOT_CHAT = os.environ.get('TELEGRAM_SCREENSHOT_CHAT', '-5464033116')


def _telegram_upload(method, field, caption, data, content_type='image/png'):
    """stdlib 만으로 multipart/form-data 업로드. Telegram 응답(dict) 반환."""
    boundary = 'choi3-' + uuid.uuid4().hex
    text_parts = ''.join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'
        for name, value in (('chat_id', str(TELEGRAM_SCREENSHOT_CHAT)), ('caption', caption))
    ).encode('utf-8')
    file_head = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; '
        f'filename="screenshot.png"\r\nContent-Type: {content_type}\r\n\r\n'
    ).encode('utf-8')
    body = text_parts + file_head + data + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    req = urllib.request.Request(
        f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode('utf-8'))
        except Exception:
            return {'ok': False, 'description': f'HTTP {e.code}'}
    except Exception as e:
        return {'ok': False, 'description': str(e)}


@app.route('/screenshot', methods=['POST'])
def screenshot_send():
    f = request.files.get('image')
    if f is None:
        return jsonify({'message': '이미지가 없습니다.'}), 400
    data = f.read()
    if not data:
        return jsonify({'message': '빈 이미지입니다.'}), 400

    label   = (request.form.get('label') or '화면').strip()
    caption = f'📷 {label}\n{datetime.now().strftime("%Y-%m-%d %H:%M")}'

    # 사진(sendPhoto)으로 먼저 시도 → 치수·용량 초과 등 실패 시 문서로 재시도
    res = _telegram_upload('sendPhoto', 'photo', caption, data)
    if not res.get('ok'):
        res = _telegram_upload('sendDocument', 'document', caption, data)
    if not res.get('ok'):
        return jsonify({'message': res.get('description', '텔레그램 전송 실패')}), 502
    return jsonify({'ok': True})


if __name__ == '__main__':
    print('Local API running on http://localhost:8080')
    app.run(host='0.0.0.0', port=8081, debug=True)
