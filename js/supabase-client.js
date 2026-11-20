/* Supabase klijent. Koristi se SAMO javni (publishable) ključ iz js/supabase-config.js;
   zaštitu podataka obezbeđuje Row Level Security u bazi. Biblioteka se učitava sa CDN-a
   (fiksna verzija + SRI) u stranicama koje je koriste, pre ovog fajla. */
const sb = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
    })
  : null;
