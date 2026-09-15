/* =========================================================
   Nađi Zubara — demo podaci o ordinacijama
   (Zameniti stvarnim podacima kada budu dostupni.)
   ========================================================= */

const SERVICES = [
  { slug:'opsta', name:'Opšta stomatologija', icon:'tooth' },
  { slug:'ortodoncija', name:'Ortodoncija', icon:'braces' },
  { slug:'implantologija', name:'Implantologija', icon:'implant' },
  { slug:'estetska', name:'Estetska stomatologija', icon:'sparkle' },
  { slug:'decija', name:'Dečja stomatologija', icon:'baby' },
  { slug:'oralna-hirurgija', name:'Oralna hirurgija', icon:'scalpel' },
  { slug:'parodontologija', name:'Parodontologija', icon:'shield' },
  { slug:'protetika', name:'Protetika', icon:'crown' },
  { slug:'endodoncija', name:'Endodoncija', icon:'droplet' }
];

function serviceName(slug){
  const s = SERVICES.find(x=>x.slug===slug);
  return s ? s.name : slug;
}
function serviceIcon(slug){
  const s = SERVICES.find(x=>x.slug===slug);
  return s ? ICONS[s.icon] : ICONS.tooth;
}

const CITIES = [
  { name:'Beograd', count:0, img:'https://picsum.photos/seed/beograd-city/600/500' },
  { name:'Novi Sad', count:0, img:'https://picsum.photos/seed/novisad-city/600/500' },
  { name:'Niš', count:0, img:'https://picsum.photos/seed/nis-city/600/500' },
  { name:'Kragujevac', count:0, img:'https://picsum.photos/seed/kragujevac-city/600/500' },
  { name:'Subotica', count:0, img:'https://picsum.photos/seed/subotica-city/600/500' }
];

const AVATAR_COLORS = ['#0EA5A3','#0B857F','#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2'];

