#!/usr/bin/env python3
"""Pretvara private/emails.csv (clinic_id,email) u SQL INSERT za tabelu clinic_emails.

Koristi se lokalno; izlaz ide u private/clinic_emails.sql (folder private/ je u
.gitignore i NIKAD se ne commituje). Skripta ne štampa adrese, samo brojeve.

    python3 tools/emails_to_sql.py [ulaz.csv] [izlaz.sql]

Prazne ili neispravne adrese se preskaču. Skripta je idempotentna (upsert),
pa se SQL može pokrenuti više puta.
"""
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
BATCH = 500


def q(s):
    return "'" + s.replace("'", "''") + "'"


def main(argv):
    src = Path(argv[1]) if len(argv) > 1 else ROOT / 'private' / 'emails.csv'
    dst = Path(argv[2]) if len(argv) > 2 else ROOT / 'private' / 'clinic_emails.sql'
    rows, empty, bad, dup = [], 0, 0, 0
    seen = set()
    with open(src, newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            cid, em = (r.get('clinic_id') or '').strip(), (r.get('email') or '').strip()
            if not em:
                empty += 1
                continue
            if not cid or not EMAIL_RE.match(em):
                bad += 1
                continue
            if cid in seen:
                dup += 1
                continue
            seen.add(cid)
            rows.append((cid, em))
    out = ['-- Generisano iz private/emails.csv (tools/emails_to_sql.py). NE COMMITOVATI.',
           'begin;']
    for i in range(0, len(rows), BATCH):
        vals = ',\n'.join(f'  ({q(c)}, {q(e)})' for c, e in rows[i:i + BATCH])
        out.append('insert into public.clinic_emails (clinic_id, email) values\n' + vals +
                   '\non conflict (clinic_id) do update set email = excluded.email;')
    out.append('commit;')
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text('\n'.join(out) + '\n', encoding='utf-8')
    print(f'upisano {len(rows)} adresa u {dst} (preskočeno: {empty} praznih, {bad} neispravnih, {dup} duplikata)')


if __name__ == '__main__':
    main(sys.argv)
