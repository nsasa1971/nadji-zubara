/* PRIMER za pregled izgleda stranice ordinacije sa Profilom+ (svi podaci su fiktivni).
   Aktivan je samo kad je adresa ordinacija.html?id=demo-profil-plus; inače ne radi ništa
   (ordinacija se ne pojavljuje u pretrazi, brojevima ni sitemap-u). Zavisi od: data.js (NEW_PUBLISHED). */
(function(){
  if(new URLSearchParams(location.search).get('id') !== 'demo-profil-plus' || typeof NEW_PUBLISHED === 'undefined') return;
  const now = new Date(Date.now() - 12 * 86400000).toISOString();
  NEW_PUBLISHED.push({
    id:'demo-profil-plus', name:'Demo Dental Studio (primer)', city:'Novi Sad', address:'Bulevar primera 12, Novi Sad',
    phone:'+381 21 5550123', phones:['+381 21 5550123', '+381 63 5550456'],
    website:'https://example.rs', socials:{instagram:'https://www.instagram.com/', facebook:'https://www.facebook.com/'}, socialsText:'',
    priceRange:null, rating:0, reviewCount:0, verified:true, claimed:true, featured:false, imported:false, isNew:true, preview:false,
    hoursUnknown:false, hoursFromProfile:true,
    hours:{mon:'08:00-20:00', tue:'08:00-20:00', wed:'08:00-20:00', thu:'08:00-20:00', fri:'08:00-18:00', sat:'09:00-14:00'},
    hoursText:'',
    services:['dijagnostika-preventiva', 'bolesti-zuba-endodoncija', 'parodontologija', 'oralna-hirurgija', 'implantologija.ugradnja-implantata',
              'stomatoloska-protetika', 'ortodoncija', 'estetska-stomatologija.izbeljivanje', 'decija-stomatologija'],
    customServices:['Pregled pod mikroskopom', 'Sanacija pod anestezijom', 'Hitne intervencije van radnog vremena'],
    short:'Stomatološka ordinacija u mestu Novi Sad.',
    description:'PRIMER SA FIKTIVNIM PODACIMA. Demo Dental Studio je porodična stomatološka ordinacija u centru grada, otvorena 2012. godine. ' +
      'Radimo sa odraslima i decom, uz poseban naglasak na bezbolne intervencije, preventivu i dugotrajna rešenja. Ordinacija je opremljena ' +
      'digitalnim rendgenom, intraoralnom kamerom i mikroskopom. Termine možete zakazati telefonom, a hitne slučajeve primamo istog dana. ' +
      'Dobro došli u ordinaciju u kojoj se svaki pacijent oseća kao gost.',
    images:['cover'], logoInitials:'DD', logoColor:'#0B857F', reviews:[], coordsVerified:false,
    team:[{name:'Dr Ana Primerić', role:'Specijalista oralne hirurgije'}, {name:'Dr Marko Probić', role:'Ortodont'},
          {name:'Dr Jelena Uzorić', role:'Stomatolog opšte prakse'}, {name:'Ivana Demić', role:'Stomatološka sestra'}],
    demoImages:['img/demo/demo-1.webp', 'img/demo/demo-2.webp', 'img/demo/demo-3.webp', 'img/demo/demo-4.webp'],
    priceListUpdated: now,
    priceList:[
      {kategorija:'Opšta stomatologija', naziv:'Stomatološki pregled', cena:1500},
      {kategorija:'Opšta stomatologija', naziv:'Kompozitna plomba', cena:4500, od:true},
      {kategorija:'Opšta stomatologija', naziv:'Uklanjanje zubnog kamenca', cena:3500},
      {kategorija:'Opšta stomatologija', naziv:'Peskiranje', cena:2500},
      {kategorija:'Dečja stomatologija', naziv:'Pregled deteta', cena:1000},
      {kategorija:'Dečja stomatologija', naziv:'Zalivanje fisura', cena:2500},
      {kategorija:'Dečja stomatologija', naziv:'Plomba na mlečnom zubu', cena:3500},
      {kategorija:'Ortodoncija', naziv:'Fiksni aparat – jedna vilica', cena:60000, od:true},
      {kategorija:'Ortodoncija', naziv:'Mobilni aparat', cena:35000, od:true},
      {kategorija:'Ortodoncija', naziv:'Providni alineri', cena:null},
      {kategorija:'Protetika', naziv:'Metalokeramička krunica', cena:15000},
      {kategorija:'Protetika', naziv:'Cirkonijumska krunica', cena:28000},
      {kategorija:'Protetika', naziv:'Totalna proteza', cena:40000, od:true},
      {kategorija:'Hirurgija', naziv:'Vađenje zuba', cena:4000, od:true},
      {kategorija:'Hirurgija', naziv:'Vađenje impaktiranog umnjaka', cena:12000, od:true},
      {kategorija:'Implantologija', naziv:'Ugradnja implantata', cena:65000},
      {kategorija:'Implantologija', naziv:'Koštani augmentat', cena:null},
      {kategorija:'Parodontologija', naziv:'Lečenje upale desni', cena:6000, od:true},
      {kategorija:'Endodoncija', naziv:'Lečenje kanala – jednokanalni zub', cena:9000},
      {kategorija:'Endodoncija', naziv:'Lečenje kanala – višekanalni zub', cena:15000, od:true},
      {kategorija:'Estetska stomatologija', naziv:'Izbeljivanje zuba', cena:25000},
      {kategorija:'Estetska stomatologija', naziv:'Estetska faseta', cena:30000, od:true}
    ]
  });
})();
