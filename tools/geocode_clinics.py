# -*- coding: utf-8 -*-
"""
Geokodiranje adresa uvezenih ordinacija preko Nominatima (OpenStreetMap).

Čita ordinacije iz js/imported-clinics.js (fajl se samo čita), traži koordinate za svaku adresu
i upisuje:
  data/geocode-cache.json   keš (nastavlja se tamo gde je stalo; nijedan upit se ne šalje dvaput)
  js/imported-coords.js     id -> [lat, lng, preciznost]; samo "kuca" i "ulica"

Preciznost:
  "kuca"   rezultat je kuća/zgrada (house/building)
  "ulica"  rezultat je ulica (road/highway)
  sve ostalo (samo grad ili naselje) se odbacuje - ordinacija neće dobiti pin.
Odbacuju se i rezultati van Srbije i rezultati predaleko od očekivanog grada.

Upit je strukturiran (ulica i broj, grad, država Srbija; opština u parametru `county`).
Ako prvi pokušaj ne uspe, drugi je bez dodataka ("lok.2", "sprat 3"...) i bez opštine.

Pravila korišćenja Nominatima: najviše 1 zahtev u sekundi i User-Agent sa kontaktom.
E-mail se čita iz promenljive okruženja NOMINATIM_EMAIL (nikad nije u kodu).

Pokretanje:
    NOMINATIM_EMAIL=ime@domen.rs python tools/geocode_clinics.py --limit 300
    python tools/geocode_clinics.py --build-only      # samo ponovo napravi js/imported-coords.js iz keša
    python tools/geocode_clinics.py --reevaluate      # ponovo proceni odluke iz keša (bez mreže)
    python tools/geocode_clinics.py --report          # izveštaj (po preciznosti, razlozi, 10 primera)

Izlazni kod: 0 = sve obrađeno, 10 = ima još neobrađenih (pokrenuti ponovo), 2 = greška.
Koordinate su © OpenStreetMap contributors (ODbL).
"""
import argparse
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

CACHE_PATH = ROOT / "data" / "geocode-cache.json"
OUT_PATH = ROOT / "js" / "imported-coords.js"
CITY_SRC = ROOT / "tools" / "generate_imported.py"   # odavde se samo čita rečnik CITY_COORDS (tekst)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
MIN_INTERVAL = 1.0           # sekundi između zahteva (najviše 1 zahtev u sekundi)
MAX_RETRIES = 3
HOUSENUMBER_FIRST = False    # True: "12 Ulica" (redosled iz dokumentacije), False: "Ulica 12" (kako je u adresama)

SERBIA_BBOX = (42.2, 18.8, 46.2, 23.0)   # južno, zapadno, severno, istočno
DEFAULT_RADIUS_KM = 30
RADIUS_KM = {"Beograd": 60}              # Beograd je širi zbog opština (Lazarevac, Mladenovac, Obrenovac...)

PRECISE = ("kuca", "ulica")
HOUSE_TYPES = {"house", "building"}


# ---------------------------------------------------------------- podaci
def load_clinics():
    from build_pages import load_clinics as _load   # čita js/imported-clinics.js
    return _load()


def load_city_centers():
    """Centri gradova iz rečnika CITY_COORDS u tools/generate_imported.py (čita se samo tekst)."""
    text = CITY_SRC.read_text(encoding="utf-8")
    return {m[0]: (float(m[1]), float(m[2]))
            for m in re.findall(r"'([^']+)': \(([\d.]+), ([\d.]+)\)", text)}


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- adresa -> upiti
_EXTRA_WORDS = r"(?:lok(?:al)?|loc|sp(?:rat)?|ul(?:az)?|stan|apt|kanc(?:elarija)?|poslovni\s+prostor|pp|br)"
_EXTRA_RE = re.compile(r"[\s,;]+\b" + _EXTRA_WORDS + r"\b\.?\s*[\w./-]*", re.I)


