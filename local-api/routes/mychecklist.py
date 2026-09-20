"""/mychecklist  — 사명자 개인 체크리스트 공개(무인증) 조회 전용.

이름을 입력하면 본인 체크리스트를 볼 수 있게 하는 공개 페이지(c0p3X0jZsu.html) 전용 API.
본프로젝트 백오피스 인증(X-Office-Auth)과 완전히 분리 — auth.EXEMPT_PREFIXES 에 등록되어
어떤 토큰도 없이 접근 가능하다. 조회만 가능하고 수정은 불가 — 체크는 관리자(routes/checklist.py)
페이지에서만 한다.
"""
from flask import Blueprint, jsonify, request

from db import db_cursor

mychecklist_bp = Blueprint('mychecklist', __name__)


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

        cur.execute('SELECT SEQ, LABEL FROM CHOICHECKLIST_ITEM ORDER BY SEQ')
        items = cur.fetchall()

        cur.execute('SELECT DOW, ITEM_SEQ, CHECKED FROM CHOICHECKLIST WHERE NTT_ID=%s', (ntt_id,))
        state = cur.fetchall()

        return jsonify({'member': member, 'items': items, 'state': state})
