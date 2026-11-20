# -*- coding: utf-8 -*-
"""Testovi na lažnim stranicama (bez mreže):
    python -m unittest discover -s tools -p "test_scrape_services.py" -v
"""
import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scrape_services as sc  # noqa: E402

KEYS = ["dijagnostika-preventiva", "bolesti-zuba-endodoncija", "parodontologija", "oralna-hirurgija",
        "implantologija", "stomatoloska-protetika", "ortodoncija", "estetska-stomatologija", "decija-stomatologija"]


class FakeResp(io.BytesIO):
    def __init__(self, body, url, status=200, ctype="text/html; charset=utf-8"):
        super().__init__(body)
        self.status, self.url = status, url

        class H(dict):
            def get(self_, k, d=None):
                return dict.get(self_, k, d)
        self.headers = H({"Content-Type": ctype})

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeNet:
    """Lažni 'internet': {url: (status, body, ctype)}; beleži zahteve (url, vreme)."""
    def __init__(self, pages, clock=None):
        self.pages, self.calls, self.clock = pages, [], clock

    def __call__(self, req, timeout=0):
        url = req.full_url
        self.calls.append((url, req.get_header("User-agent"), self.clock() if self.clock else None))
        if url not in self.pages:
            raise urllib.error.HTTPError(url, 404, "nf", {}, None)
        st, body, ctype = (self.pages[url] + ("text/html; charset=utf-8",))[:3] if len(self.pages[url]) == 2 else self.pages[url]
        if st != 200:
            raise urllib.error.HTTPError(url, st, "err", {}, None)
        return FakeResp(body if isinstance(body, bytes) else body.encode("utf-8"), url, st, ctype)


def fetcher_for(pages, email="t@example.com"):
    t = [0.0]
    net = FakeNet(pages, clock=lambda: t[0])
    f = sc.PoliteFetcher(email, opener=net, clock=lambda: t[0], sleep=lambda s: t.__setitem__(0, t[0] + s))
    return f, net, t


def page(*links, body="", title=""):
    a = "".join(f'<a href="{h}">{txt}</a>' for h, txt in links)
    return f"<html><head><title>{title}</title><script>var implant='ne';</script></head><body>{a}<p>{body}</p></body></html>"


class Detection(unittest.TestCase):
    def test_latin_cases_and_diacritics(self):
        d = sc.detect_categories("Radimo implantate, parodontopatiju i vađenje umnjaka. Ortodontski aparati i izbeljivanje zuba.")
        self.assertEqual(set(d), {"implantologija", "parodontologija", "oralna-hirurgija", "ortodoncija", "estetska-stomatologija"})

    def test_without_diacritics_and_dj(self):
        d = sc.detect_categories("vadjenje zuba, lecenje kanala, dečija stomatologija")
        self.assertEqual(set(d), {"oralna-hirurgija", "bolesti-zuba-endodoncija", "decija-stomatologija"})
        self.assertIn("oralna-hirurgija", sc.detect_categories("Vađenje zuba"))

    def test_cyrillic(self):
        d = sc.detect_categories("Имплантологија, ортодонција, лечење канала корена, пародонтологија, протетика")
        self.assertEqual(set(d), {"implantologija", "ortodoncija", "bolesti-zuba-endodoncija", "parodontologija", "stomatoloska-protetika"})

    def test_serbian_cases(self):
        for txt, cat in [("u implantologiji", "implantologija"), ("za krunice i mostove", "stomatoloska-protetika"),
                         ("zubni mostovi", "stomatoloska-protetika"), ("sa fasetama", "estetska-stomatologija"),
                         ("kod pedodontu", "decija-stomatologija"), ("mlečnih zuba", "decija-stomatologija"),
                         ("plombama", "bolesti-zuba-endodoncija"), ("peskiranje zuba", "dijagnostika-preventiva"),
                         ("fluorizacijom", "dijagnostika-preventiva"), ("alajneri", "ortodoncija")]:
            self.assertIn(cat, sc.detect_categories(txt), txt)

    def test_only_explicit_mentions(self):
        # opšte reči ne pogađaju ništa
        self.assertEqual(sc.detect_categories("Dobrodošli! Zakažite pregled. Radimo za pacijente, zubi, deca i roditelji. Radno vreme 9-17."), {})
        self.assertEqual(sc.detect_categories("Naš most preko reke i naša deca"), {})

    def test_normalize(self):
        self.assertEqual(sc.normalize("ЂУРЂЕВ Šč  Ž"), "djurdjev sc z")


