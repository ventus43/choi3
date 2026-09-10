"""/screenshot  (탭 화면 캡처 → 텔레그램 전송).

프론트가 만든 PNG 를 받아 텔레그램 방으로 전송한다.
환경변수(choi3.env / SHARED_ENV_FILE)가 있으면 그 값이 우선. (config.py 에서 로딩)
"""
import json
import urllib.error
import urllib.request
import uuid
from datetime import datetime

from flask import Blueprint, jsonify, request

from config import TELEGRAM_BOT_TOKEN, TELEGRAM_SCREENSHOT_CHAT

screenshot_bp = Blueprint('screenshot', __name__)


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


@screenshot_bp.route('/screenshot', methods=['POST'])
def screenshot_send():
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_SCREENSHOT_CHAT:
        return jsonify({'message': 'TELEGRAM_BOT_TOKEN / TELEGRAM_SCREENSHOT_CHAT 가 설정되지 않았습니다.'}), 503
    f = request.files.get('image')
    if f is None:
        return jsonify({'message': '이미지가 없습니다.'}), 400
    data = f.read()
    if not data:
        return jsonify({'message': '빈 이미지입니다.'}), 400

    label = (request.form.get('label') or '화면').strip()
    # 캡처 시각은 프론트가 보낸 값을 그대로 사용 (조작자 화면 시간). 없으면 수신 시각으로 폴백.
    captured = (request.form.get('capturedAt') or '').strip()
    caption  = f'📷 {label}\n{captured or datetime.now().strftime("%Y-%m-%d %H:%M")}'

    # 사진(sendPhoto)으로 먼저 시도 → 치수·용량 초과 등 실패 시 문서로 재시도
    res = _telegram_upload('sendPhoto', 'photo', caption, data)
    if not res.get('ok'):
        res = _telegram_upload('sendDocument', 'document', caption, data)
    if not res.get('ok'):
        return jsonify({'message': res.get('description', '텔레그램 전송 실패')}), 502
    return jsonify({'ok': True})