def split_address(address, city):
    """'Gramšijeva 1a, Beograd - Novi Beograd' -> ('Gramšijeva 1a', 'Novi Beograd').
    Opština/deo grada je tekst posle '<grad> - ' (prvi deo, ako je složeno). Može biti None."""
    m = re.search(r",?\s*" + re.escape(city) + r"\s*-\s*(.+?)\s*$", address)
    if m:
        street = address[:m.start()].strip(" ,")
        district = m.group(1).split(" - ")[0].strip() or None
        return street, district
    m = re.search(r",\s*" + re.escape(city) + r"\s*$", address)
    street = address[:m.start()].strip(" ,") if m else address.strip(" ,")
    return street, None


def clean_street(street):
    """Uklanja dodatke tipa 'lok.2', 'sprat 3', 'ulaz B', zagrade i deo posle kose crte u broju."""
    s = re.sub(r"\([^)]*\)", " ", street)
    s = _EXTRA_RE.sub(" ", s)
    s = re.sub(r"(\d+[a-zA-Z]?)\s*/\s*\S+", r"\1", s)        # 12/3 -> 12
    s = re.sub(r"\b(bb|b\.b\.)\b\.?", " ", s, flags=re.I)    # "bez broja" -> samo ulica
    s = re.sub(r"\s+", " ", s).strip(" ,.-")
    return s


def format_street(street):
    if HOUSENUMBER_FIRST:
        m = re.match(r"^(.*?)\s+(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)$", street)
        if m:
            return f"{m.group(2)} {m.group(1)}"
    return street


def build_attempts(clinic):
    """Lista strukturiranih upita (dict parametara) po redosledu pokušaja."""
    street, district = split_address(clinic["address"], clinic["city"])
    base = {"country": "Srbija", "city": clinic["city"], "format": "jsonv2", "addressdetails": 1,
            "limit": 1, "countrycodes": "rs", "accept-language": "sr-Latn,sr"}
    first = dict(base, street=format_street(street))
    if district:
        first["county"] = district
    second = dict(base, street=format_street(clean_street(street)))
    attempts = [first]
    if second != first and second["street"]:
        attempts.append(second)
    return attempts


def query_key(params):
    return json.dumps(sorted(params.items()), ensure_ascii=False)


# ---------------------------------------------------------------- procena rezultata
def classify(result):
    """'kuca' | 'ulica' | None (naselje, grad ili nešto drugo - bez pina)."""
    cat = (result.get("category") or result.get("class") or "").lower()
    typ = (result.get("type") or "").lower()
    addr = (result.get("addresstype") or "").lower()
    if addr in HOUSE_TYPES or cat == "building" or (cat == "place" and typ in HOUSE_TYPES):
        return "kuca"
    if addr == "road" or cat == "highway":
        return "ulica"
    return None


def evaluate(result, clinic, centers):
    """Vraća (status, detalji). status: 'ok' | 'rejected' | 'not_found'."""
    if not result:
        return "not_found", {"reason": "nije pronađeno"}
    try:
        lat, lng = float(result["lat"]), float(result["lon"])
    except (KeyError, TypeError, ValueError):
        return "rejected", {"reason": "neispravan odgovor"}
    cc = ((result.get("address") or {}).get("country_code") or "").lower()
    s, w, n, e = SERBIA_BBOX
    if (cc and cc != "rs") or not (s <= lat <= n and w <= lng <= e):
        return "rejected", {"reason": "van Srbije", "lat": lat, "lng": lng}
    center = centers.get(clinic["city"])
    if center:
        d = haversine_km(lat, lng, *center)
        limit = RADIUS_KM.get(clinic["city"], DEFAULT_RADIUS_KM)
        if d > limit:
            return "rejected", {"reason": f"predaleko od grada ({d:.0f} km > {limit} km)", "lat": lat, "lng": lng}
    precision = classify(result)
    if precision is None:
        return "rejected", {"reason": "preciznost: samo grad ili naselje", "lat": lat, "lng": lng}
    return "ok", {"lat": round(lat, 6), "lng": round(lng, 6), "precision": precision}


def slim(result):
    """Iz odgovora Nominatima čuvaju se samo polja potrebna za procenu (keš ostaje mali)."""
    if not result:
        return None
    a = result.get("address") or {}
    return {k: v for k, v in {
        "lat": result.get("lat"), "lon": result.get("lon"),
        "category": result.get("category") or result.get("class"), "type": result.get("type"),
        "addresstype": result.get("addresstype"), "place_rank": result.get("place_rank"),
        "display_name": result.get("display_name"),
        "address": {"country_code": a.get("country_code"), "city": a.get("city") or a.get("town") or a.get("village"),
                    "suburb": a.get("suburb") or a.get("city_district")},
    }.items() if v is not None}