class Links(unittest.TestCase):
    def test_candidates_same_host_max5_scored(self):
        base = "https://www.klinika.rs/"
        links = [("/usluge/", "Usluge"), ("/cenovnik", "Cenovnik"), ("https://klinika.rs/ortodoncija", "Ortodoncija"),
                 ("https://drugi.rs/usluge", "Usluge"), ("/slika.jpg", "usluge"), ("mailto:a@b.rs", "usluge"),
                 ("#usluge", "Usluge"), ("/o-nama", "O nama"), ("/implantati", "Implantati"), ("/ordinacija", "Ordinacija"),
                 ("/lecenje-zuba", "x"), ("/tretmani", "x"), ("/usluge/", "duplikat")]
        c = sc.candidate_links(base, links)
        self.assertLessEqual(len(c), 5)
        self.assertTrue(all("drugi.rs" not in u and not u.endswith(".jpg") for u in c))
        self.assertIn("https://www.klinika.rs/usluge/", c)
        self.assertEqual(len(set(c)), len(c))
        self.assertNotIn("https://www.klinika.rs/o-nama", c)


class Robots(unittest.TestCase):
    def test_disallow_path_is_not_fetched(self):
        pages = {"https://a.rs/robots.txt": (200, "User-agent: *\nDisallow: /usluge\n", "text/plain"),
                 "https://a.rs/": (200, page(("/usluge/", "Usluge"), ("/cenovnik", "Cenovnik"), body="Dobrodošli")),
                 "https://a.rs/usluge/": (200, page(body="implantati")),
                 "https://a.rs/cenovnik": (200, page(body="ortodoncija"))}
        f, net, _ = fetcher_for(pages)
        e = sc.scrape_site("https://a.rs/", f)
        urls = [c[0] for c in net.calls]
        self.assertNotIn("https://a.rs/usluge/", urls)
        self.assertEqual(set(e["kategorije"]), {"ortodoncija"})

    def test_whole_site_disallowed(self):
        pages = {"https://a.rs/robots.txt": (200, "User-agent: *\nDisallow: /\n", "text/plain"),
                 "https://a.rs/": (200, page(body="implantati"))}
        f, net, _ = fetcher_for(pages)
        e = sc.scrape_site("https://a.rs/", f)
        self.assertEqual((e["status"], e["kategorije"]), ("robots", {}))
        self.assertNotIn("https://a.rs/", [c[0] for c in net.calls])

    def test_robots_for_our_agent_name(self):
        pages = {"https://a.rs/robots.txt": (200, "User-agent: NadjiZubara\nDisallow: /\n\nUser-agent: *\nAllow: /\n", "text/plain"),
                 "https://a.rs/": (200, page(body="implantati"))}
        f, _, _ = fetcher_for(pages)
        self.assertEqual(sc.scrape_site("https://a.rs/", f)["status"], "robots")

    def test_robots_404_allows_and_500_denies(self):
        f, _, _ = fetcher_for({"https://a.rs/": (200, page(body="implantati"))})     # robots.txt = 404
        self.assertEqual(sc.scrape_site("https://a.rs/", f)["status"], "ok")
        f, _, _ = fetcher_for({"https://b.rs/robots.txt": (503, "", "text/plain"), "https://b.rs/": (200, page(body="implantati"))})
        self.assertEqual(sc.scrape_site("https://b.rs/", f)["status"], "robots")

    def test_crawl_delay_respected(self):
        pages = {"https://a.rs/robots.txt": (200, "User-agent: *\nCrawl-delay: 4\n", "text/plain"),
                 "https://a.rs/": (200, page(("/usluge", "Usluge"), body="x")), "https://a.rs/usluge": (200, page(body="x"))}
        f, net, _ = fetcher_for(pages)
        sc.scrape_site("https://a.rs/", f)
        times = [c[2] for c in net.calls]
        gaps = [b - a for a, b in zip(times, times[1:])]
        self.assertTrue(all(g >= 4 - 1e-9 for g in gaps[1:]), gaps)


