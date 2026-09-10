"""/member  (CHOIMEMBER) — 구역원 CRUD."""
from flask import Blueprint, jsonify, request

from db import db_cursor
from sqlpatch import build_update

members_bp = Blueprint('members', __name__)


@members_bp.route('/member', methods=['GET'])
def member_list():
    with db_cursor() as cur:
        cur.execute('SELECT NTT_ID, GU, NAME, TA, ISMISSION FROM CHOIMEMBER ORDER BY GU, NTT_ID')
        return jsonify(cur.fetchall())


@members_bp.route('/member', methods=['POST'])
def member_create():
    body = request.get_json(silent=True) or {}
    with db_cursor(commit=True) as cur:
        # NTT_ID 는 클라이언트가 안 보냄 — DB 에서 MAX+1 로 채번
        cur.execute('SELECT COALESCE(MAX(NTT_ID), 0) + 1 AS n FROM CHOIMEMBER')
        new_id = cur.fetchone()['n']
        cur.execute(
            'INSERT INTO CHOIMEMBER (NTT_ID, GU, NAME, TA, ISMISSION) VALUES (%s,%s,%s,%s,%s)',
            # TA: 0=일반 / 1=상담사 / 2=교사 (기본 0)
            (new_id, body.get('GU'), body.get('NAME'), body.get('TA', 0), body.get('ISMISSION', 'N')),
        )
        cur.execute('SELECT NTT_ID, GU, NAME, TA, ISMISSION FROM CHOIMEMBER WHERE NTT_ID=%s', (new_id,))
        return jsonify(cur.fetchone()), 201


@members_bp.route('/member/<int:ntt_id>', methods=['PUT'])
def member_update(ntt_id):
    body = request.get_json(silent=True) or {}
    col_map = {'GU': 'GU', 'NAME': 'NAME', 'TA': 'TA', 'ISMISSION': 'ISMISSION'}
    sets, vals = build_update(col_map, body, blank_to_null=False)
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    vals.append(ntt_id)
    with db_cursor(commit=True) as cur:
        cur.execute(f'UPDATE CHOIMEMBER SET {",".join(sets)} WHERE NTT_ID=%s', vals)
        return jsonify({'ok': True})


@members_bp.route('/member/<int:ntt_id>', methods=['DELETE'])
def member_delete(ntt_id):
    with db_cursor(commit=True) as cur:
        cur.execute('DELETE FROM CHOIMEMBER WHERE NTT_ID=%s', (ntt_id,))
        return ('', 204)
