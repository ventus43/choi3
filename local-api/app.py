"""Flask 앱 팩토리. 블루프린트를 모아 등록하고 공통 인증을 건다."""
from flask import Flask

from auth import auth_bp, require_auth
from routes.meetings import meetings_bp
from routes.members import members_bp
from routes.outreach import outreach_bp
from telegram import screenshot_bp


def create_app():
    app = Flask(__name__)

    # 모든 요청에 백오피스 토큰 검사 (auth.PUBLIC_PATHS 는 예외)
    app.before_request(require_auth)

    app.register_blueprint(auth_bp)
    app.register_blueprint(members_bp)
    app.register_blueprint(outreach_bp)
    app.register_blueprint(meetings_bp)
    app.register_blueprint(screenshot_bp)

    return app
