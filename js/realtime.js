// js/realtime.js
import { supabase } from './supabase.js';

export function iniciarRealtimeGlobal(coupleId) {
  if (!coupleId) return null;

  const channel = supabase.channel(`realtime-global-${coupleId}`);

  const tablas = [
    'mapa_recuerdos', 'recuerdos', 'notas_voz', 'diario_entries', 
    'cartas', 'razones', 'juego_preguntas', 'cupones', 
    'reacciones', 'arte_obras', 'albums', 'perfiles_live'
  ];

  tablas.forEach(tabla => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tabla, filter: `couple_id=eq.${coupleId}` },
      (payload) => {
        console.log(`Realtime [${tabla}] evento: ${payload.eventType}`);
        
        // Disparar un evento personalizado para que la página reaccione
        window.dispatchEvent(new CustomEvent('supabase-cambio', { 
          detail: { tabla: tabla, evento: payload.eventType, data: payload.new || payload.old } 
        }));
      }
    );
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ Conectado a Supabase Realtime Global');
    }
  });

  return channel;
}   