class Politeness(unittest.TestCase):
    def test_one_request_per_second_per_domain_and_user_agent(self):
        pages = {"https://a.rs/": (200, page(("/usluge", "Usluge"), ("/cenovnik", "Cenovnik"), body="x")),
                 "https://a.rs/usluge": (200, page(body="implantati")), "https://a.rs/cenovnik": (200, page(body="x"))}
        f, net, _ = fetcher_for(pages, email="kontakt@example.org")
        sc.scrape_site("https://a.rs/", f)
        times = [c[2] for c in net.calls]
        self.assertGreaterEqual(len(times), 4)      # robots.txt + 3 stranice
        self.assertTrue(all(b - a >= 1.0 - 1e-9 for a, b in zip(times, times[1:])), times)
        self.assertTrue(all(c[1] == "NadjiZubara/1.0 (kontakt@example.org)" for c in net.calls))

    def test_independent_domains_do_not_wait_for_each_other(self):
        pages = {"https://a.rs/": (200, page(body="x")), "https://b.rs/": (200, page(body="x"))}
        f, net, t = fetcher_for(pages)
        f.get_html("https://a.rs/")
        f.get_html("https://b.rs/")
        a_last = [c for c in net.calls if "a.rs" in c[0]][-1][2]
        b_first = [c for c in net.calls if "b.rs" in c[0]][0][2]
        self.assertLess(b_first - a_last, 1.0)      # prvi zahtev ka b.rs ne čeka a.rs

    def test_email_required(self):
        with self.assertRaises(SystemExit):
            sc.PoliteFetcher("")


class Scraping(unittest.TestCase):
    def test_homepage_plus_up_to_five_pages_with_evidence(self):
        links = [(f"/usluge/{i}", "Usluge") for i in range(8)]
        pages = {"https://k.rs/": (200, page(*links, body="Dobrodošli u ordinaciju"))}
        for i in range(8):
            pages[f"https://k.rs/usluge/{i}"] = (200, page(body="implantati" if i == 0 else "bez ključnih reči"))
        f, net, _ = fetcher_for(pages)
        e = sc.scrape_site("https://k.rs/", f, today="2026-01-02")
        self.assertEqual(len(e["stranice"]), 1 + 5)
        self.assertEqual(e["datum"], "2026-01-02")
        self.assertIn("implantologija", e["kategorije"])
        self.assertTrue(e["kategorije"]["implantologija"]["stranica"].startswith("https://k.rs/usluge/"))

    def test_script_text_and_irrelevant_pages_ignored(self):
        # "implant" je samo u <script> na početnoj; /kontakt se ne prati
        pages = {"https://k.rs/": (200, page(("/kontakt", "Kontakt"), body="Zdrav osmeh")),
                 "https://k.rs/kontakt": (200, page(body="implantati"))}
        f, net, _ = fetcher_for(pages)
        e = sc.scrape_site("https://k.rs/", f)
        self.assertEqual(e["kategorije"], {})
        self.assertNotIn("https://k.rs/kontakt", [c[0] for c in net.calls])

    def test_cp1250_and_cyrillic_page(self):
        body = page(body="Имплантологија и vađenje umnjaka").encode("cp1250", errors="replace")
        body2 = "<html><body>Ortodoncija: lečenje kanala</body></html>".encode("cp1250")
        pages = {"https://k.rs/": (200, body2, "text/html; charset=windows-1250")}
        f, _, _ = fetcher_for(pages)
        e = sc.scrape_site("https://k.rs/", f)
        self.assertIn("ortodoncija", e["kategorije"])
        self.assertIn("bolesti-zuba-endodoncija", e["kategorije"])

    def test_error_and_non_html(self):
        f, _, _ = fetcher_for({"https://k.rs/": (500, "", "text/html")})
        self.assertEqual(sc.scrape_site("https://k.rs/", f)["status"], "greska")
        f, _, _ = fetcher_for({"https://k.rs/": (200, b"%PDF", "application/pdf")})
        self.assertEqual(sc.scrape_site("https://k.rs/", f)["status"], "greska")


