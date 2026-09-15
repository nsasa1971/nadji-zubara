# -*- coding: utf-8 -*-
import openpyxl, sys, re, json, unicodedata, math
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding='utf-8')

SRC = '20210227 Ordinacije.xlsx'
OUT_JS = 'js/imported-clinics.js'

CITY_COORDS = {
 'Beograd': (44.7866, 20.4489), 'Novi Sad': (45.2671, 19.8335), 'Niš': (43.3209, 21.8958),
 'Kragujevac': (44.0128, 20.9114), 'Subotica': (46.1008, 19.6650), 'Pančevo': (44.8708, 20.6403),
 'Kraljevo': (43.7257, 20.6891), 'Zrenjanin': (45.3811, 20.3897), 'Kruševac': (43.5806, 21.3350),
 'Šabac': (44.7486, 19.6906), 'Loznica': (44.5335, 19.2258), 'Valjevo': (44.2708, 19.8897),
 'Jagodina': (43.9773, 21.2653), 'Vršac': (45.1198, 21.3037), 'Čačak': (43.8914, 20.3497),
 'Sombor': (45.7742, 19.1122), 'Sremska Mitrovica': (44.9764, 19.6122), 'Leskovac': (42.9981, 21.9462),
 'Smederevo': (44.6636, 20.9294), 'Negotin': (44.2264, 22.5297), 'Kikinda': (45.8297, 20.4608),
 'Požarevac': (44.6167, 21.1856), 'Užice': (43.8592, 19.8447), 'Vranje': (42.5539, 21.8983),
 'Zaječar': (43.9042, 22.2814), 'Paraćin': (43.8583, 21.4111), 'Vrbas': (45.5714, 19.6425),
 'Bujanovac': (42.4611, 21.7686), 'Ćuprija': (43.9294, 21.3661), 'Novi Pazar': (43.1367, 20.5122),
 'Prokuplje': (43.2342, 21.5878), 'Kladovo': (44.6069, 22.6203), 'Pirot': (43.1536, 22.5847),
 'Bor': (44.0752, 22.0947), 'Inđija': (45.0472, 20.0800), 'Aleksandrovac': (43.4589, 21.0517),
 'Aranđelovac': (44.3050, 20.5636), 'Bečej': (45.6167, 20.0333), 'Despotovac': (44.0800, 21.4386),
 'Gornji Milanovac': (44.0225, 20.4581), 'Ivanjica': (43.5772, 20.2308), 'Senta': (45.9286, 20.0850),
 'Temerin': (45.4083, 19.8886), 'Ada': (45.8017, 20.1264), 'Bačka Palanka': (45.2508, 19.3925),
 'Kula': (45.6089, 19.5289), 'Smederevska Palanka': (44.3667, 20.9583), 'Kanjiža': (46.0642, 20.0508),
 'Knjaževac': (43.5667, 22.2544), 'Kovin': (44.7522, 20.9767), 'Odžaci': (45.5081, 19.2622),
 'Prijepolje': (43.3872, 19.6503), 'Apatin': (45.6717, 18.9814), 'Arilje': (43.7500, 20.0917),
 'Bajina Bašta': (43.9722, 19.5658), 'Bogatić': (44.8319, 19.4914), 'Šid': (45.1300, 19.2242),
 'Futog': (45.2419, 19.7267), 'Nova Pazova': (44.9358, 20.1611), 'Požega': (43.8394, 20.0331),
 'Priboj': (43.5825, 19.5219), 'Trstenik': (43.6161, 21.0033), 'Velika Plana': (44.3389, 21.0761),
 'Veliko Gradište': (44.7594, 21.5183), 'Aleksinac': (43.5386, 21.7069), 'Bačka Topola': (45.8144, 19.6339),
 'Bački Petrovac': (45.3592, 19.5878), 'Novi Bečej': (45.5975, 20.1319), 'Bela Crkva': (44.8992, 21.4192),
 'Ćićevac': (43.7167, 21.4333), 'Grdelica': (42.9078, 22.0808), 'Kovačica': (45.1094, 20.6144),
 'Kosjerić': (43.9564, 19.9186), 'Ruma': (45.0064, 19.8181), 'Sremska Kamenica': (45.2094, 19.8425),
 'Topola': (44.2517, 20.6825), 'Ub': (44.4467, 19.9994), 'Vlasotince': (42.9744, 22.1256),
 'Vrnjačka Banja': (43.6178, 20.8944), 'Alibunar': (45.0778, 20.9600), 'Babušnica': (43.0733, 22.4083),
 'Bač': (45.3853, 19.2361), 'Batočina': (44.1667, 21.0800), 'Bela Palanka': (43.2172, 22.3153),
 'Beočin': (45.2094, 19.7139), 'Blace': (43.2833, 21.2833), 'Lučani': (43.8611, 20.0919),
 'Krupanj': (44.3583, 19.3722), 'Kuršumlija': (43.1394, 21.2725), 'Lebane': (42.9275, 21.7392),
 'Petrovac': (44.3792, 21.4211), 'Prnjavor': (45.57, 19.63), 'Sokobanja': (43.6417, 21.8672),
 'Sremski Karlovci': (45.2019, 19.9364), 'Stara Pazova': (44.9853, 20.1611), 'Varvarin': (43.7181, 21.3667),
 'Vladičin Han': (42.7000, 22.0667), 'Čajetina': (43.7331, 19.9689), 'Banatski Karlovac': (45.0333, 20.7833),
 'Banatsko Karađorđevo': (45.4667, 20.4167), 'Bojnik': (42.9667, 21.7167), 'Brus': (43.3833, 21.0333),
 'Doljevac': (43.2167, 21.8167), 'Donji Milanovac': (44.4667, 22.1167), 'Žabalj': (45.3667, 20.0833),
 'Golubac': (44.6583, 21.6389), 'Koceljeva': (44.4667, 19.8167), 'Kostolac': (44.7167, 21.2167),
 'Lapovo': (44.1833, 21.0167), 'Lajkovac': (44.3667, 20.1667), 'Ljubovija': (44.1833, 19.3667),
 'Mali Iđoš': (45.7167, 19.7000), 'Mol': (45.7833, 20.1000), 'Nova Crnja': (45.6667, 20.5833),
 'Nova Varoš': (43.4667, 19.8167), 'Novi Banovci': (44.9667, 20.2333), 'Novi Kneževac': (46.0333, 20.1000),
 'Opovo': (45.0500, 20.5667), 'Plandište': (45.1333, 21.1333), 'Raška': (43.2889, 20.6122),
 'Ruski Krstur': (45.6500, 19.5667), 'Sevojno': (43.8667, 19.8000), 'Sečanj': (45.3667, 20.7833),
 'Žiča': (43.7167, 20.6667), 'Zubin Potok': (42.9167, 20.6833), 'Novi Beograd': (44.8125, 20.4211),
 'Panćevo': (44.8708, 20.6403), 'Male Pijace': (46.0642, 20.0508), 'Porodin': (44.30, 21.35),
}
TYPO_ALIASES = {'Panćevo': 'Pančevo', 'Novi Beograd': 'Beograd'}
AVATAR_COLORS = ['#0EA5A3','#0B857F','#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2']

