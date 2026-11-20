# -*- coding: utf-8 -*-
"""Testovi logike geokodiranja na lažnim odgovorima (bez mreže):
    python -m unittest tools.test_geocode_clinics -v     (iz korena repoa)
"""
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geocode_clinics as g  # noqa: E402

CENTERS = {"Beograd": (44.7866, 20.4489), "Niš": (43.3209, 21.8958), "Novi Sad": (45.2671, 19.8335)}


def clinic(cid, address, city="Beograd", name="X"):
    return {"id": cid, "name": name, "city": city, "address": address, "phone": ""}


def result(lat, lon, category="building", typ="house", addresstype="house", cc="rs"):
    return {"lat": str(lat), "lon": str(lon), "category": category, "type": typ, "addresstype": addresstype,
            "place_rank": 30, "display_name": "x", "address": {"country_code": cc}}


class FakeClient:
    """Umesto mreže: odgovara iz rečnika {street: lista_rezultata}; broji zahteve."""
    def __init__(self, answers):
        self.answers, self.calls = answers, []

    def search(self, params):
        self.calls.append(params)
        return self.answers.get(params["street"], [])


class AddressParsing(unittest.TestCase):
    def test_split_address(self):
        self.assertEqual(g.split_address("Gramšijeva 1a, Beograd - Novi Beograd", "Beograd"), ("Gramšijeva 1a", "Novi Beograd"))
        self.assertEqual(g.split_address("Ilije Babića 27, Beograd - Čukarica - Železnik", "Beograd"), ("Ilije Babića 27", "Čukarica"))
        self.assertEqual(g.split_address("Uroša Martinovića 27 lok.2, Novi Beograd", "Novi Beograd"), ("Uroša Martinovića 27 lok.2", None))
        self.assertEqual(g.split_address("Bulevar Nemanjića 86, Niš", "Niš"), ("Bulevar Nemanjića 86", None))
        self.assertEqual(g.split_address("Jurija Gagarina 155a", "Beograd"), ("Jurija Gagarina 155a", None))

    def test_clean_street(self):
        self.assertEqual(g.clean_street("Uroša Martinovića 27 lok.2"), "Uroša Martinovića 27")
        self.assertEqual(g.clean_street("Knez Mihailova 5 lokal 3"), "Knez Mihailova 5")
        self.assertEqual(g.clean_street("Cara Dušana 12/3"), "Cara Dušana 12")
        self.assertEqual(g.clean_street("Nemanjina 4 sprat 2"), "Nemanjina 4")
        self.assertEqual(g.clean_street("Vojvode Stepe 160 (ulaz B)"), "Vojvode Stepe 160")
        self.assertEqual(g.clean_street("Zelenih beretki bb"), "Zelenih beretki")
        # naziv ulice sa rečju koja liči na dodatak ne sme da se pokvari
        self.assertEqual(g.clean_street("Omladinskih brigada 8"), "Omladinskih brigada 8")

    def test_attempts_first_full_second_clean(self):
        a = g.build_attempts(clinic("1", "Uroša Martinovića 27 lok.2, Beograd - Novi Beograd"))
        self.assertEqual(len(a), 2)
        self.assertEqual(a[0]["street"], "Uroša Martinovića 27 lok.2")
        self.assertEqual(a[0]["county"], "Novi Beograd")
        self.assertEqual(a[0]["city"], "Beograd")
        self.assertEqual(a[0]["country"], "Srbija")
        self.assertEqual(a[1]["street"], "Uroša Martinovića 27")
        self.assertNotIn("county", a[1])

    def test_attempts_deduplicated_when_identical(self):
        self.assertEqual(len(g.build_attempts(clinic("1", "Bulevar Nemanjića 86, Niš", "Niš"))), 1)


