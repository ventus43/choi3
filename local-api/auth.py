"""백오피스 공통 비밀번호 게이트 + 세션 만료.

로그인: POST /auth/login {password} → 서명된 토큰 발급.
이후: 프론트가 매 요청 헤더(X-Office-Auth)로 토큰을 실어 보냄.
  - 서명이 틀리거나(위조) 발급 후 SESSION_TTL(기본 30분)이 지나면 401.
  - 프론트는 401 을 받으면 저장 토큰을 지우고 로그인 화면으로 돌아감.
토큰은 stateless(itsdangerous 서명) — 별도 세션 저장소/DB 불필요. 만료 전 강제 폐기는 불가.
"""
from flask import Blueprint, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from config import (
    CHECKLIST_SESSION_SECRET,
    CHECKLIST_SESSION_TTL,
    OFFICE_PASSWORD,
    REPORT_SESSION_SECRET,
    REPORT_SESSION_TTL,
    SESSION_SECRET,
    SESSION_TTL,
)

_signer = URLSafeTimedSerializer(SESSION_SECRET, salt='office-session')
PUBLIC_PATHS = {'/auth/login'}
# /reports/* 는 본프로젝트 토큰이 아니라 별도의 report 토큰으로 인증한다 —
# 전역 가드는 건드리지 않고 통과시키고, 실제 검사는 routes/reports.py 의 블루프린트 전용 가드가 한다.
# /mychecklist/* 는 사명자 개인이 이름만 입력해 조회하는 공개 읽기전용 라우트라 인증 자체가 없다.
EXEMPT_PREFIXES = ('/reports', '/mychecklist')

# /reports(7Ius67Cp) 전용 서명키 — 본프로젝트(_signer)와 salt/secret 이 달라
# 토큰이 서로 호환되지 않는다(한쪽 토큰으로 다른 쪽 API 호출 시 401).
_report_signer = URLSafeTimedSerializer(REPORT_SESSION_SECRET, salt='report-session')
REPORT_PUBLIC_PATHS = {'/reports/auth/login'}


def issue_token():
    return _signer.dumps({'ok': True})


def token_valid(token):
    try:
        _signer.loads(token, max_age=SESSION_TTL)
        return True
    except (BadSignature, SignatureExpired):
        return False


def issue_report_token():
    return _report_signer.dumps({'ok': True})


def report_token_valid(token):
    try:
        _report_signer.loads(token, max_age=REPORT_SESSION_TTL)
        return True
    except (BadSignature, SignatureExpired):
        return False


# /mychecklist(c0p3X0jZsu) 관리자 전용 서명키 — 비밀번호 자체는 DB(CHOICHECKLIST_ADMIN)에
# 저장해 관리자가 바꿀 수 있고, 여기 시크릿은 로그인 성공 후 발급하는 토큰 서명에만 쓴다.
_checklist_signer = URLSafeTimedSerializer(CHECKLIST_SESSION_SECRET, salt='checklist-session')


def issue_checklist_token():
    return _checklist_signer.dumps({'ok': True})


def checklist_token_valid(token):
    try:
        _checklist_signer.loads(token, max_age=CHECKLIST_SESSION_TTL)
        return True
    except (BadSignature, SignatureExpired):
        return False


def require_auth():
    """app.before_request 로 등록 — 공개 경로/별도 인증 영역(EXEMPT_PREFIXES)이 아니면 유효 토큰을 요구."""
    if request.method == 'OPTIONS':
        return None
    if request.path in PUBLIC_PATHS:
        return None
    if request.path.startswith(EXEMPT_PREFIXES):
        return None
    if not token_valid(request.headers.get('X-Office-Auth', '')):
        return jsonify({'message': '세션이 만료되었습니다. 다시 로그인해 주세요.'}), 401
    return None


def require_report_auth():
    """reports_bp.before_request 로 등록 — /reports/* 전용 별도 토큰 검사."""
    if request.method == 'OPTIONS':
        return None
    if request.path in REPORT_PUBLIC_PATHS:
        return None
    if not report_token_valid(request.headers.get('X-Report-Auth', '')):
        return jsonify({'message': '세션이 만료되었습니다. 다시 로그인해 주세요.'}), 401
    return None


auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(silent=True) or {}
    if body.get('password') != OFFICE_PASSWORD:
        return jsonify({'message': '비밀번호가 올바르지 않습니다.'}), 401
    return jsonify({'token': issue_token(), 'ttl': SESSION_TTL})