SERBIAN_MAP = str.maketrans({'č':'c','ć':'c','ž':'z','š':'s','đ':'dj','Č':'C','Ć':'C','Ž':'Z','Š':'S','Đ':'Dj'})

def slugify(text):
    text = text.translate(SERBIAN_MAP)
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[^a-zA-Z0-9]+', '-', text).strip('-').lower()
    return text or 'ordinacija'

def clean(v):
    if v is None:
        return ''
    if isinstance(v, str):
        return re.sub(r'\s+', ' ', v).strip()
    return str(v).strip()

def format_phone(p):
    if not p:
        return ''
    digits = re.sub(r'[^\d+]', '', p)
    if digits.startswith('+'):
        return p
    if digits.startswith('0'):
        digits = digits[1:]
    # grupisanje: 2 (pozivni bez nule) + ostatak
    return f'+381 {digits[:2]} {digits[2:]}'.strip()

def format_website(w):
    if not w:
        return ''
    if w.startswith('http://') or w.startswith('https://'):
        return w
    return 'https://' + w

def clean_email(e):
    if e and re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e):
        return e
    return ''

GENERIC_WORDS = {
    'stomatoloska','stomatološka','stomatoloski','specijalisticka','specijalistička',
    'ordinacija','privatna','praksa','dr','dr.','stomatolog','poliklinika','centar',
    'zubarska','dental','clinic'
}

def initials_from_name(name):
    ascii_name = name.translate(SERBIAN_MAP)
    words = re.findall(r'\w+', ascii_name, flags=re.UNICODE)
    significant = [w for w in words if w.lower() not in GENERIC_WORDS and len(w) > 1]
    pool = significant if significant else words
    letters = ''.join(w[0] for w in pool[:2]).upper()
    return letters or 'O'

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb['Sheet5']

raw_records = []
seen_keys = set()
for row in ws.iter_rows(min_row=1, values_only=True):
    if not row:
        continue
    name = clean(row[0])
    street = clean(row[1]) if len(row) > 1 else ''
    city_raw = clean(row[3]) if len(row) > 3 else ''
    email = clean(row[4]) if len(row) > 4 else ''
    phone = clean(row[6]) if len(row) > 6 else ''
    website = clean(row[9]) if len(row) > 9 else ''
    if not name:
        continue
    key = (name.lower(), street.lower(), city_raw.lower())
    if key in seen_keys:
        continue
    seen_keys.add(key)

    base_city = re.split(r'\s*-\s*', city_raw)[0].strip() if city_raw else ''
    base_city = TYPO_ALIASES.get(base_city, base_city)
    coords = CITY_COORDS.get(base_city)

    raw_records.append({
        'name': name, 'street': street, 'cityRaw': city_raw, 'city': base_city,
        'email': clean_email(email), 'phone': format_phone(phone), 'website': format_website(website),
        'coords': coords,
    })

