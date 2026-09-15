"""/reports  (CHOIREPORT) — 주일예배 구역별 자동분석(7Ius67Cp) 결과 저장.

본프로젝트(choi3 백오피스) 로그인과 완전히 분리된 별도 인증 영역이다.
X-Office-Auth 토큰으로는 이 아래 라우트에 접근할 수 없고, 반대로 여기서 발급한
X-Report-Auth 토큰으로는 /outreach, /meetings 등 다른 라우트에 접근할 수 없다
(auth.require_auth 의 EXEMPT_PREFIXES 참고).
"""
import json

from flask import Blueprint, jsonify, request

from auth import issue_report_token, require_report_auth
from config import REPORT_PASSWORD, REPORT_SESSION_TTL
from db import db_cursor

reports_bp = Blueprint('reports', __name__)
reports_bp.before_request(require_report_auth)


@reports_bp.route('/reports/auth/login', methods=['POST'])
def reports_login():
    body = request.get_json(silent=True) or {}
    if body.get('password') != REPORT_PASSWORD:
        return jsonify({'message': '비밀번호가 올바르지 않습니다.'}), 401
    return jsonify({'token': issue_report_token(), 'ttl': REPORT_SESSION_TTL})


@reports_bp.route('/reports/roster', methods=['GET'])
def report_roster():
    """구역명단 대조(병합 시 이름 검증·대시보드)용 — CHOIMEMBER 전체 필드가 아니라
    이름·구역·사명여부만 내려준다(report 토큰은 최소 권한이라 TA 등 다른 필드는 제외).
    동명이인(같은 구역에 이름이 같은 인원)이 실제로 있어, 구역+이름만으론 서로 다른
    사람을 구분할 수 없다 — ISMISSION 까지 포함해 최대한 구분한다."""
    with db_cursor() as cur:
        cur.execute('SELECT NAME, GU, ISMISSION FROM CHOIMEMBER')
        return jsonify(cur.fetchall())


@reports_bp.route('/reports', methods=['GET'])
def report_list():
    with db_cursor() as cur:
        cur.execute('SELECT REPORT_DT FROM CHOIREPORT ORDER BY REPORT_DT DESC')
        return jsonify([r['REPORT_DT'].strftime('%Y-%m-%d') for r in cur.fetchall()])


@reports_bp.route('/reports/<date_str>', methods=['GET'])
def report_get(date_str):
    with db_cursor() as cur:
        cur.execute('SELECT DATA FROM CHOIREPORT WHERE REPORT_DT=%s', (date_str,))
        row = cur.fetchone()
        if not row:
            return jsonify({'message': '기록이 없습니다.'}), 404
        return jsonify(json.loads(row['DATA']))


@reports_bp.route('/reports/<date_str>', methods=['PUT'])
def report_put(date_str):
    body = request.get_json(silent=True) or {}
    data = json.dumps(body, ensure_ascii=False)
    with db_cursor(commit=True) as cur:
        cur.execute(
            'INSERT INTO CHOIREPORT (REPORT_DT, DATA) VALUES (%s, %s)'
            ' ON DUPLICATE KEY UPDATE DATA=%s',
            (date_str, data, data),
        )
        return jsonify({'ok': True})