class Sites(unittest.TestCase):
    def test_valid_website(self):
        for u in ["https://www.abdental.rs/", "http://dental-n.weebly.com/index.html", "https://x.netlify.app/"]:
            self.assertTrue(sc.valid_website(u), u)
        for u in ["", "#", "dentist.rs", "https://www.facebook.com/x", "https://m.facebook.com/x",
                  "https://zubar.business.site/", "https://sites.google.com/view/x", "https://instagram.com/a",
                  "https://Stomatološka ordinacija.rs"]:
            self.assertFalse(sc.valid_website(u), u)

    def test_directories_not_scraped(self):
        sites = {"https://mediko.rs/ordinacije/x": ["a", "b"], "https://moja.rs/": ["c"]}
        pages = {"https://moja.rs/": (200, page(body="implantati"))}
        f, net, _ = fetcher_for(pages)
        cache = {"version": 1, "sajtovi": {}}
        sc.run(sites, cache, f, log=lambda *_: None)
        self.assertEqual(cache["sajtovi"]["https://mediko.rs/ordinacije/x"]["status"], "imenik")
        self.assertTrue(all("mediko.rs" not in c[0] for c in net.calls))
        out = sc.build_output(sites, cache, KEYS)
        self.assertNotIn('"a"', out)
        self.assertIn('"c":', out)


class RunAndOutput(unittest.TestCase):
    def setUp(self):
        self.pages = {f"https://s{i}.rs/": (200, page(body="implantati i ortodoncija")) for i in range(5)}
        self.pages["https://s9.rs/"] = (200, page(body="bez usluga"))
        self.sites = {f"https://s{i}.rs/": [f"id{i}"] for i in list(range(5)) + [9]}
        self.sites["https://s5.rs/"] = ["id5", "id5b"]       # nedostupan sajt

    def test_limit_resume_and_no_repeat(self):
        f, net, _ = fetcher_for(self.pages)
        cache = {"version": 1, "sajtovi": {}}
        d, rem = sc.run(self.sites, cache, f, limit=3, today="2026-03-04", log=lambda *_: None)
        self.assertEqual((d, rem), (3, 4))
        n = len(net.calls)
        d, rem = sc.run(self.sites, cache, f, limit=10, today="2026-03-04", log=lambda *_: None)
        self.assertEqual((d, rem), (4, 0))
        d, rem = sc.run(self.sites, cache, f, limit=10, log=lambda *_: None)
        self.assertEqual(d, 0)
        done_urls = [u for u in cache["sajtovi"]]
        self.assertEqual(len(done_urls), 7)
        # nijedan sajt nije tražen dvaput (osim robots.txt jednom po domenu)
        pages_requested = [c[0] for c in net.calls if not c[0].endswith("robots.txt")]
        self.assertEqual(len(pages_requested), len(set(pages_requested)))
        self.assertGreater(len(net.calls), n)

    def test_output_only_catalog_categories_with_source_and_date(self):
        f, _, _ = fetcher_for(self.pages)
        cache = {"version": 1, "sajtovi": {}}
        sc.run(self.sites, cache, f, today="2026-03-04", log=lambda *_: None)
        out = sc.build_output(self.sites, cache, KEYS)
        body = out[out.index("{\n") + 1:out.rindex("};")]
        data = json.loads("{" + body + "}")
        self.assertEqual(set(data), {"id0", "id1", "id2", "id3", "id4"})       # id9 bez usluga i id5 nedostupan: nema zapisa
        self.assertEqual(data["id0"], {"s": ["implantologija", "ortodoncija"], "izvor": "https://s0.rs/", "datum": "2026-03-04"})
        self.assertTrue(out.rstrip().endswith("};"))

    def test_cache_roundtrip(self):
        import tempfile
        cache = {"version": 1, "sajtovi": {"https://s0.rs/": {"status": "ok", "datum": "2026-01-01", "kategorije": {}, "stranice": []}}}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "data" / "c.json"
            sc.save_cache(cache, p)
            self.assertEqual(sc.load_cache(p), cache)


class RealData(unittest.TestCase):
    def test_real_clinic_sites_parse(self):
        sites = sc.collect_sites(sc.load_clinic_sites())
        self.assertEqual(sum(len(v) for v in sites.values()), 42)
        self.assertTrue(all(sc.valid_website(u) for u in sites))
        self.assertEqual(sc.load_catalog_keys(), KEYS)


if __name__ == "__main__":
    unittest.main()