class Evaluation(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(g.classify(result(44.8, 20.4)), "kuca")
        self.assertEqual(g.classify(result(44.8, 20.4, "building", "yes", "building")), "kuca")
        self.assertEqual(g.classify(result(44.8, 20.4, "highway", "residential", "road")), "ulica")
        self.assertIsNone(g.classify(result(44.8, 20.4, "place", "city", "city")))
        self.assertIsNone(g.classify(result(44.8, 20.4, "boundary", "administrative", "suburb")))

    def test_ok(self):
        st, info = g.evaluate(result(44.81, 20.46), clinic("1", "x"), CENTERS)
        self.assertEqual((st, info["precision"]), ("ok", "kuca"))

    def test_not_found(self):
        self.assertEqual(g.evaluate(None, clinic("1", "x"), CENTERS)[0], "not_found")

    def test_outside_serbia(self):
        st, info = g.evaluate(result(45.8, 15.97), clinic("1", "x", "Beograd"), CENTERS)   # Zagreb
        self.assertEqual((st, info["reason"]), ("rejected", "van Srbije"))
        st, info = g.evaluate(result(44.8, 20.4, cc="hr"), clinic("1", "x"), CENTERS)
        self.assertEqual(info["reason"], "van Srbije")

    def test_too_far_from_city(self):
        # Niš: rezultat u Beogradu (~200 km)
        st, info = g.evaluate(result(44.8, 20.46), clinic("1", "x", "Niš"), CENTERS)
        self.assertEqual(st, "rejected")
        self.assertTrue(info["reason"].startswith("predaleko od grada"))

    def test_belgrade_wider_radius(self):
        # Lazarevac je ~45 km od centra Beograda: prolazi za Beograd, ne bi za Niš (30 km)
        st, _ = g.evaluate(result(44.38, 20.26), clinic("1", "x", "Beograd"), CENTERS)
        self.assertEqual(st, "ok")
        st, _ = g.evaluate(result(43.60, 22.20), clinic("1", "x", "Niš"), CENTERS)   # ~ 60 km od Niša
        self.assertEqual(st, "rejected")

    def test_city_level_result_rejected(self):
        st, info = g.evaluate(result(44.79, 20.45, "place", "city", "city"), clinic("1", "x"), CENTERS)
        self.assertEqual(st, "rejected")
        self.assertIn("naselje", info["reason"])


class Processing(unittest.TestCase):
    def setUp(self):
        self.cache = {"version": 1, "clinics": {}, "queries": {}}

    def test_second_attempt_when_first_fails(self):
        c = clinic("a", "Uroša Martinovića 27 lok.2, Beograd - Novi Beograd")
        client = FakeClient({"Uroša Martinovića 27": [result(44.81, 20.42)]})   # tek bez "lok.2" uspeva
        rec = g.process_clinic(c, self.cache, client, CENTERS)
        self.assertEqual(rec["status"], "ok")
        self.assertEqual(rec["attempt"], 2)
        self.assertEqual(len(client.calls), 2)
        self.assertNotIn("county", client.calls[1])

    def test_no_second_attempt_when_first_ok(self):
        c = clinic("a", "Gramšijeva 1a, Beograd - Novi Beograd")
        client = FakeClient({"Gramšijeva 1a": [result(44.81, 20.42)]})
        rec = g.process_clinic(c, self.cache, client, CENTERS)
        self.assertEqual((rec["status"], rec["attempt"], len(client.calls)), ("ok", 1, 1))

    def test_failure_is_cached_and_not_repeated(self):
        c = clinic("a", "Nepostojeća 1, Niš", "Niš")
        client = FakeClient({})
        rec = g.process_clinic(c, self.cache, client, CENTERS)
        self.cache["clinics"]["a"] = rec
        self.assertEqual(rec["status"], "not_found")
        n = len(client.calls)
        g.run([c], self.cache, client, CENTERS)       # već ima odluku
        self.assertEqual(len(client.calls), n)

    def test_same_address_never_requested_twice(self):
        c1, c2 = clinic("a", "Gramšijeva 1a, Beograd - Novi Beograd"), clinic("b", "Gramšijeva 1a, Beograd - Novi Beograd")
        client = FakeClient({"Gramšijeva 1a": [result(44.81, 20.42)]})
        g.run([c1, c2], self.cache, client, CENTERS)
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(self.cache["clinics"]["a"]["status"], self.cache["clinics"]["b"]["status"])

    def test_limit_and_resume(self):
        cl = [clinic(str(i), f"Ulica {i}, Niš", "Niš") for i in range(1, 8)]
        answers = {f"Ulica {i}": [result(43.32, 21.89)] for i in range(1, 8)}
        client = FakeClient(answers)
        done, remaining = g.run(cl, self.cache, client, CENTERS, limit=3)
        self.assertEqual((done, remaining, len(client.calls)), (3, 4, 3))
        done, remaining = g.run(cl, self.cache, client, CENTERS, limit=3)
        self.assertEqual((done, remaining, len(client.calls)), (3, 1, 6))      # nastavlja, ne ponavlja
        done, remaining = g.run(cl, self.cache, client, CENTERS, limit=3)
        self.assertEqual((done, remaining, len(client.calls)), (1, 0, 7))

    def test_reevaluate_offline(self):
        c = clinic("a", "Gramšijeva 1a, Beograd - Novi Beograd")
        client = FakeClient({"Gramšijeva 1a": [result(44.38, 20.26)]})
        g.run([c], self.cache, client, CENTERS)
        self.assertEqual(self.cache["clinics"]["a"]["status"], "ok")
        saved = dict(g.RADIUS_KM)
        try:
            g.RADIUS_KM["Beograd"] = 10                                         # strožiji radijus
            g.run([c], self.cache, None, CENTERS, reevaluate=True)               # bez mreže
        finally:
            g.RADIUS_KM.clear(); g.RADIUS_KM.update(saved)
        self.assertEqual(self.cache["clinics"]["a"]["status"], "rejected")
        self.assertEqual(len(client.calls), 1)

    def test_cache_roundtrip(self):
        c = clinic("a", "Gramšijeva 1a, Beograd - Novi Beograd")
        g.run([c], self.cache, FakeClient({"Gramšijeva 1a": [result(44.81, 20.42)]}), CENTERS)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "data" / "cache.json"
            g.save_cache(self.cache, p)
            self.assertEqual(g.load_cache(p), self.cache)


class Output(unittest.TestCase):
    def test_only_precise_in_output(self):
        cache = {"clinics": {
            "b": {"status": "ok", "precision": "ulica", "lat": 44.1, "lng": 20.2},
            "a": {"status": "ok", "precision": "kuca", "lat": 44.8, "lng": 20.4},
            "c": {"status": "rejected", "reason": "x"},
            "d": {"status": "ok", "precision": "naselje", "lat": 1, "lng": 2},
        }}
        out = g.build_output(cache)
        self.assertIn('"a":[44.8,20.4,"kuca"]', out)
        self.assertIn('"b":[44.1,20.2,"ulica"]', out)
        self.assertNotIn('"c"', out)
        self.assertNotIn('"d"', out)
        self.assertLess(out.index('"a"'), out.index('"b"'))
        self.assertIn("OpenStreetMap", out)
        self.assertTrue(out.rstrip().endswith("};"))

    def test_output_valid_js_object(self):
        out = g.build_output({"clinics": {"imp-x": {"status": "ok", "precision": "kuca", "lat": 1.5, "lng": 2.5}}})
        body = out[out.index("{\n") + 1:out.rindex("};")]
        self.assertEqual(json.loads("{" + body + "}"), {"imp-x": [1.5, 2.5, "kuca"]})


class Network(unittest.TestCase):
    def test_rate_limiter_one_per_second(self):
        t = [0.0]
        sleeps = []
        lim = g.RateLimiter(1.0, clock=lambda: t[0], sleep=lambda s: (sleeps.append(s), t.__setitem__(0, t[0] + s)))
        starts = []
        for _ in range(4):
            lim.wait()
            starts.append(t[0])
            t[0] += 0.2                                  # sam zahtev traje 0.2 s
        gaps = [b - a for a, b in zip(starts, starts[1:])]
        self.assertTrue(all(x >= 1.0 - 1e-9 for x in gaps), gaps)

    def test_user_agent_from_email(self):
        self.assertEqual(g.NominatimClient("a@b.rs").ua, "NadjiZubara/1.0 (a@b.rs)")
        with self.assertRaises(SystemExit):
            g.NominatimClient("")

    def test_request_headers_and_retry_on_429(self):
        seen, sleeps = [], []

        class Resp(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def opener(req, timeout=0):
            seen.append(req)
            if len(seen) == 1:
                raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {}, None)
            return Resp(json.dumps([{"lat": "1", "lon": "2"}]).encode())

        lim = g.RateLimiter(0, clock=lambda: 0, sleep=lambda s: None)
        c = g.NominatimClient("a@b.rs", limiter=lim, opener=opener, sleep=sleeps.append)
        res = c.search({"street": "Ulica 1", "city": "Niš", "country": "Srbija"})
        self.assertEqual(res, [{"lat": "1", "lon": "2"}])
        self.assertEqual(len(seen), 2)
        self.assertEqual(seen[0].get_header("User-agent"), "NadjiZubara/1.0 (a@b.rs)")
        self.assertIn("street=Ulica+1", seen[0].full_url)
        self.assertEqual(sleeps, [60])                   # pauza posle 429

    def test_gives_up_after_retries(self):
        def opener(req, timeout=0):
            raise urllib.error.URLError("nema mreže")
        lim = g.RateLimiter(0, clock=lambda: 0, sleep=lambda s: None)
        c = g.NominatimClient("a@b.rs", limiter=lim, opener=opener, sleep=lambda s: None)
        with self.assertRaises(RuntimeError):
            c.search({"street": "x"})


class RealData(unittest.TestCase):
    def test_real_clinics_parse_and_centers(self):
        clinics = g.load_clinics()
        self.assertGreater(len(clinics), 2000)
        centers = g.load_city_centers()
        self.assertIn("Beograd", centers)
        self.assertTrue(all(g.build_attempts(c) for c in clinics))


if __name__ == "__main__":
    unittest.main()
