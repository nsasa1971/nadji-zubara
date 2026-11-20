/* =========================================================
   Nađi Zubara — katalog usluga (9 kategorija sa poduslugama)
   Ključevi su stabilni (ne menjati): kategorija "dijagnostika-preventiva",
   podusluga "dijagnostika-preventiva.pregledi". Ordinacija može imati više usluga:
   services: ["<ključ kategorije ili podusluge>", ...]. Uvezene ordinacije nemaju nijednu.
   Ovaj fajl čita i tools/build_pages.py (blok SERVICE_CATALOG je validan JSON).
   ========================================================= */

const SERVICE_CATALOG = [
  {"key":"dijagnostika-preventiva","name":"Dijagnostika i preventiva","icon":"search","subservices":[
      {"key": "dijagnostika-preventiva.pregledi", "name": "Pregledi"},
      {"key": "dijagnostika-preventiva.savetovanja", "name": "Savetovanja"},
      {"key": "dijagnostika-preventiva.kamenac-peskiranje", "name": "Uklanjanje zubnog kamenca i peskiranje"},
      {"key": "dijagnostika-preventiva.fluorizacija", "name": "Fluorizacija"},
      {"key": "dijagnostika-preventiva.zalivanje-fisura", "name": "Zalivanje fisura"}
  ]},
  {"key":"bolesti-zuba-endodoncija","name":"Bolesti zuba i endodoncija","icon":"droplet","subservices":[
      {"key": "bolesti-zuba-endodoncija.lecenje-karijesa", "name": "Lečenje karijesa"},
      {"key": "bolesti-zuba-endodoncija.kompozitne-plombe", "name": "Kompozitne (bele) plombe"},
      {"key": "bolesti-zuba-endodoncija.lecenje-kanala", "name": "Lečenje kanala korena zuba"}
  ]},
  {"key":"parodontologija","name":"Parodontologija","icon":"shield","subservices":[
      {"key": "parodontologija.lecenje-upale-desni", "name": "Lečenje upale desni"},
      {"key": "parodontologija.lecenje-parodontopatije", "name": "Lečenje parodontopatije"}
  ]},
  {"key":"oralna-hirurgija","name":"Oralna hirurgija","icon":"scalpel","subservices":[
      {"key": "oralna-hirurgija.obicno-vadjenje", "name": "Obično vađenje zuba"},
      {"key": "oralna-hirurgija.komplikovano-vadjenje", "name": "Komplikovano vađenje zuba"},
      {"key": "oralna-hirurgija.impaktirani-zubi", "name": "Hirurško vađenje impaktiranih zuba (poput umnjaka)"},
      {"key": "oralna-hirurgija.druge-intervencije", "name": "Druge hirurške intervencije"}
  ]},
  {"key":"implantologija","name":"Implantologija","icon":"implant","subservices":[
      {"key": "implantologija.ugradnja-implantata", "name": "Ugradnja zubnih implantata"},
      {"key": "implantologija.resenja-na-implantatima", "name": "Rešenja na implantatima (poput All-on-4 ili All-on-6)"}
  ]},
  {"key":"stomatoloska-protetika","name":"Stomatološka protetika","icon":"crown","subservices":[
      {"key": "stomatoloska-protetika.krunice", "name": "Krunice (metalokeramičke i bezmetalne/cirkonijumske)"},
      {"key": "stomatoloska-protetika.mostovi", "name": "Mostovi"},
      {"key": "stomatoloska-protetika.proteze", "name": "Parcijalne i totalne proteze"}
  ]},
  {"key":"ortodoncija","name":"Ortopedija vilica (ortodoncija)","icon":"braces","subservices":[
      {"key": "ortodoncija.fiksni-aparati", "name": "Fiksne proteze (aparati)"},
      {"key": "ortodoncija.mobilni-aparati", "name": "Mobilni aparati"},
      {"key": "ortodoncija.providni-alineri", "name": "Providni alineri"}
  ]},
  {"key":"estetska-stomatologija","name":"Estetska stomatologija","icon":"sparkle","subservices":[
      {"key": "estetska-stomatologija.izbeljivanje", "name": "Izbeljivanje zuba"},
      {"key": "estetska-stomatologija.fasete", "name": "Estetske fasete (viniri)"},
      {"key": "estetska-stomatologija.estetski-ispuni", "name": "Estetski ispuni"}
  ]},
  {"key":"decija-stomatologija","name":"Dečija stomatologija","icon":"baby","subservices":[
      {"key": "decija-stomatologija.pregledi-dece", "name": "Pregledi dece"},
      {"key": "decija-stomatologija.preventiva-kod-dece", "name": "Preventiva kod dece"},
      {"key": "decija-stomatologija.mlecni-zubi", "name": "Lečenje mlečnih zuba"},
      {"key": "decija-stomatologija.mladi-stalni-zubi", "name": "Lečenje mladih stalnih zuba"}
  ]}
];

// Kategorije u obliku koji koriste filter i pretraga (slug = ključ kategorije).
const SERVICES = SERVICE_CATALOG.map(c => ({slug:c.key, name:c.name, icon:c.icon}));

// ključ (kategorije ili podusluge) -> {name, icon, category, sub}
const SERVICE_INDEX = {};
SERVICE_CATALOG.forEach(c => {
  SERVICE_INDEX[c.key] = {key:c.key, name:c.name, icon:c.icon, category:c.key, sub:false};
  c.subservices.forEach(s => {
    SERVICE_INDEX[s.key] = {key:s.key, name:s.name, icon:c.icon, category:c.key, sub:true};
  });
});

function serviceName(key){
  const s = SERVICE_INDEX[key];
  return s ? s.name : key;
}
function serviceIcon(key){
  const s = SERVICE_INDEX[key];
  return (s && ICONS[s.icon]) ? ICONS[s.icon] : ICONS.tooth;
}
// Samo ključevi koji postoje u katalogu (stari/nepoznati se odbacuju).
function knownServices(keys){
  return (Array.isArray(keys) ? keys : []).filter(k => SERVICE_INDEX[k]);
}
// Da li ordinacija ima uslugu: ključ kategorije obuhvata i njene podusluge.
function clinicHasService(c, key){
  const own = c.services || [];
  if(own.includes(key)) return true;
  const entry = SERVICE_INDEX[key];
  return !!entry && !entry.sub && own.some(k => SERVICE_INDEX[k] && SERVICE_INDEX[k].category === key);
}
