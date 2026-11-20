# -*- coding: utf-8 -*-
"""
Prepoznavanje usluga sa veb-sajtova ordinacija (samo izričita pominjanja).

Za svaku uvezenu ordinaciju sa ispravnom adresom veb-sajta (http/https, ne "#", ne društvena mreža
ni Google "business.site") skripta:
  1. poštuje robots.txt (po domenu) i šalje najviše 1 zahtev u sekundi po domenu,
  2. čita početnu stranicu i do 5 stranica istog sajta čiji linkovi sadrže reči poput usluge,
     cenovnik, ordinacija, ortodoncija, implant...,
  3. u tekstu traži izričita pominjanja kategorija iz kataloga js/services.js preko spiska
     ključnih reči (sinonimi, srpski padeži, latinica i ćirilica, sa i bez dijakritika).

Izlaz:
  data/services-cache.json   keš po adresi sajta (nastavlja se; ne objavljuje se na Netlify-ju)
  js/imported-services.js    id ordinacije -> {s: [ključevi kategorija], izvor: URL sajta, datum}
js/imported-clinics.js se samo čita.

Pokretanje (NE pokretati bez potrebe; vidi .github/workflows/services.yml):
    SCRAPER_EMAIL=ime@domen.rs python tools/scrape_services.py --limit 20
    python tools/scrape_services.py --build-only      # samo ponovo napravi js/imported-services.js iz keša
    python tools/scrape_services.py --report          # izveštaj iz keša

User-Agent: NadjiZubara/1.0 (<SCRAPER_EMAIL>) - e-mail se čita iz promenljive okruženja.
Izlazni kod: 0 = sve obrađeno, 10 = ima još (pokrenuti ponovo), 2 = greška.
"""
import argparse
import datetime
import html as htmlmod
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "js" / "imported-clinics.js"
CATALOG = ROOT / "js" / "services.js"
CACHE_PATH = ROOT / "data" / "services-cache.json"
OUT_PATH = ROOT / "js" / "imported-services.js"

MIN_INTERVAL = 1.0          # sekundi između zahteva ka istom domenu
MAX_EXTRA_PAGES = 5         # pored početne
MAX_BYTES = 1_000_000
TIMEOUT = 15

SOCIAL_DOMAINS = (
    "facebook.com", "fb.com", "fb.me", "instagram.com", "twitter.com", "x.com", "linkedin.com",
    "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "viber.com", "wa.me", "whatsapp.com",
    "t.me", "telegram.me", "google.com", "goo.gl", "g.page", "linktr.ee", "business.site",
    "sites.google.com",
)
# Imenici/posrednici (liste više ordinacija): usluge sa njih se NE pripisuju pojedinačnoj ordinaciji.
DIRECTORY_DOMAINS = (
    "mediko.rs", "stomatologlokator.com", "dentalservicesfinder.com", "ordinacije.info",
    "mojabaza.com", "apartmani-u-beogradu.com", "trgujmo.com",
)
# Reči u linkovima (tekst ili putanja) koje upućuju na stranice sa uslugama.
LINK_WORDS = ("usluge", "usluga", "uslug", "cenovnik", "cene", "ordinacij", "ortodon", "implant",
              "lecenj", "tretman", "ponuda", "protetik", "parodont", "estetsk", "endodon",
              "hirurg", "decij", "pedodon")
SKIP_EXT = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip", ".doc", ".docx",
            ".xls", ".xlsx", ".mp4", ".mp3")

# ---------------------------------------------------------------- normalizacija teksta
_CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'dj', 'е': 'e', 'ж': 'z', 'з': 'z', 'и': 'i',
    'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj', 'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'ћ': 'c', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'c', 'џ': 'dz', 'ш': 's',
}


def normalize(text):
    """Mala slova, ćirilica -> latinica, bez dijakritika (đ -> dj), razmaci skupljeni."""
    out = []
    for ch in text.lower():
        out.append(_CYR.get(ch, ch))
    t = ''.join(out).replace('đ', 'dj')
    t = unicodedata.normalize('NFKD', t)
    t = ''.join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', t).strip()