# ---------------------------------------------------------------- mreža
class RateLimiter:
    def __init__(self, interval=MIN_INTERVAL, clock=time.monotonic, sleep=time.sleep):
        self.interval, self.clock, self.sleep, self.last = interval, clock, sleep, None

    def wait(self):
        now = self.clock()
        if self.last is not None and now - self.last < self.interval:
            self.sleep(self.interval - (now - self.last))
            now = self.clock()
        self.last = now


class NominatimClient:
    def __init__(self, email, limiter=None, opener=urllib.request.urlopen, sleep=time.sleep):
        if not email:
            raise SystemExit("Nedostaje promenljiva okruženja NOMINATIM_EMAIL (kontakt za User-Agent).")
        self.ua = f"NadjiZubara/1.0 ({email})"
        self.limiter = limiter or RateLimiter()
        self.opener, self.sleep = opener, sleep
        self.requests = 0

    def search(self, params):
        """Vraća listu rezultata (može biti prazna); baca RuntimeError posle neuspešnih pokušaja."""
        qs = urllib.parse.urlencode(params)
        last_err = None
        for attempt in range(1, MAX_RETRIES + 1):
            self.limiter.wait()
            self.requests += 1
            req = urllib.request.Request(f"{NOMINATIM_URL}?{qs}", headers={"User-Agent": self.ua})
            try:
                with self.opener(req, timeout=30) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                last_err = f"HTTP {e.code}"
                if e.code == 429:
                    self.sleep(60 * attempt)       # preopterećenje: duža pauza
                elif e.code in (400, 403, 404):
                    break                          # nema smisla ponavljati
                else:
                    self.sleep(5 * attempt)
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                last_err = f"{type(e).__name__}: {e}"
                self.sleep(5 * attempt)
        raise RuntimeError(f"Nominatim ne odgovara ({last_err}): {qs}")


# ---------------------------------------------------------------- keš
def load_cache(path=None):
    path = path or CACHE_PATH
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("clinics", {})
        data.setdefault("queries", {})
        return data
    return {"version": 1, "clinics": {}, "queries": {}}


def save_cache(cache, path=None):
    path = path or CACHE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------- obrada jedne ordinacije
def process_clinic(clinic, cache, client, centers):
    """Geokodira jednu ordinaciju (do 2 pokušaja). Ako client je None, koristi se samo keš.
    Vraća zapis za cache['clinics'][id] ili None ako nema odgovora u kešu (a nema ni mreže)."""
    notes = []
    for i, params in enumerate(build_attempts(clinic), start=1):
        key = query_key(params)
        if key not in cache["queries"]:
            if client is None:               # bez mreže (--reevaluate): zaključi na osnovu keširanih pokušaja
                if notes:
                    break
                return None
            results = client.search(params)           # RuntimeError se propušta ka pozivaocu
            cache["queries"][key] = {"results": [slim(r) for r in results[:1]]}
        cached = cache["queries"][key]["results"]
        status, info = evaluate(cached[0] if cached else None, clinic, centers)
        notes.append({"attempt": i, "status": status, **{k: v for k, v in info.items() if k == "reason"}})
        if status == "ok":
            return {"status": "ok", "attempt": i, **info, "attempts": notes}
    last = notes[-1]
    return {"status": last["status"], "reason": last.get("reason", ""), "attempts": notes}


def run(clinics, cache, client, centers, limit=None, save=None, save_every=25, reevaluate=False, log=print):
    """Obrađuje ordinacije koje još nemaju odluku. Vraća (obrađeno, preostalo)."""
    todo = [c for c in clinics if reevaluate or c["id"] not in cache["clinics"]]
    done = 0
    for c in todo:
        if limit is not None and done >= limit:
            break
        rec = process_clinic(c, cache, None if reevaluate else client, centers)
        if rec is None:
            continue
        cache["clinics"][c["id"]] = rec
        done += 1
        if save and done % save_every == 0:
            save(cache)
            log(f"  obrađeno {done}...")
    if save:
        save(cache)
    remaining = sum(1 for c in clinics if c["id"] not in cache["clinics"])
    return done, remaining