const CLINICS = [
  {
    id:'dentalis-vracar', name:'Dentalis Vračar', city:'Beograd',
    address:'Bulevar kralja Aleksandra 73, Vračar, Beograd',
    phone:'+381 11 244 5521', website:'https://example.com',
    priceRange:2, rating:4.8, reviewCount:126, verified:true, featured:true,
    services:['opsta','estetska','implantologija'],
    short:'Savremena ordinacija u srcu Vračara sa fokusom na estetsku stomatologiju.',
    description:'Dentalis Vračar je porodična ordinacija sa više od 15 godina iskustva. Tim od pet doktora stomatologije pruža usluge opšte i estetske stomatologije, uz savremenu implantološku terapiju. Ordinacija poseduje sopstveni RTG i CBCT dijagnostiku.',
    hours:{mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-14:00',sun:null},
    images:['dentalis-1','dentalis-2','dentalis-3','dentalis-4'],
    logoInitials:'DV', logoColor:'#0EA5A3',
    reviews:[
      {name:'Milica Jovanović', rating:5, date:'12. avgust 2026.', text:'Odlično iskustvo, doktorka je vrlo pažljiva i sve objasni pre intervencije.'},
      {name:'Nemanja Ristić', rating:5, date:'2. jul 2026.', text:'Ugradio implant, sve je prošlo brzo i bezbolno. Preporučujem.'},
      {name:'Ana Vukotić', rating:4, date:'18. maj 2026.', text:'Profesionalno osoblje, samo je zakazivanje termina malo sporije.'}
    ]
  },
  {
    id:'smile-studio-dorcol', name:'Smile Studio Dorćol', city:'Beograd',
    address:'Cara Dušana 45, Dorćol, Beograd',
    phone:'+381 11 328 7710', website:'https://example.com',
    priceRange:3, rating:4.9, reviewCount:203, verified:true, featured:true,
    services:['estetska','ortodoncija','protetika'],
    short:'Butik ordinacija specijalizovana za holivudski osmeh i nevidljive aparatiće.',
    description:'Smile Studio Dorćol okuplja tim specijalista za estetsku stomatologiju i ortodonciju. Nudimo vinire, izbeljivanje zubi novom generacijom lampi i nevidljive aparatiće za odrasle. Enterijer i oprema su potpuno obnovljeni 2024. godine.',
    hours:{mon:'09:00-21:00',tue:'09:00-21:00',wed:'09:00-21:00',thu:'09:00-21:00',fri:'09:00-21:00',sat:'10:00-16:00',sun:null},
    images:['smile-1','smile-2','smile-3','smile-4'],
    logoInitials:'SS', logoColor:'#7C3AED',
    reviews:[
      {name:'Jovana Petrović', rating:5, date:'30. jul 2026.', text:'Najbolji viniri u gradu, rezultat je prevazišao očekivanja.'},
      {name:'Marko Đorđević', rating:5, date:'14. jun 2026.', text:'Nevidljivi aparatići su mi potpuno promenili osmeh za 8 meseci.'}
    ]
  },
  {
    id:'ordinacija-vitalis', name:'Ordinacija Vitalis', city:'Beograd',
    address:'Vojvode Stepe 210, Voždovac, Beograd',
    phone:'+381 11 397 1284', website:'https://example.com',
    priceRange:1, rating:4.5, reviewCount:64, verified:false,
    services:['opsta','decija','endodoncija'],
    short:'Pristupačna ordinacija za celu porodicu, sa posebnim programom za decu.',
    description:'Vitalis je porodična ordinacija koja već 10 godina brine o osmesima cele porodice. Poseban akcenat stavljamo na rad sa decom kroz igru i edukaciju o oralnoj higijeni, kao i na kvalitetno endodontsko lečenje po pristupačnim cenama.',
    hours:{mon:'07:30-19:00',tue:'07:30-19:00',wed:'07:30-19:00',thu:'07:30-19:00',fri:'07:30-19:00',sat:null,sun:null},
    images:['vitalis-1','vitalis-2','vitalis-3'],
    logoInitials:'OV', logoColor:'#059669',
    reviews:[
      {name:'Snežana Ilić', rating:5, date:'5. avgust 2026.', text:'Moja deca se ne plaše odlaska kod zubara otkad idemo ovde.'},
      {name:'Petar Nikolić', rating:4, date:'21. mart 2026.', text:'Korektne cene i brza usluga za kanalno lečenje.'}
    ]
  },
  {
    id:'dental-art-novi-beograd', name:'Dental Art Novi Beograd', city:'Beograd',
    address:'Bulevar Zorana Đinđića 64, Novi Beograd',
    phone:'+381 11 213 6690', website:'https://example.com',
    priceRange:2, rating:4.7, reviewCount:98, verified:true,
    services:['implantologija','oralna-hirurgija','protetika'],
    short:'Centar za implantologiju i oralnu hirurgiju sa sopstvenom laboratorijom.',
    description:'Dental Art poseduje sopstvenu zubotehničku laboratoriju što omogućava brzu izradu krunica i mostova. Specijalizovani smo za sve vrste implantoloških i hirurških intervencija, uključujući augmentaciju kosti i podizanje sinusa.',
    hours:{mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-13:00',sun:null},
    images:['dentalart-1','dentalart-2','dentalart-3','dentalart-4'],
    logoInitials:'DA', logoColor:'#2563EB',
    reviews:[
      {name:'Dušan Marković', rating:5, date:'9. septembar 2026.', text:'Kompletna implantacija urađena za tri poseka, sve pohvale.'},
      {name:'Tijana Stanić', rating:4, date:'11. jun 2026.', text:'Malo skuplje, ali oprema i higijena su na najvišem nivou.'}
    ]
  },
  {
    id:'ordinacija-lucent', name:'Ordinacija Lucent', city:'Beograd',
    address:'Ustanička 128, Zvezdara, Beograd',
    phone:'+381 11 244 9012', website:'https://example.com',
    priceRange:2, rating:4.6, reviewCount:71, verified:false,
    services:['parodontologija','opsta','estetska'],
    short:'Fokus na zdravlje desni i dugoročnu prevenciju parodontopatije.',
    description:'Lucent se bavi lečenjem oboljenja desni i parodoncijuma, uz redovne kontrole i profesionalno čišćenje zubnog kamenca. Naš tim sarađuje sa pacijentima na izradi individualnog plana prevencije.',
    hours:{mon:'08:30-19:30',tue:'08:30-19:30',wed:'08:30-19:30',thu:'08:30-19:30',fri:'08:30-19:30',sat:'09:00-13:00',sun:null},
    images:['lucent-1','lucent-2','lucent-3'],
    logoInitials:'OL', logoColor:'#D97706',
    reviews:[
      {name:'Vladimir Savić', rating:5, date:'3. avgust 2026.', text:'Konačno sam rešio problem sa krvarenjem desni, hvala doktoru!'}
    ]
  },
  {
    id:'novapella-dental', name:'NovaPella Dental', city:'Novi Sad',
    address:'Bulevar oslobođenja 92, Novi Sad',
    phone:'+381 21 442 1187', website:'https://example.com',
    priceRange:2, rating:4.8, reviewCount:154, verified:true,
    services:['ortodoncija','estetska','opsta'],
    short:'Vodeća ortodontska ordinacija u Novom Sadu, fiksni i mobilni aparatići.',
    description:'NovaPella Dental je specijalizovana za ortodontsku terapiju kod dece i odraslih. Radimo sa najnovijim sistemima fiksnih aparatića i nudimo besplatnu prvu konsultaciju uz 3D sken zuba.',
    hours:{mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-14:00',sun:null},
    images:['novapella-1','novapella-2','novapella-3','novapella-4'],
    logoInitials:'NP', logoColor:'#0EA5A3',
    reviews:[
      {name:'Ivana Radaković', rating:5, date:'27. jul 2026.', text:'Sinu su stavili aparatiće, ekipa je odlična sa decom.'},
      {name:'Bojan Kovačević', rating:5, date:'8. jun 2026.', text:'Rezultat posle godinu dana nošenja aparatića je fantastičan.'}
    ]
  },
  {
    id:'dent-plus-liman', name:'Dent Plus Liman', city:'Novi Sad',
    address:'Bulevar cara Lazara 30, Liman, Novi Sad',
    phone:'+381 21 622 3345', website:'https://example.com',
    priceRange:1, rating:4.4, reviewCount:52, verified:false,
    services:['opsta','decija','endodoncija'],
    short:'Sveobuhvatna nega zuba za celu porodicu po pristupačnim cenama.',
    description:'Dent Plus Liman nudi sve usluge opšte stomatologije, sanaciju karijesa, kanalno lečenje i vađenje zuba. Radimo i vikendom po dogovoru za hitne slučajeve.',
    hours:{mon:'08:00-19:00',tue:'08:00-19:00',wed:'08:00-19:00',thu:'08:00-19:00',fri:'08:00-19:00',sat:'09:00-13:00',sun:null},
    images:['dentplus-1','dentplus-2','dentplus-3'],
    logoInitials:'DP', logoColor:'#DB2777',
    reviews:[
      {name:'Marija Simić', rating:4, date:'15. jul 2026.', text:'Brzo su mi sanirali karijes, korektna cena.'},
      {name:'Aleksandar Pavlović', rating:5, date:'2. maj 2026.', text:'Hitna intervencija vikendom mi je spasila slavlje.'}
    ]
  },
  {
    id:'white-dent-podbara', name:'White Dent Podbara', city:'Novi Sad',
    address:'Zmaj Jovina 12, Novi Sad',
    phone:'+381 21 661 5589', website:'https://example.com',
    priceRange:3, rating:4.9, reviewCount:88, verified:true, featured:true,
    services:['estetska','implantologija','protetika'],
    short:'Premium klinika za implantologiju i estetsku rehabilitaciju osmeha.',
    description:'White Dent Podbara pruža kompletnu digitalnu dijagnostiku (CBCT, intraoralni skener) i planiranje implantološke terapije uz pomoć softvera. Specijalnost su nam kompleksne rehabilitacije osmeha.',
    hours:{mon:'09:00-20:00',tue:'09:00-20:00',wed:'09:00-20:00',thu:'09:00-20:00',fri:'09:00-20:00',sat:null,sun:null},
    images:['whitedent-1','whitedent-2','whitedent-3','whitedent-4'],
    logoInitials:'WD', logoColor:'#0891B2',
    reviews:[
      {name:'Nikola Erić', rating:5, date:'20. avgust 2026.', text:'Kompletna rehabilitacija gornje vilice, rezultat neverovatan.'}
    ]
  },
  {
    id:'dentica-futog', name:'Dentica Futog', city:'Novi Sad',
    address:'Futoška 88, Novi Sad',
    phone:'+381 21 555 2201', website:'https://example.com',
    priceRange:2, rating:4.6, reviewCount:41, verified:false,
    services:['opsta','parodontologija','oralna-hirurgija'],
    short:'Ordinacija sa dugogodišnjim iskustvom u oralnoj hirurgiji.',
    description:'Dentica Futog se bavi hirurškim vađenjem umnjaka, apikotomijom i lečenjem parodontopatije. Ordinacija je opremljena savremenim hirurškim setom i radi po principu no-pain protokola.',
    hours:{mon:'08:00-19:00',tue:'08:00-19:00',wed:'08:00-19:00',thu:'08:00-19:00',fri:'08:00-19:00',sat:'09:00-13:00',sun:null},
    images:['dentica-1','dentica-2','dentica-3'],
    logoInitials:'DF', logoColor:'#7C3AED',
    reviews:[
      {name:'Katarina Đukić', rating:5, date:'11. avgust 2026.', text:'Vađenje umnjaka je prošlo potpuno bezbolno, sjajan doktor.'},
      {name:'Stefan Lukić', rating:4, date:'3. april 2026.', text:'Sve pohvale za strpljenje i objašnjenja pre zahvata.'}
    ]
  },
  {
    id:'orto-centar-detelinara', name:'Orto Centar Detelinara', city:'Novi Sad',
    address:'Sentandrejski put 5, Detelinara, Novi Sad',
    phone:'+381 21 447 8820', website:'https://example.com',
    priceRange:2, rating:4.7, reviewCount:67, verified:true,
    services:['ortodoncija','decija'],
    short:'Specijalizovani ortodontski centar za decu, tinejdžere i odrasle.',
    description:'Orto Centar Detelinara je posvećen isključivo ortodontskoj terapiji. Nudimo klasične i estetske aparatiće, kao i providne alajnere za odrasle koji žele diskretno ispravljanje zuba.',
    hours:{mon:'09:00-19:00',tue:'09:00-19:00',wed:'09:00-19:00',thu:'09:00-19:00',fri:'09:00-19:00',sat:'09:00-13:00',sun:null},
    images:['ortocentar-1','ortocentar-2','ortocentar-3'],
    logoInitials:'OC', logoColor:'#D97706',
    reviews:[
      {name:'Milan Tadić', rating:5, date:'6. jul 2026.', text:'Providni alajneri su mi promenili osmeh bez da iko primeti da ih nosim.'}
    ]
  },
  {
    id:'medident-nis', name:'MediDent Niš Centar', city:'Niš',
    address:'Obrenovićeva 33, Niš',
    phone:'+381 18 522 3341', website:'https://example.com',
    priceRange:2, rating:4.7, reviewCount:112, verified:true,
    services:['opsta','implantologija','protetika'],
    short:'Najveća privatna stomatološka poliklinika u centru Niša.',
    description:'MediDent Niš Centar okuplja tim od osam doktora stomatologije svih specijalnosti. Nudimo kompletnu uslugu od prevencije do složenih implanto-protetskih radova, uz mogućnost plaćanja na rate.',
    hours:{mon:'07:00-20:00',tue:'07:00-20:00',wed:'07:00-20:00',thu:'07:00-20:00',fri:'07:00-20:00',sat:'08:00-15:00',sun:null},
    images:['medident-1','medident-2','medident-3','medident-4'],
    logoInitials:'MD', logoColor:'#0EA5A3',
    reviews:[
      {name:'Jelena Stojanović', rating:5, date:'19. avgust 2026.', text:'Plaćanje na rate mi je omogućilo implantaciju koju sam odlagala godinama.'},
      {name:'Darko Mitić', rating:4, date:'5. jun 2026.', text:'Veliki izbor doktora, lako se uklapa termin.'}
    ]
  },
  {
    id:'dentalux-nis', name:'DentaLux Niš', city:'Niš',
    address:'Vožda Karađorđa 19, Niš',
    phone:'+381 18 250 7712', website:'https://example.com',
    priceRange:3, rating:4.9, reviewCount:76, verified:true, featured:true,
    services:['estetska','ortodoncija'],
    short:'Estetska stomatologija i holivudski osmesi po meri.',
    description:'DentaLux Niš je butik ordinacija fokusirana na estetske rezultate — vinire, bonding i profesionalno izbeljivanje. Svaki tretman počinje digitalnim dizajnom osmeha (DSD) kako bi pacijent unapred video rezultat.',
    hours:{mon:'10:00-20:00',tue:'10:00-20:00',wed:'10:00-20:00',thu:'10:00-20:00',fri:'10:00-20:00',sat:'10:00-15:00',sun:null},
    images:['dentalux-1','dentalux-2','dentalux-3'],
    logoInitials:'DL', logoColor:'#DB2777',
    reviews:[
      {name:'Sara Milenković', rating:5, date:'2. septembar 2026.', text:'Digitalni dizajn osmeha unapred mi je pokazao tačno kako će izgledati, sjajno.'}
    ]
  },
  {
    id:'porodicna-ordinacija-pantelej', name:'Porodična ordinacija Pantelej', city:'Niš',
    address:'Bulevar Nemanjića 78, Niš',
    phone:'+381 18 415 6620', website:'https://example.com',
    priceRange:1, rating:4.5, reviewCount:39, verified:false,
    services:['opsta','decija','endodoncija'],
    short:'Pristupačna nega zuba za sve generacije u naselju Pantelej.',
    description:'Ordinacija posluje od 2009. godine i pruža usluge opšte stomatologije uz poseban akcenat na rad sa decom i starijim sugrađanima. Nudimo popust za penzionere i studente.',
    hours:{mon:'08:00-18:00',tue:'08:00-18:00',wed:'08:00-18:00',thu:'08:00-18:00',fri:'08:00-18:00',sat:null,sun:null},
    images:['pantelej-1','pantelej-2','pantelej-3'],
    logoInitials:'PP', logoColor:'#059669',
    reviews:[
      {name:'Radovan Antić', rating:5, date:'14. maj 2026.', text:'Popust za penzionere mi mnogo znači, a usluga je i dalje vrhunska.'}
    ]
  },
  {
    id:'implant-centar-nis', name:'Implant Centar Niš', city:'Niš',
    address:'Кеј 29. decembra 15, Niš',
    phone:'+381 18 292 1145', website:'https://example.com',
    priceRange:2, rating:4.6, reviewCount:58, verified:true,
    services:['implantologija','oralna-hirurgija','parodontologija'],
    short:'Regionalni centar za implantologiju sa sopstvenim CBCT aparatom.',
    description:'Implant Centar Niš pokriva ceo region jugoistočne Srbije za implanto-protetsku terapiju. Poseduje sopstveni CBCT uređaj za preciznu 3D dijagnostiku pre ugradnje implanta.',
    hours:{mon:'08:00-19:00',tue:'08:00-19:00',wed:'08:00-19:00',thu:'08:00-19:00',fri:'08:00-19:00',sat:'09:00-14:00',sun:null},
    images:['implantnis-1','implantnis-2','implantnis-3'],
    logoInitials:'IC', logoColor:'#2563EB',
    reviews:[
      {name:'Zoran Jović', rating:4, date:'30. jun 2026.', text:'Dolazim iz Leskovca samo zbog CBCT dijagnostike, vredi puta.'}
    ]
  },
  {
    id:'dentart-sumadija', name:'DentArt Šumadija', city:'Kragujevac',
    address:'Kneza Miloša 44, Kragujevac',
    phone:'+381 34 335 1290', website:'https://example.com',
    priceRange:2, rating:4.7, reviewCount:83, verified:true, featured:true,
    services:['opsta','estetska','protetika'],
    short:'Vodeća ordinacija u Kragujevcu za protetiku i estetsku stomatologiju.',
    description:'DentArt Šumadija kombinuje klasičnu i digitalnu protetiku — CAD/CAM izrada krunica u toku jedne posete. Tim čine tri doktora stomatologije sa dodatnim usavršavanjima u inostranstvu.',
    hours:{mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-14:00',sun:null},
    images:['dentart-1','dentart-2','dentart-3','dentart-4'],
    logoInitials:'DŠ', logoColor:'#0EA5A3',
    reviews:[
      {name:'Milena Radoičić', rating:5, date:'22. jul 2026.', text:'Krunicu su mi izradili i ugradili isti dan, neverovatno brzo.'},
      {name:'Filip Obradović', rating:4, date:'9. mart 2026.', text:'Kvalitetna usluga, samo malo duže čekanje na termin.'}
    ]
  },
  {
    id:'dent-medika-kg', name:'Dent Medika', city:'Kragujevac',
    address:'Kralja Petra I 102, Kragujevac',
    phone:'+381 34 201 3387', website:'https://example.com',
    priceRange:1, rating:4.4, reviewCount:47, verified:false,
    services:['opsta','decija','endodoncija'],
    short:'Porodična ordinacija sa pristupačnim cenama i brzim terminima.',
    description:'Dent Medika je orijentisana na svakodnevne potrebe porodica — preglede, plombiranje, kanalno lečenje i vađenje zuba. Termine je moguće zakazati i za isti dan.',
    hours:{mon:'07:30-19:00',tue:'07:30-19:00',wed:'07:30-19:00',thu:'07:30-19:00',fri:'07:30-19:00',sat:'09:00-13:00',sun:null},
    images:['dentmedika-1','dentmedika-2','dentmedika-3'],
    logoInitials:'DM', logoColor:'#D97706',
    reviews:[
      {name:'Ljiljana Perić', rating:4, date:'17. jun 2026.', text:'Uspeli su da me prime isti dan zbog bola u zubu, hvala im.'}
    ]
  },
  {
    id:'smile-line-kg', name:'Smile Line Kragujevac', city:'Kragujevac',
    address:'Save Kovačevića 5, Kragujevac',
    phone:'+381 34 370 4456', website:'https://example.com',
    priceRange:3, rating:4.8, reviewCount:56, verified:true,
    services:['estetska','ortodoncija','implantologija'],
    short:'Moderna klinika sa digitalnim skenerom i 3D planiranjem terapije.',
    description:'Smile Line koristi intraoralni skener umesto klasičnih otisaka, što tretmane čini bržim i prijatnijim. Nudimo ortodontsku terapiju, implantologiju i estetske korekcije osmeha.',
    hours:{mon:'09:00-20:00',tue:'09:00-20:00',wed:'09:00-20:00',thu:'09:00-20:00',fri:'09:00-20:00',sat:null,sun:null},
    images:['smileline-1','smileline-2','smileline-3'],
    logoInitials:'SL', logoColor:'#7C3AED',
    reviews:[
      {name:'Ognjen Vasić', rating:5, date:'12. avgust 2026.', text:'Skeniranje bez otiska je odlično iskustvo, brzo i precizno.'}
    ]
  },
  {
    id:'dentalna-poliklinika-erdut', name:'Dentalna poliklinika Erdut', city:'Kragujevac',
    address:'Ulica Save Kovačevića 70, Kragujevac',
    phone:'+381 34 500 1123', website:'https://example.com',
    priceRange:2, rating:4.5, reviewCount:34, verified:false,
    services:['parodontologija','oralna-hirurgija','opsta'],
    short:'Poliklinika sa dugom tradicijom u hirurškoj stomatologiji.',
    description:'Poliklinika Erdut posluje već 20 godina i specijalizovana je za hirurško lečenje parodontopatije i vađenje komplikovanih umnjaka, uz mogućnost sedacije za anksiozne pacijente.',
    hours:{mon:'08:00-19:00',tue:'08:00-19:00',wed:'08:00-19:00',thu:'08:00-19:00',fri:'08:00-19:00',sat:'09:00-13:00',sun:null},
    images:['erdut-1','erdut-2','erdut-3'],
    logoInitials:'DE', logoColor:'#0891B2',
    reviews:[
      {name:'Tamara Nešić', rating:5, date:'1. jul 2026.', text:'Sedacija mi je pomogla da prevaziđem strah od zubara, hvala timu.'}
    ]
  },
  {
    id:'dent-korzo-subotica', name:'Dent Korzo', city:'Subotica',
    address:'Korzo 5, Subotica',
    phone:'+381 24 553 2210', website:'https://example.com',
    priceRange:2, rating:4.7, reviewCount:61, verified:true,
    services:['opsta','estetska','ortodoncija'],
    short:'Ordinacija u samom centru Subotice, poznata po ljubaznom osoblju.',
    description:'Dent Korzo je omiljena ordinacija građana Subotice zahvaljujući ljubaznom osoblju i modernom pristupu. Nudimo redovne kontrole, estetske korekcije i ortodontsku terapiju za sve uzraste.',
    hours:{mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-14:00',sun:null},
    images:['dentkorzo-1','dentkorzo-2','dentkorzo-3'],
    logoInitials:'DK', logoColor:'#0EA5A3',
    reviews:[
      {name:'Eva Kovač', rating:5, date:'24. jul 2026.', text:'Osoblje je izuzetno ljubazno, deca se raduju odlasku kod zubara.'}
    ]
  },
  {
    id:'trg-slobode-dent', name:'Trg Slobode Dent', city:'Subotica',
    address:'Trg slobode 3, Subotica',
    phone:'+381 24 664 8871', website:'https://example.com',
    priceRange:1, rating:4.3, reviewCount:29, verified:false,
    services:['opsta','decija','endodoncija'],
    short:'Pristupačna porodična ordinacija u centru grada.',
    description:'Trg Slobode Dent je porodična ordinacija koja pruža širok spektar usluga opšte stomatologije po pristupačnim cenama, uz poseban program prevencije za decu školskog uzrasta.',
    hours:{mon:'08:00-18:00',tue:'08:00-18:00',wed:'08:00-18:00',thu:'08:00-18:00',fri:'08:00-18:00',sat:null,sun:null},
    images:['trgslobode-1','trgslobode-2','trgslobode-3'],
    logoInitials:'TS', logoColor:'#DB2777',
    reviews:[
      {name:'Boris Fazekaš', rating:4, date:'19. maj 2026.', text:'Korektna ordinacija, brzo zakazivanje termina.'}
    ]
  },
  {
    id:'implanta-dent-subotica', name:'Implanta Dent', city:'Subotica',
    address:'Segedinski put 84, Subotica',
    phone:'+381 24 715 2290', website:'https://example.com',
    priceRange:3, rating:4.9, reviewCount:45, verified:true, featured:true,
    services:['implantologija','protetika','oralna-hirurgija'],
    short:'Specijalizovana klinika za implantologiju sa garancijom na radove.',
    description:'Implanta Dent nudi kompletnu implanto-protetsku rehabilitaciju sa pisanom garancijom na sve radove. Klinika sarađuje sa priznatim proizvođačima implanata i koristi digitalno planiranje terapije.',
    hours:{mon:'09:00-19:00',tue:'09:00-19:00',wed:'09:00-19:00',thu:'09:00-19:00',fri:'09:00-19:00',sat:'09:00-13:00',sun:null},
    images:['implantadent-1','implantadent-2','implantadent-3'],
    logoInitials:'ID', logoColor:'#2563EB',
    reviews:[
      {name:'Robert Horvat', rating:5, date:'8. avgust 2026.', text:'Pisana garancija na implant mi je dala sigurnost da uradim zahvat baš ovde.'}
    ]
  },
  {
    id:'bela-linija-subotica', name:'Bela Linija', city:'Subotica',
    address:'Matka Vukovića 12, Subotica',
    phone:'+381 24 400 6612', website:'https://example.com',
    priceRange:2, rating:4.6, reviewCount:37, verified:false,
    services:['estetska','parodontologija','opsta'],
    short:'Nega zuba i desni sa akcentom na prevenciju i estetiku.',
    description:'Bela Linija se fokusira na prevenciju oboljenja desni i estetsko održavanje osmeha kroz redovno profesionalno čišćenje i izbeljivanje. Ordinacija radi po principu individualnog plana nege.',
    hours:{mon:'08:30-19:00',tue:'08:30-19:00',wed:'08:30-19:00',thu:'08:30-19:00',fri:'08:30-19:00',sat:'09:00-13:00',sun:null},
    images:['belalinija-1','belalinija-2','belalinija-3'],
    logoInitials:'BL', logoColor:'#059669',
    reviews:[
      {name:'Sofija Balaž', rating:5, date:'2. jun 2026.', text:'Individualni plan nege desni je konačno rešio moj problem sa krvarenjem.'}
    ]
  }
];

// Izračunavanje broja ordinacija po gradu
CITIES.forEach(c => { c.count = CLINICS.filter(cl => cl.city === c.name).length; });

// Približne geografske koordinate centra svakog grada (za mapu i pretragu po blizini)
const CITY_CENTERS = {
  'Beograd': {lat:44.7866, lng:20.4489},
  'Novi Sad': {lat:45.2671, lng:19.8335},
  'Niš': {lat:43.3209, lng:21.8958},
  'Kragujevac': {lat:44.0128, lng:20.9114},
  'Subotica': {lat:46.1008, lng:19.6650}
};

// Dodeljivanje koordinata jednoj ordinaciji u okviru grada — deterministički
// na osnovu rednog broja, tako da svaka ordinacija dobije svoju tačku na mapi.
function assignCoordsForCity(city, n){
  const center = CITY_CENTERS[city] || CITY_CENTERS['Beograd'];
  const angle = (n * 137.508) * (Math.PI / 180);
  const radius = 0.008 + (n % 5) * 0.0055;
  return {
    lat: center.lat + radius * Math.cos(angle),
    lng: center.lng + (radius * Math.sin(angle)) / Math.cos(center.lat * Math.PI / 180)
  };
}

// Dodeljivanje koordinata svim ordinacijama iz glavnog imenika.
(function assignClinicCoordinates(){
  const cityCounters = {};
  CLINICS.forEach(c => {
    cityCounters[c.city] = (cityCounters[c.city] || 0) + 1;
    Object.assign(c, assignCoordsForCity(c.city, cityCounters[c.city]));
  });
})();

// Haversine formula — udaljenost u kilometrima između dve geografske tačke
function distanceKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Zajednička naslovna fotografija za sve ordinacije (dok vlasnici ne dodaju
// sopstvene fotografije). Parametar seed se čuva radi kompatibilnosti poziva.
function clinicImageUrl(seed, w=800, h=600){
  return 'img/ordinacija-cover.webp';
}

/* Recenzije koje posetioci ostavljaju preko sajta (van seed podataka) —
   deljene funkcije, dostupne na svim stranicama (ne samo ordinacija.html). */
function extraReviewsKey(id){ return 'nz_reviews_' + id; }
function getExtraReviews(id){
  try{ return JSON.parse(localStorage.getItem(extraReviewsKey(id)) || '[]'); }
  catch(e){ return []; }
}
function setExtraReviews(id, list){
  localStorage.setItem(extraReviewsKey(id), JSON.stringify(list));
}
function saveExtraReview(id, review){
  const list = getExtraReviews(id);
  list.unshift(review);
  setExtraReviews(id, list);
}
function updateExtraReview(clinicId, reviewId, fields){
  const list = getExtraReviews(clinicId);
  const item = list.find(r => r.id === reviewId);
  if(item) Object.assign(item, fields);
  setExtraReviews(clinicId, list);
}
function deleteExtraReview(clinicId, reviewId){
  const list = getExtraReviews(clinicId).filter(r => r.id !== reviewId);
  setExtraReviews(clinicId, list);
}

/* =========================================================
   Oglasi koje su dodali vlasnici ordinacija (js/auth.js, "Moji
   oglasi") se čuvaju odvojeno od glavnog imenika, ali se ovde
   pretvaraju u isti oblik da bi se stvarno pojavili u pretrazi,
   na mapi i na sopstvenoj strani — sve unutar istog pretraživača.
   ========================================================= */
function normalizeMyListing(l){
  const extra = (typeof getExtraReviews === 'function') ? getExtraReviews(l.id) : [];
  return {
    id: l.id,
    name: l.name,
    city: l.city,
    address: l.address || (l.city ? `${l.city}` : ''),
    phone: l.phone || '',
    website: l.website || '#',
    priceRange: l.priceRange || 2,
    rating: extra.length ? (extra.reduce((a,r)=>a+r.rating,0)/extra.length) : 0,
    reviewCount: extra.length,
    verified: false,
    ownerListing: true,
    plan: l.plan || 'besplatno',
    featured: l.plan === 'premium',
    services: l.services && l.services.length ? l.services : ['opsta'],
    short: l.description ? (l.description.length > 90 ? l.description.slice(0,90)+'…' : l.description) : 'Novododata ordinacija.',
    description: l.description || 'Vlasnik ove ordinacije još nije dodao detaljan opis.',
    hours: l.hours || {mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-14:00',sun:null},
    images: [`my-listing-${l.id}-1`, `my-listing-${l.id}-2`, `my-listing-${l.id}-3`],
    logoInitials: l.logoImage ? '' : (l.name||'O').charAt(0).toUpperCase(),
    logoColor: l.logoColor || '#0EA5A3',
    logoImage: l.logoImage || null,
    reviews: [],
    ...assignCoordsForCity(l.city, (Math.abs(hashCode(l.id)) % 5) + 1)
  };
}

function hashCode(str){
  let h = 0;
  for(let i=0; i<str.length; i++){ h = ((h<<5)-h) + str.charCodeAt(i); h |= 0; }
  return h;
}

// Svi javno vidljivi oglasi: glavni imenik + oglasi dodati kroz "Dodaj ordinaciju"
// (u okviru ovog pretraživača).
function getImportedClinics(){
  return (typeof IMPORTED_CLINICS !== 'undefined') ? IMPORTED_CLINICS : [];
}

function getAllPublicListings(){
  const mine = (typeof getMyListings === 'function') ? getMyListings() : [];
  return CLINICS.concat(getImportedClinics()).concat(mine.map(normalizeMyListing));
}

function getClinicById(id){
  const found = CLINICS.find(c => c.id === id) || getImportedClinics().find(c => c.id === id);
  if(found) return found;
  if(typeof getMyListingById === 'function'){
    const mine = getMyListingById(id);
    if(mine) return normalizeMyListing(mine);
  }
  return null;
}

// Sve gradove (imenik + uvezene ordinacije) — koristi se za popunjavanje
// padajućih lista za pretragu, umesto samo 5 "izlog" gradova iz CITIES.
function getAllCityNames(){
  const set = new Set();
  getAllPublicListings().forEach(c => { if(c.city && c.city !== 'Nepoznato') set.add(c.city); });
  return Array.from(set).sort((a,b) => a.localeCompare(b, 'sr'));
}

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = {mon:'Ponedeljak',tue:'Utorak',wed:'Sreda',thu:'Četvrtak',fri:'Petak',sat:'Subota',sun:'Nedelja'};

function isOpenNow(hours){
  const now = new Date();
  const todayKey = DAY_KEYS[now.getDay()];
  const range = hours[todayKey];
  if(!range) return false;
  const [start,end] = range.split('-');
  const [sh,sm] = start.split(':').map(Number);
  const [eh,em] = end.split(':').map(Number);
  const startMin = sh*60+sm, endMin = eh*60+em;
  const nowMin = now.getHours()*60 + now.getMinutes();
  return nowMin >= startMin && nowMin <= endMin;
}

function todayKey(){
  return DAY_KEYS[new Date().getDay()];
}

function priceLabel(n){
  return n ? '$'.repeat(n) : '';
}