# ---------------------------------------------------------------- ključne reči po kategorijama
# Obrasci rade nad normalizovanim tekstom (bez dijakritika, latinica). "\w*" pokriva padeže
# (implant, implantata, implantima...). Namerno nema opštih reči poput "pregled" ili "zubi".
KEYWORDS = {
    "dijagnostika-preventiva": [
        r"preventiv\w*", r"profilaks\w*", r"kamenc\w*", r"kamenac", r"peskiranj\w*", r"fluorizacij\w*",
        r"zalivanj\w* fisur\w*", r"dijagnostik\w*", r"sistematski\w* pregled\w*",
    ],
    "bolesti-zuba-endodoncija": [
        r"karijes\w*", r"plomb\w*", r"endodonc\w*", r"endodont\w*", r"lecenj\w* kanal\w*",
        r"kanal\w* korena", r"korenski\w* kanal\w*", r"kompozitn\w* (?:plomb|ispun)\w*",
    ],
    "parodontologija": [
        r"parodont\w*", r"paradont\w*", r"upal\w* desni", r"lecenj\w* desni", r"gingivit\w*",
    ],
    "oralna-hirurgija": [
        r"oraln\w* hirurg\w*", r"hirurg\w* zub\w*", r"vad(?:j)?enj\w* zub\w*", r"ekstrakcij\w*",
        r"umnjak\w*", r"impaktiran\w*", r"hirursk\w* (?:zahvat|intervencij)\w*",
        r"resekcij\w* (?:korena|vrha)",
    ],
    "implantologija": [
        r"implant\w*",
    ],
    "stomatoloska-protetika": [
        r"protetik\w*", r"proteti\w*", r"krunic\w*", r"protez\w*", r"cirkonij\w*", r"metalokeramik\w*",
        r"bezmetaln\w*", r"zubn\w* most\w*", r"fiksn\w* most\w*",
    ],
    "ortodoncija": [
        r"ortodont\w*", r"ortodonc\w*", r"ortopedij\w* vilic\w*", r"fiksn\w* (?:aparat|protez)\w*",
        r"mobiln\w* aparat\w*", r"alajner\w*", r"aligner\w*", r"alineri\w*", r"bravic\w*",
        r"regulacij\w* zub\w*",
    ],
    "estetska-stomatologija": [
        r"estetsk\w* stomatolog\w*", r"estetsk\w* (?:ispun|plomb)\w*", r"izbeljivanj\w*", r"beljenj\w*",
        r"fasete?\b", r"faset\w*", r"vinir\w*", r"veneer\w*", r"bleaching",
    ],
    "decija-stomatologija": [
        r"dec(?:i|j)\w* stomatolog\w*", r"stomatolog\w* (?:za )?dec\w*", r"pedodon\w*",
        r"mlecn\w* zub\w*",
    ],
}
_KW_RE = {k: [re.compile(r'(?<![a-z0-9])' + p) for p in pats] for k, pats in KEYWORDS.items()}


def detect_categories(text):
    """text: bilo koji tekst; vraća {kategorija: prvo_poklapanje}. Samo izričita pominjanja."""
    t = normalize(text)
    found = {}
    for cat, res in _KW_RE.items():
        for rx in res:
            m = rx.search(t)
            if m:
                found[cat] = m.group(0)
                break
    return found


def load_catalog_keys():
    text = CATALOG.read_text(encoding="utf-8")
    m = re.search(r"const SERVICE_CATALOG = (\[.*?\n\]);", text, re.S)
    if not m:
        sys.exit("SERVICE_CATALOG nije pronađen u js/services.js")
    return [c["key"] for c in json.loads(m.group(1))]


# ---------------------------------------------------------------- adrese sajtova
STR = r'("(?:[^"\\]|\\.)*")'
ROW = re.compile(r'^\{id:' + STR + r',name:' + STR + r',city:' + STR + r',address:' + STR + r',phone:' + STR +
                 r',email:' + STR + r',website:' + STR, re.M)


def load_clinic_sites():
    """[(id, naziv, adresa sajta)] za ordinacije sa nepraznim website poljem."""
    text = SRC.read_text(encoding="utf-8")
    out = []
    for m in ROW.finditer(text):
        cid, name, _city, _addr, _phone, _email, site = (json.loads(g) for g in m.groups())
        out.append((cid, name, site.strip()))
    return out


