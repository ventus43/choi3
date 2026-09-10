"""환경변수 로딩 + 설정값. import 시점에 한 번 실행된다(기존 server.py 와 동일 타이밍)."""
import os


def _load_env_file(path):
    """KEY=VALUE 파일을 읽어 os.environ 에 채운다. 이미 있는 키는 유지(실제 env 우선). 의존성 없음."""
    try:
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except OSError:
        pass


# 텔레그램 토큰/방 등은 gventus 와 공유하는 이 파일에서 읽는다. (choi3.env / 실제 env 가 있으면 그게 우선)
_load_env_file(os.environ.get('SHARED_ENV_FILE', '/home/ubuntu/report/.env'))


# ── 백오피스 공통 비밀번호 인증 + 세션 만료 ──────────────────────────────────
OFFICE_PASSWORD = os.environ.get('OFFICE_PASSWORD', 'choi3')
SESSION_TTL     = int(os.environ.get('SESSION_TTL', '1800'))   # 세션 유효시간(초). 1800 = 30분
SESSION_SECRET  = os.environ.get('SESSION_SECRET', 'choi3-office::' + OFFICE_PASSWORD)


# ── DB 접속정보 (charset/cursorclass 등 pymysql 옵션은 db.py 에서 합친다) ──────
DB = dict(
    host=os.environ.get('DB_HOST', '127.0.0.1'),
    port=int(os.environ.get('DB_PORT', 3306)),
    user=os.environ.get('DB_USER', 'choi3'),
    password=os.environ.get('DB_PASS', 'tjdgh2814@@'),
    database=os.environ.get('DB_NAME', 'choi3'),
)


# ── 화면 캡처 → 텔레그램 전송 ────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN       = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
TELEGRAM_SCREENSHOT_CHAT = os.environ.get('TELEGRAM_SCREENSHOT_CHAT', '').strip()


# ── dev 서버 바인딩 포트 (gunicorn 배포 시엔 무시됨) ─────────────────────────
PORT = int(os.environ.get('PORT', 8081))
