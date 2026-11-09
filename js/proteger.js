import { supabase } from './supabase.js';

export async function protegerRuta() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    const enPages = window.location.pathname.includes("/pages/");
    window.location.replace(enPages ? "../login.html" : "login.html");
    return null;
  }

  // Buscamos la pareja que tenga relación con el ID de la sesión actual
  const { data: couple } = await supabase
    .from('couples')
    .select('*')
    .or(`owner_id.eq.${session.user.id},partner_id.eq.${session.user.id}`)
    .maybeSingle();

  if (!couple) {
    const enPages = window.location.pathname.includes("/pages/");
    window.location.replace(enPages ? "../login.html" : "login.html");
    return null;
  }

  // 🛑 VERIFICACIÓN ESTRICTA POR ID
  const esOwner = String(couple.owner_id) === String(session.user.id);
  const esPartner = String(couple.partner_id) === String(session.user.id);

  // Si por alguna razón no es ni owner ni partner (sesión corrupta), expulsar
  if (!esOwner && !esPartner) {
    const enPages = window.location.pathname.includes("/pages/");
    window.location.replace(enPages ? "../login.html" : "login.html");
    return null;
  }

  return { user: session.user, couple, esOwner, esPartner };
}