def host_of(url):
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def bare(host):
    return re.sub(r"^www\.", "", host)


def in_domains(host, domains):
    return any(host == d or host.endswith("." + d) for d in domains)


def valid_website(url):
    """http/https, nije "#", nije društvena mreža/Google stranica, ima domen sa tačkom."""
    if not url or url == "#" or " " in url or not re.match(r"^https?://", url, re.I):
        return False
    h = host_of(url)
    return bool(h) and "." in h and not in_domains(h, SOCIAL_DOMAINS)


def is_directory(url):
    return in_domains(host_of(url), DIRECTORY_DOMAINS)


# ---------------------------------------------------------------- HTML
class _Page(HTMLParser):
    """Skuplja vidljiv tekst (bez script/style), naslov, meta opis i linkove."""
    SKIP = {"script", "style", "noscript", "template", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text, self.links, self._skip, self._a = [], [], 0, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.SKIP:
            self._skip += 1
        elif tag == "meta" and (a.get("name") or "").lower() in ("description", "keywords") and a.get("content"):
            self.text.append(a["content"])
        elif tag == "a" and a.get("href"):
            self._a = {"href": a["href"], "text": []}
        elif tag == "img" and a.get("alt"):
            self.text.append(a["alt"])

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        elif tag == "a" and self._a is not None:
            self.links.append((self._a["href"], " ".join(self._a["text"])))
            self._a = None

    def handle_data(self, data):
        if self._skip:
            return
        self.text.append(data)
        if self._a is not None:
            self._a["text"].append(data)


def parse_page(body_text):
    p = _Page()
    try:
        p.feed(body_text)
        p.close()
    except Exception:
        pass
    return " ".join(p.text), p.links


def candidate_links(base_url, links):
    """Do MAX_EXTRA_PAGES linkova istog sajta, poređanih po broju pogođenih reči iz LINK_WORDS."""
    base_host = bare(host_of(base_url))
    seen, scored = {base_url.split("#")[0].rstrip("/")}, []
    for order, (href, text) in enumerate(links):
        href = (href or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "viber:", "sms:")):
            continue
        url = urllib.parse.urljoin(base_url, href).split("#")[0]
        pu = urllib.parse.urlparse(url)
        if pu.scheme not in ("http", "https") or bare(pu.hostname or "") != base_host:
            continue
        if pu.path.lower().endswith(SKIP_EXT):
            continue
        key = url.rstrip("/")
        if key in seen:
            continue
        hay = normalize(urllib.parse.unquote(pu.path) + " " + text)
        score = sum(1 for w in LINK_WORDS if w in hay)
        if score:
            seen.add(key)
            scored.append((-score, order, url))
    scored.sort()
    return [u for _, _, u in scored[:MAX_EXTRA_PAGES]]


