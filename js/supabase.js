import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://fetxdywxlqhgilpfkdrj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_oxDNt6AdCNWhw4SW0QL_kg__Xxzmljk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true // 🛑 Cambiado a true por si usas login con OAuth
  },
  db: {
    schema: 'public' // 🛑 Forzamos el esquema público
  }
})

window.supabase = supabase;