# Dodela koordinata unutar grada (isti obrazac kao za postojećih 22 ordinacije, ali sa više
# nivoa radijusa jer neki gradovi imaju i preko 1000 ordinacija).
city_counters = defaultdict(int)
id_counts = Counter()

out_records = []
for r in raw_records:
    city = r['city']
    lat = lng = None
    if r['coords']:
        city_counters[city] += 1
        n = city_counters[city]
        clat, clng = r['coords']
        angle = math.radians(n * 137.508)
        radius = 0.005 + (n % 21) * 0.0025
        lat = clat + radius * math.cos(angle)
        lng = clng + (radius * math.sin(angle)) / math.cos(math.radians(clat))

    base_slug = 'imp-' + slugify(r['name'] + '-' + city)
    id_counts[base_slug] += 1
    slug = base_slug if id_counts[base_slug] == 1 else f'{base_slug}-{id_counts[base_slug]}'

    address = r['street']
    if r['cityRaw']:
        address = f"{r['street']}, {r['cityRaw']}" if r['street'] else r['cityRaw']
    elif city:
        address = r['street'] or city

    initials = initials_from_name(r['name'])
    color = AVATAR_COLORS[abs(hash(slug)) % len(AVATAR_COLORS)]

    out_records.append({
        'id': slug,
        'name': r['name'],
        'city': city or 'Nepoznato',
        'address': address,
        'phone': r['phone'],
        'email': r['email'],
        'website': r['website'] or '#',
        'priceRange': None,
        'rating': 0,
        'reviewCount': 0,
        'verified': False,
        'featured': False,
        'imported': True,
        'hoursUnknown': True,
        'hours': {'mon':None,'tue':None,'wed':None,'thu':None,'fri':None,'sat':None,'sun':None},
        'services': ['opsta'],
        'short': (f"Stomatološka ordinacija u mestu {r['cityRaw'] or city}."
                  if (r['cityRaw'] or city) else "Stomatološka ordinacija."),
        'description': 'Detaljan opis ove ordinacije još nije dostupan. Ako ste vlasnik ove ordinacije, kontaktirajte nas da preuzmete i dopunite ovaj oglas.',
        'images': ['cover'],
        'logoInitials': initials,
        'logoColor': color,
        'reviews': [],
        'lat': lat, 'lng': lng,
    })

print('Generisano zapisa:', len(out_records))
with_coords = sum(1 for r in out_records if r['lat'] is not None)
print('Sa koordinatama:', with_coords, '/', len(out_records))

# Zapis JS fajla
def js_str(s):
    return json.dumps(s, ensure_ascii=False)

lines = []
lines.append('/* =========================================================')
lines.append('   Nađi Zubara — uvezene ordinacije iz javno dostupnog imenika')
lines.append('   (izvor: interna evidencija, uvezeno ' + '2026' + '). Kontakt podaci su')
lines.append('   preuzeti iz postojeće evidencije; ocene, radno vreme, usluge i')
lines.append('   opisi NISU izmišljeni — prikazuju se kao nepoznati dok vlasnik')
lines.append('   ne preuzme i dopuni svoj oglas.')
lines.append('   ========================================================= */')
lines.append('const IMPORTED_CLINICS = [')
for r in out_records:
    lines.append('{' +
        f"id:{js_str(r['id'])}," +
        f"name:{js_str(r['name'])}," +
        f"city:{js_str(r['city'])}," +
        f"address:{js_str(r['address'])}," +
        f"phone:{js_str(r['phone'])}," +
        f"email:{js_str(r['email'])}," +
        f"website:{js_str(r['website'])}," +
        f"priceRange:null," +
        f"rating:0,reviewCount:0,verified:false,featured:false,imported:true,hoursUnknown:true," +
        "hours:{mon:null,tue:null,wed:null,thu:null,fri:null,sat:null,sun:null}," +
        f"services:['opsta']," +
        f"short:{js_str(r['short'])}," +
        f"description:{js_str(r['description'])}," +
        "images:['cover']," +
        f"logoInitials:{js_str(r['logoInitials'])},logoColor:{js_str(r['logoColor'])}," +
        "reviews:[]," +
        f"lat:{r['lat'] if r['lat'] is not None else 'null'},lng:{r['lng'] if r['lng'] is not None else 'null'}" +
        '},'
    )
lines.append('];')

with open(OUT_JS, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print('Upisano u', OUT_JS)
import os
print('Velicina fajla:', os.path.getsize(OUT_JS) / 1024, 'KB')