# ---------------------------------------------------------------- mreža (robots.txt + 1 zahtev/s po domenu)
class PoliteFetcher:
    def __init__(self, email, opener=urllib.request.urlopen, clock=time.monotonic, sleep=time.sleep):
        if not email:
            raise SystemExit("Nedostaje promenljiva okruženja SCRAPER_EMAIL (kontakt za User-Agent).")
        self.ua = f"NadjiZubara/1.0 ({email})"
        self.opener, self.clock, self.sleep = opener, clock, sleep
        self.last = {}        # host -> vreme poslednjeg zahteva
        self.delay = {}       # host -> Crawl-delay iz robots.txt (ako je veći od 1 s)
        self.robots = {}      # host -> RobotFileParser | "allow" | "deny"
        self.requests = 0

    def _wait(self, host):
        now = self.clock()
        last = self.last.get(host)
        gap = max(MIN_INTERVAL, self.delay.get(host, 0))
        if last is not None and now - last < gap:
            self.sleep(gap - (now - last))
            now = self.clock()
        self.last[host] = now

    def _raw_get(self, url):
        """(status, final_url, content_type, bytes). status 0 = mrežna greška."""
        host = host_of(url)
        self._wait(host)
        self.requests += 1
        req = urllib.request.Request(url, headers={"User-Agent": self.ua, "Accept": "text/html,*/*;q=0.5",
                                                   "Accept-Language": "sr,en;q=0.5"})
        try:
            with self.opener(req, timeout=TIMEOUT) as resp:
                status = getattr(resp, "status", 200) or 200
                ctype = resp.headers.get("Content-Type", "") if getattr(resp, "headers", None) else ""
                body = resp.read(MAX_BYTES)
                return status, getattr(resp, "url", url) or url, ctype, body
        except urllib.error.HTTPError as e:
            return e.code, url, "", b""
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            return 0, url, "", b""

    def _robots_for(self, url):
        pu = urllib.parse.urlparse(url)
        origin = f"{pu.scheme}://{pu.netloc}"
        if origin in self.robots:
            return self.robots[origin]
        status, _u, _c, body = self._raw_get(origin + "/robots.txt")
        if status == 200:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(self._decode(body).splitlines())
            cd = rp.crawl_delay(self.ua) or rp.crawl_delay("*")
            if cd:
                self.delay[host_of(origin)] = min(float(cd), 10.0)   # poštuje Crawl-delay (najviše 10 s)
            res = rp
        elif status in (401, 403):
            res = "deny"                    # pristup robots.txt-u zabranjen: smatra se zabranom
        elif status == 0 or status >= 500:
            res = "deny"                    # nema pouzdanog odgovora: ne šaljemo zahteve
        else:
            res = "allow"                   # 404 i slično: nema ograničenja
        self.robots[origin] = res
        return res

    def allowed(self, url):
        r = self._robots_for(url)
        if r == "allow":
            return True
        if r == "deny":
            return False
        return r.can_fetch(self.ua, url)

    @staticmethod
    def _decode(body):
        for enc in ("utf-8", "cp1250"):
            try:
                return body.decode(enc)
            except UnicodeDecodeError:
                continue
        return body.decode("utf-8", errors="replace")

    def get_html(self, url):
        """(status, final_url, html_ili_None, razlog). razlog: 'robots', 'ne-html', 'greska' ili ''."""
        if not self.allowed(url):
            return 0, url, None, "robots"
        status, final, ctype, body = self._raw_get(url)
        if status == 0:
            return 0, url, None, "greska"
        if status != 200:
            return status, final, None, f"http {status}"
        if ctype and "html" not in ctype.lower() and "text" not in ctype.lower():
            return status, final, None, "ne-html"
        return status, final, self._decode(body), ""


# ---------------------------------------------------------------- jedan sajt
def scrape_site(url, fetcher, today=None):
    """Vraća zapis za keš: status, stranice i prepoznate kategorije (sa dokazom)."""
    today = today or datetime.date.today().isoformat()
    entry = {"datum": today, "stranice": [], "kategorije": {}, "status": "ok"}
    status, final, html, why = fetcher.get_html(url)
    entry["stranice"].append({"url": url, "status": status or why, "napomena": why})
    if html is None:
        entry["status"] = "robots" if why == "robots" else "greska"
        entry["napomena"] = why
        return entry
    text, links = parse_page(html)
    for cat, kw in detect_categories(text).items():
        entry["kategorije"].setdefault(cat, {"rec": kw, "stranica": url})
    for sub in candidate_links(final or url, links):
        st, fin, h2, why2 = fetcher.get_html(sub)
        entry["stranice"].append({"url": sub, "status": st or why2, "napomena": why2})
        if h2 is None:
            continue
        t2, _l2 = parse_page(h2)
        for cat, kw in detect_categories(t2).items():
            entry["kategorije"].setdefault(cat, {"rec": kw, "stranica": sub})
    return entry


# ---------------------------------------------------------------- keš i izlaz
def load_cache(path=None):
    path = path or CACHE_PATH
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("sajtovi", {})
        return data
    return {"version": 1, "sajtovi": {}}


def save_cache(cache, path=None):
    path = path or CACHE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    tmp.replace(path)


