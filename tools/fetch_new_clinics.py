# -*- coding: utf-8 -*-
"""
Preuzima objavljene nove ordinacije iz Supabase-a u data/new-clinics.json (snimak koji čita tools/build_pages.py).

  python tools/fetch_new_clinics.py            # upisuje data/new-clinics.json
  python tools/fetch_new_clinics.py --check    # samo ispiše koliko ordinacija bi bilo upisano

Koristi samo javni (publishable) ključ iz js/supabase-config.js i javni RPC list_published_new_clinics
(odgovor ne sadrži e-adresu ni osobu za kontakt). Nikakav tajni ključ, nikakav upis u bazu.
Ako zahtev ne uspe ili odgovor nije očekivanog oblika, izlazi sa greškom i NE dira postojeći snimak
(build zato nikad ne ostaje bez već objavljenih ordinacija zbog privremene greške).
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'js' / 'supabase-config.js'
OUT = ROOT / 'data' / 'new-clinics.json'
PUBLIC_KEYS = ['clinic_id', 'status', 'paket', 'naziv', 'grad', 'adresa', 'telefon', 'hours', 'hours_text', 'description',
               'services', 'custom_services', 'website', 'socials', 'socials_text', 'lat', 'lng', 'published_at']


def read_config():
    t = CONFIG.read_text(encoding='utf-8')
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", t)
    key = re.search(r"SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'", t)
    if not url or not key:
        sys.exit('Nije pronađen SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY u js/supabase-config.js')
    return url.group(1).rstrip('/'), key.group(1)


def fetch(url, key, opener=urllib.request.urlopen):
    req = urllib.request.Request(url + '/rest/v1/rpc/list_published_new_clinics', data=b'{}', method='POST',
                                 headers={'apikey': key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    with opener(req, timeout=30) as r:
        if r.status != 200:
            raise RuntimeError(f'HTTP {r.status}')
        return json.loads(r.read().decode('utf-8'))


def clean_rows(data):
    """Samo javna polja, samo objavljeni redovi, stabilan redosled. Baca ValueError za neočekivan oblik."""
    if not isinstance(data, list):
        raise ValueError('odgovor nije lista')
    rows = []
    for r in data:
        if not isinstance(r, dict) or not isinstance(r.get('clinic_id'), str):
            raise ValueError('red bez clinic_id')
        if r.get('status') != 'published':
            continue
        rows.append({k: r.get(k) for k in PUBLIC_KEYS})
    rows.sort(key=lambda r: r['clinic_id'])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    url, key = read_config()
    try:
        rows = clean_rows(fetch(url, key))
    except (urllib.error.URLError, OSError, ValueError, RuntimeError) as e:
        sys.exit(f'Preuzimanje nije uspelo ({type(e).__name__}: {e}); data/new-clinics.json je ostao nepromenjen')
    text = json.dumps(rows, ensure_ascii=False, indent=1, sort_keys=True) + '\n'
    if args.check:
        print(f'Objavljenih novih ordinacija: {len(rows)}')
        return
    old = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    if text == old:
        print(f'Nema promena ({len(rows)} ordinacija).')
        return
    tmp = OUT.with_suffix('.json.tmp')
    tmp.write_text(text, encoding='utf-8')
    tmp.replace(OUT)
    print(f'Upisano {len(rows)} ordinacija u {OUT.relative_to(ROOT)}.')


if __name__ == '__main__':
    main()
