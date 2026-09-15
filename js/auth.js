/* =========================================================
   Nađi Zubara — demo nalozi (localStorage)
   NAPOMENA: Ovo je demonstracioni sistem prijave bez pravog
   servera, baze podataka ili enkripcije. Za pravu produkciju
   potrebno je povezati pravi backend (npr. Supabase/Firebase)
   i sistem naplate (npr. Stripe).
   ========================================================= */

const SESSION_KEY = 'nz_session';
const MY_LISTINGS_KEY = 'nz_my_listings';

function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch(e){ return null; }
}
function setSession(session){
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function clearSession(){
  localStorage.removeItem(SESSION_KEY);
}

function registerDemoUser({name, email, username, role}){
  const session = {
    name: name || username || 'Korisnik',
    email: email || '',
    username: username || (email ? email.split('@')[0] : 'korisnik'),
    role: role === 'business' ? 'business' : 'customer',
    joined: new Date().toISOString()
  };
  setSession(session);
  return session;
}

function loginDemoUser({identifier}){
  const existing = getSession();
  if(existing && (existing.email === identifier || existing.username === identifier)){
    return existing;
  }
  const isEmail = identifier.includes('@');
  const session = {
    name: identifier.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Korisnik',
    email: isEmail ? identifier : `${identifier}@example.com`,
    username: isEmail ? identifier.split('@')[0] : identifier,
    role: 'customer',
    joined: new Date().toISOString()
  };
  setSession(session);
  return session;
}

function switchRole(role){
  const s = getSession();
  if(!s) return null;
  s.role = role === 'business' ? 'business' : 'customer';
  setSession(s);
  return s;
}

function updateSessionDetails(fields){
  const s = getSession();
  if(!s) return null;
  Object.assign(s, fields);
  setSession(s);
  return s;
}

function getMyListings(){
  try{ return JSON.parse(localStorage.getItem(MY_LISTINGS_KEY) || '[]'); }
  catch(e){ return []; }
}
function addMyListing(listing){
  const list = getMyListings();
  const entry = Object.assign({
    id: 'my-' + Date.now(),
    plan: 'besplatno',
    createdAt: new Date().toISOString()
  }, listing);
  list.unshift(entry);
  localStorage.setItem(MY_LISTINGS_KEY, JSON.stringify(list));
  return entry;
}
function getMyListingById(id){
  return getMyListings().find(x => x.id === id);
}
function updateMyListingData(id, fields){
  const list = getMyListings();
  const item = list.find(x => x.id === id);
  if(item){
    Object.assign(item, fields);
    localStorage.setItem(MY_LISTINGS_KEY, JSON.stringify(list));
  }
  return item;
}
function updateListingPlan(id, plan){
  const list = getMyListings();
  const item = list.find(x => x.id === id);
  if(item){
    item.plan = plan;
    localStorage.setItem(MY_LISTINGS_KEY, JSON.stringify(list));
  }
  return item;
}
function removeMyListing(id){
  const list = getMyListings().filter(x => x.id !== id);
  localStorage.setItem(MY_LISTINGS_KEY, JSON.stringify(list));
}

const APPOINTMENTS_KEY = 'nz_appointments';

function getAllAppointments(){
  try{ return JSON.parse(localStorage.getItem(APPOINTMENTS_KEY) || '[]'); }
  catch(e){ return []; }
}
function getMyAppointments(){
  const session = getSession();
  if(!session) return [];
  return getAllAppointments().filter(a => a.username === session.username);
}
function addAppointment(appt){
  const session = getSession();
  if(!session) return null;
  const list = getAllAppointments();
  const entry = Object.assign({
    id: 'apt-' + Date.now(),
    username: session.username,
    patientName: session.name,
    status: 'zakazano',
    createdAt: new Date().toISOString()
  }, appt);
  list.unshift(entry);
  localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
  return entry;
}
function cancelAppointment(id){
  const list = getAllAppointments().filter(a => a.id !== id);
  localStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
}

function requireLogin(redirectTo){
  const s = getSession();
  if(!s){
    window.location.href = 'prijava.html' + (redirectTo ? '?redirect=' + encodeURIComponent(redirectTo) : '');
    return null;
  }
  return s;
}
