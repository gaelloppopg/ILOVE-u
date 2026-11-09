// js/auth.js
import { supabase } from './supabase.js';

// REGISTRO Y CREACIÓN DE PAREJA
export async function registrarUsuario(email, password, nombrePareja, fechaInicio) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) throw authError;

  if (authData.user) {
    const { error: coupleError } = await supabase
      .from('couples')
      .insert([
        {
          owner_id: authData.user.id,
          nombre_pareja: nombrePareja,
          fecha_inicio: fechaInicio
        }
      ]);

    if (coupleError) {
      console.error("Error creando pareja:", coupleError);
      throw coupleError;
    }
  }
  return authData;
}

// INICIAR Y CERRAR SESIÓN
export async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
}

// OBTENER DATOS DEL USUARIO Y SU PAREJA
export async function obtenerUsuarioActual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: couple, error } = await supabase
    .from('couples')
    .select('*')
    .or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`)
    .maybeSingle();

  if (error) {
    console.error("Error obteniendo pareja:", error);
    return { user, couple: null };
  }

  return { user, couple };
}

// GENERAR CÓDIGO DE INVITACIÓN
export async function generarCodigoInvitacion(coupleId) {
  const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from('invitations')
    .insert([
      {
        couple_id: coupleId,
        code: codigo,
        used: false
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data.code;
}

// UNIRSE A UNA PAREJA CON CÓDIGO
export async function unirseConCodigo(codigo) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión primero.");

  const { data: invitacion, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('code', codigo)
    .eq('used', false)
    .maybeSingle();

  if (invError) throw invError;
  if (!invitacion) throw new Error("Código inválido o ya utilizado.");

  const { error: coupleError } = await supabase
    .from('couples')
    .update({ partner_id: user.id })
    .eq('id', invitacion.couple_id);

  if (coupleError) throw coupleError;

  await supabase
    .from('invitations')
    .update({ used: true })
    .eq('id', invitacion.id);

  return true;
}