"""배포·로컬 공통 진입점.

- gunicorn (배포):   `gunicorn -w 2 -b 127.0.0.1:PORT server:app`
- 로컬/Docker:        `python server.py`

실제 로직은 app.py(팩토리) + config/db/auth/serializers/sqlpatch/routes/telegram 에 있다.
"""
from app import create_app
from config import PORT

app = create_app()

if __name__ == '__main__':
    print(f'Local API running on http://localhost:{PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=True)
