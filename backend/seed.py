#!/usr/bin/env python3
"""
Creates an operator account (§6.5 — there is no self-registration; accounts are
created by an administrator). The password is read from the argument or from
the XSCI_SEED_PASSWORD environment variable.

    python3 seed.py                       # demo account demo/xscience-demo (dev only)
    python3 seed.py --login ivanov        # the password is requested via XSCI_SEED_PASSWORD
"""
from __future__ import annotations

import argparse
import os
import sys

from app import create_app
from app.db import connect
from app.domain.format import iso, utc_now
from app.services.security import hash_password, new_id, new_totp_secret

DEMO = ('demo', 'xscience-demo')


def main() -> int:
    ap = argparse.ArgumentParser(description='Create or update an account')
    ap.add_argument('--login', default=DEMO[0])
    ap.add_argument('--password', default=None)
    ap.add_argument('--role', default='operator')
    ap.add_argument('--totp-secret', default=None)
    args = ap.parse_args()

    password = args.password or os.environ.get('XSCI_SEED_PASSWORD')
    if not password:
        if args.login != DEMO[0]:
            print('Provide --password or XSCI_SEED_PASSWORD', file=sys.stderr)
            return 2
        password = DEMO[1]
        print('[PROTOTYPE] demo account: must not exist in a production environment (§6.5)')

    app = create_app({'REPORT_WORKER': False})
    con = connect(app.config['DB_PATH'])
    try:
        secret = args.totp_secret or new_totp_secret()
        row = con.execute('SELECT id FROM users WHERE login = ?', (args.login,)).fetchone()
        if row:
            con.execute('UPDATE users SET password_hash = ?, role = ?, is_active = 1 '
                        'WHERE id = ?', (hash_password(password), args.role, row['id']))
            print(f'Updated account {args.login} (role {args.role})')
        else:
            con.execute('INSERT INTO users (id, login, password_hash, totp_secret, role, '
                        'is_active, created_at) VALUES (?,?,?,?,?,1,?)',
                        (new_id('u'), args.login, hash_password(password), secret,
                         args.role, iso(utc_now())))
            print(f'Created account {args.login} (role {args.role})')
            print(f'TOTP secret (base32, for the authenticator app): {secret}')
        if app.config['DEMO_CODE']:
            print(f'[PROTOTYPE] static second-factor code: {app.config["DEMO_CODE"]}')
    finally:
        con.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