def build_output(sites_to_ids, cache, catalog_keys):
    """js/imported-services.js: samo ordinacije sa bar jednom prepoznatom kategorijom iz kataloga."""
    rows = []
    for url in sorted(sites_to_ids):
        e = cache["sajtovi"].get(url)
        if not e or e.get("status") != "ok" or e.get("imenik"):
            continue
        cats = [k for k in catalog_keys if k in e.get("kategorije", {})]
        if not cats:
            continue
        for cid in sorted(sites_to_ids[url]):
            rows.append(f'{json.dumps(cid, ensure_ascii=False)}:'
                        f'{{"s":{json.dumps(cats)},"izvor":{json.dumps(url)},"datum":{json.dumps(e["datum"])}}}')
    body = ",\n".join(rows)
    return ("/* Nađi Zubara — usluge prema sajtu ordinacije (generiše tools/scrape_services.py).\n"
            "   id -> {s: [ključevi kategorija iz js/services.js], izvor: adresa sajta, datum: kada je pročitan}.\n"
            "   Samo izričita pominjanja na sajtu same ordinacije; ordinacija bez zapisa nema usluge. */\n"
            "const IMPORTED_SERVICES = {\n" + body + ("\n" if body else "") + "};\n")


def write_output(sites_to_ids, cache, catalog_keys, path=None):
    (path or OUT_PATH).write_text(build_output(sites_to_ids, cache, catalog_keys), encoding="utf-8")


def collect_sites(clinic_sites):
    """{adresa sajta: [id ordinacija]} samo za ispravne adrese."""
    out = {}
    for cid, _name, site in clinic_sites:
        if valid_website(site):
            out.setdefault(site, []).append(cid)
    return out


def run(sites_to_ids, cache, fetcher, limit=None, save=None, log=print, today=None):
    """Obrađuje sajtove koji nisu u kešu. Vraća (obrađeno, preostalo)."""
    todo = [u for u in sorted(sites_to_ids) if u not in cache["sajtovi"]]
    done = 0
    for url in todo:
        if limit is not None and done >= limit:
            break
        if is_directory(url):
            cache["sajtovi"][url] = {"datum": today or datetime.date.today().isoformat(), "status": "imenik",
                                     "imenik": True, "kategorije": {}, "stranice": [],
                                     "napomena": "imenik/posrednik: usluge se ne pripisuju ordinaciji"}
        else:
            cache["sajtovi"][url] = scrape_site(url, fetcher, today)
        done += 1
        log(f"  {done}: {url} -> {cache['sajtovi'][url]['status']} "
            f"{sorted(cache['sajtovi'][url].get('kategorije', {}))}")
        if save:
            save(cache)
    remaining = sum(1 for u in sites_to_ids if u not in cache["sajtovi"])
    return done, remaining


def report(sites_to_ids, cache, out=print):
    from collections import Counter
    st = Counter(e.get("status") for e in cache["sajtovi"].values())
    cats = Counter(k for e in cache["sajtovi"].values() if e.get("status") == "ok" for k in e.get("kategorije", {}))
    n_clin = sum(len(sites_to_ids[u]) for u, e in cache["sajtovi"].items()
                 if u in sites_to_ids and e.get("status") == "ok" and e.get("kategorije"))
    out(f"Sajtova: {len(sites_to_ids)}, u kešu: {len(cache['sajtovi'])}; statusi: {dict(st)}")
    out(f"Ordinacija sa bar jednom prepoznatom uslugom: {n_clin}")
    out("Kategorije (broj sajtova): " + (", ".join(f"{k}: {v}" for k, v in cats.most_common()) or "nijedna"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="najviše toliko sajtova u ovom pokretanju")
    ap.add_argument("--build-only", action="store_true", help="samo ponovo napravi js/imported-services.js iz keša")
    ap.add_argument("--report", action="store_true", help="ispiši izveštaj iz keša")
    args = ap.parse_args(argv)

    sites = collect_sites(load_clinic_sites())
    cache = load_cache()
    keys = load_catalog_keys()
    if args.report:
        report(sites, cache)
        return 0
    if args.build_only:
        write_output(sites, cache, keys)
        print(f"Upisano u {OUT_PATH}")
        return 0

    fetcher = PoliteFetcher(os.environ.get("SCRAPER_EMAIL", "").strip())
    done, remaining = run(sites, cache, fetcher, limit=args.limit, save=save_cache)
    write_output(sites, cache, keys)
    print(f"Obrađeno u ovom pokretanju: {done}; preostalo: {remaining}; zahteva: {fetcher.requests}")
    return 10 if remaining else 0


if __name__ == "__main__":
    sys.exit(main())