# ---------------------------------------------------------------- izlaz
def build_output(cache):
    """Tekst fajla js/imported-coords.js: samo koordinate preciznosti 'kuca' i 'ulica'."""
    rows = []
    for cid in sorted(cache["clinics"]):
        r = cache["clinics"][cid]
        if r.get("status") == "ok" and r.get("precision") in PRECISE:
            rows.append(f'{json.dumps(cid, ensure_ascii=False)}:[{r["lat"]},{r["lng"]},"{r["precision"]}"]')
    body = ",\n".join(rows)
    return ("/* Nađi Zubara — koordinate uvezenih ordinacija (generiše tools/geocode_clinics.py).\n"
            "   id -> [lat, lng, preciznost]; preciznost je \"kuca\" ili \"ulica\".\n"
            "   Ordinacija bez zapisa ovde nema pin na mapi (coordsVerified ostaje false).\n"
            "   Izvor koordinata: © OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright */\n"
            "const IMPORTED_COORDS = {\n" + body + ("\n" if body else "") + "};\n")


def write_output(cache, path=None):
    path = path or OUT_PATH
    path.write_text(build_output(cache), encoding="utf-8")


def report(clinics, cache, rng=None, out=print):
    from collections import Counter
    by_id = {c["id"]: c for c in clinics}
    recs = cache["clinics"]
    prec = Counter(r["precision"] for r in recs.values() if r["status"] == "ok")
    rejected = Counter()
    for r in recs.values():
        if r["status"] != "ok":
            reason = r.get("reason") or r["status"]
            reason = re.sub(r"\(.*\)", "", reason).strip()
            rejected[reason] += 1
    out(f"Ordinacija ukupno: {len(clinics)}; obrađeno: {len(recs)}; neobrađeno: {len(clinics) - len(recs)}")
    out("Pronađeno po preciznosti: " + (", ".join(f"{k}: {v}" for k, v in sorted(prec.items())) or "nijedna"))
    out(f"Odbačeno/nije pronađeno: {sum(rejected.values())}")
    for reason, n in rejected.most_common():
        out(f"  {n:5d}  {reason}")
    ok = [i for i, r in recs.items() if r["status"] == "ok"]
    rng = rng or random.Random(7)
    out("10 nasumičnih primera (adresa | koordinata | preciznost):")
    for i in rng.sample(ok, min(10, len(ok))):
        r = recs[i]
        out(f"  {by_id[i]['address']} | {r['lat']}, {r['lng']} | {r['precision']}")


# ---------------------------------------------------------------- CLI
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="najviše toliko novih ordinacija u ovom pokretanju")
    ap.add_argument("--build-only", action="store_true", help="samo ponovo napravi js/imported-coords.js iz keša")
    ap.add_argument("--reevaluate", action="store_true", help="ponovo proceni odluke iz keša (bez mreže)")
    ap.add_argument("--report", action="store_true", help="ispiši izveštaj iz keša")
    args = ap.parse_args(argv)

    clinics = load_clinics()
    cache = load_cache()
    centers = load_city_centers()

    if args.report:
        report(clinics, cache)
        return 0
    if args.build_only:
        write_output(cache)
        print(f"Upisano u {OUT_PATH}")
        return 0

    client = None
    if not args.reevaluate:
        client = NominatimClient(os.environ.get("NOMINATIM_EMAIL", "").strip())
    try:
        done, remaining = run(clinics, cache, client, centers, limit=args.limit,
                              save=save_cache, reevaluate=args.reevaluate)
    except RuntimeError as e:
        save_cache(cache)
        write_output(cache)
        print("GREŠKA:", e, file=sys.stderr)
        return 2
    write_output(cache)
    print(f"Obrađeno u ovom pokretanju: {done}; preostalo: {remaining}"
          + (f"; zahteva ka Nominatimu: {client.requests}" if client else ""))
    return 10 if remaining else 0


if __name__ == "__main__":
    sys.exit(main())
