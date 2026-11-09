// js/onesignal.js
import { supabase } from './supabase.js';

// 🛑 TU APP ID REAL DE ONESIGNAL
const ONESIGNAL_APP_ID = "7afbfe76-69af-4382-80a2-85a775b1c33a";

window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
  await OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    allowLocalhostAsSecureOrigin: true, // Permite probar en 127.0.0.1
    notifyButton: { enable: false }, // Sin botón flotante rojo
  });

  // Asociar el usuario de Supabase con OneSignal
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    OneSignal.login(user.id);
    console.log("OneSignal: Usuario logueado con ID de Supabase", user.id);
  }

  // Pedir permiso después de 5 segundos
  setTimeout(() => {
    OneSignal.Notifications.requestPermission().then((aceptado) => {
      console.log("Permiso de notificaciones:", aceptado);
    });
  }, 5000);
});

// js/onesignal.js
// ... (tu código anterior de OneSignal) ...

// 🛑 NUEVA FUNCIÓN PARA ENVIAR NOTIFICACIÓN
export async function enviarNotificacionPareja(titulo, mensaje, coupleId, emisorId) {
  try {
    const { data, error } = await supabase.functions.invoke('notificar-pareja', {
      body: { titulo, mensaje, coupleId, emisorId }
    });
    if (error) throw error;
    console.log("Notificación enviada con éxito:", data);
  } catch (err) {
    console.warn("No se pudo enviar la notificación:", err.message);
  }
}