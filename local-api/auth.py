"""백오피스 공통 비밀번호 게이트 + 세션 만료.

로그인: POST /auth/login {password} → 서명된 토큰 발급.
이후: 프론트가 매 요청 헤더(X-Office-Auth)로 토큰을 실어 보냄.
  - 서명이 틀리거나(위조) 발급 후 SESSION_TTL(기본 30분)이 지나면 401.
  - 프론트는 401 을 받으면 저장 토큰을 지우고 로그인 화면으로 돌아감.
토큰은 stateless(itsdangerous 서명) — 별도 세션 저장소/DB 불필요. 만료 전 강제 폐기는 불가.
"""
from flask import Blueprint, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from config import OFFICE_PASSWORD, SESSION_SECRET, SESSION_TTL

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


def require_auth():
    """app.before_request 로 등록 — 공개 경로가 아니면 유효 토큰을 요구."""
    if request.method == 'OPTIONS':
        return None
    if request.path in PUBLIC_PATHS:
        return None
    if not token_valid(request.headers.get('X-Office-Auth', '')):
        return jsonify({'message': '세션이 만료되었습니다. 다시 로그인해 주세요.'}), 401
    return None


auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(silent=True) or {}
    if body.get('password') != OFFICE_PASSWORD:
        return jsonify({'message': '비밀번호가 올바르지 않습니다.'}), 401
    return jsonify({'token': issue_token(), 'ttl': SESSION_TTL})
