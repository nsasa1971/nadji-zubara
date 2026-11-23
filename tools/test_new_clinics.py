# -*- coding: utf-8 -*-
"""Testovi (bez mreže) za učitavanje novih ordinacija u build_pages.py i za fetch_new_clinics.py."""
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_pages as bp
import fetch_new_clinics as fn

IMPORTED = [
    {'id': 'imp-stomatoloska-ordinacija-ada-1-ada', 'name': 'Ordinacija Ada 1', 'city': 'Ada', 'address': 'A 1', 'phone': '', 'phone_raw': ''},
    {'id': 'imp-osnovna-ordinacija-ada', 'name': 'Osnovna Ordinacija', 'city': 'Ada', 'address': 'A 2', 'phone': '', 'phone_raw': ''},
]
KEYS = {'implantologija', 'ortodoncija'}


def row(**kw):
    r = {'clinic_id': 'nova-test-ada-aaaa', 'status': 'published', 'paket': 'osnovni', 'naziv': 'Test Ordinacija',
         'grad': 'Ada', 'adresa': 'Glavna 1', 'telefon': '024 123 456'}
    r.update(kw)
    return r


class Loader(unittest.TestCase):
    def load(self, rows):
        warns = []
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'n.json'
            p.write_text(json.dumps(rows), encoding='utf-8')
            old = bp.NEW_SRC
            bp.NEW_SRC = p
            try:
                out = bp.load_new_clinics(IMPORTED, KEYS, warn=warns.append)
            finally:
                bp.NEW_SRC = old
        return out, warns

    def test_missing_file_is_empty(self):
        old = bp.NEW_SRC
        bp.NEW_SRC = Path('/nonexistent/x.json')
        try:
            self.assertEqual(bp.load_new_clinics(IMPORTED, KEYS), [])
        finally:
            bp.NEW_SRC = old

    def test_basic_and_phone(self):
        out, w = self.load([row()])
        self.assertEqual(len(out), 1)
        c = out[0]
        self.assertEqual((c['city'], c['slug'], c['phone'], c['new']), ('Ada', 'test-ordinacija', '+381 24 123456', True))

    def test_city_normalized_by_slug(self):
        out, _ = self.load([row(grad='ada'), row(clinic_id='nova-x-ada-bbbb', naziv='Druga', grad='ADA')])
        self.assertEqual({c['city'] for c in out}, {'Ada'})

    def test_skips_invalid_unpublished_reserved(self):
        out, w = self.load([row(clinic_id='BAD ID'), row(clinic_id='nova-p-ada-cccc', status='pending'),
                            row(clinic_id='nova-r-ada-dddd', grad='Css'), row(clinic_id='nova-s-ada-eeee', naziv='x')])
        self.assertEqual(out, [])
        self.assertEqual(len(w), 4)

    def test_slug_collision_with_imported_and_between_new(self):
        out, _ = self.load([row(clinic_id='nova-a-ada-1111', naziv='Osnovna Ordinacija'),
                            row(clinic_id='nova-b-ada-2222', naziv='Test Ordinacija'),
                            row(clinic_id='nova-c-ada-3333', naziv='Test Ordinacija')])
        slugs = [c['slug'] for c in sorted(out, key=lambda c: c['id'])]
        self.assertEqual(slugs, ['osnovna-ordinacija-1111', 'test-ordinacija', 'test-ordinacija-3333'])
        self.assertEqual(len(set(slugs)), 3)

    def test_cyrillic_and_numeric_slug(self):
        out, _ = self.load([row(naziv='Ординација Ђорђе', grad='Нови Град'), row(clinic_id='nova-n-ada-ffff', naziv='2024')])
        c = {x['id']: x for x in out}
        self.assertEqual(c['nova-test-ada-aaaa']['city'], 'Novi Grad')
        self.assertEqual(c['nova-test-ada-aaaa']['slug'], 'ordinacija-djordje')
        self.assertEqual(c['nova-n-ada-ffff']['slug'], '2024-ffff')   # čist broj bi se sudario sa /<grad>/2/

    def test_services_and_html_untouched(self):
        out, _ = self.load([row(paket='profil-plus', services=['implantologija', 'hack'], custom_services=['A', ''],
                                website='javascript:alert(1)', description='<b>x</b>')])
        c = out[0]
        self.assertEqual(c['services'], ['implantologija'])
        self.assertEqual(c['website'], '')
        extra = bp.new_clinic_extra(c)
        self.assertIn('&lt;b&gt;x&lt;/b&gt;', extra)
        self.assertNotIn('<b>', extra)

    def test_bad_json_and_non_list(self):
        for text in ['{not json', '{"a":1}']:
            with tempfile.TemporaryDirectory() as d:
                p = Path(d) / 'n.json'
                p.write_text(text, encoding='utf-8')
                old = bp.NEW_SRC
                bp.NEW_SRC = p
                try:
                    w = []
                    self.assertEqual(bp.load_new_clinics(IMPORTED, KEYS, warn=w.append), [])
                    self.assertEqual(len(w), 1)
                finally:
                    bp.NEW_SRC = old


class Fetch(unittest.TestCase):
    def test_clean_rows_filters_and_sorts(self):
        rows = fn.clean_rows([row(clinic_id='nova-b-ada-2222', contact_email='x@y.rs'), row(clinic_id='nova-a-ada-1111'),
                              row(clinic_id='nova-c-ada-3333', status='pending')])
        self.assertEqual([r['clinic_id'] for r in rows], ['nova-a-ada-1111', 'nova-b-ada-2222'])
        self.assertNotIn('contact_email', rows[0])

    def test_clean_rows_rejects_bad_shape(self):
        for bad in [{'a': 1}, [1], [{'naziv': 'x'}]]:
            with self.assertRaises(ValueError):
                fn.clean_rows(bad)

    def test_fetch_error_leaves_snapshot(self):
        class R(io.BytesIO):
            status = 500
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with self.assertRaises(RuntimeError):
            fn.fetch('https://x.test', 'k', opener=lambda req, timeout: R(b'[]'))


if __name__ == '__main__':
    unittest.main()
