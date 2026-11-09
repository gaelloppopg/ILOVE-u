// js/cuponera.js
import { supabase } from './supabase.js';

let coupleId = null;
let userId = null;
let misPuntos = 0;

async function initCuponera() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  userId = user.id;

  const { data: couple } = await supabase.from('couples').select('id').or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`).maybeSingle();
  if (!couple) return;
  coupleId = couple.id;

  await cargarPuntos();
  await cargarCupones();
}

async function cargarPuntos() {
  const { data } = await supabase.from('puntos').select('puntos').eq('couple_id', coupleId).eq('user_id', userId).maybeSingle();
  misPuntos = data ? data.puntos : 0;
  const el = document.getElementById("saldoPuntos");
  if (el) el.textContent = misPuntos;
}

async function cargarCupones() {
  const grid = document.getElementById("cuponesGrid");
  if (!grid) return;

  // Por ahora no hay cupones en la base de datos (los agregaremos en el panel de admin)
  const { data: cuponesDB } = await supabase.from('cupones').select('*').eq('couple_id', coupleId);

  if (!cuponesDB || cuponesDB.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; color: #a08bb8; font-family:'Cormorant Garamond', serif; font-style: italic; font-size: 1.1rem;">
      <strong style="display:block; font-family:'Playfair Display', serif; font-style:normal; font-size:1.5rem; color:#a874e8; margin-bottom:10px;">Aún no hay cupones</strong>
      Los cupones se agregarán desde el Panel de Administración.
    </div>`;
    return;
  }

  grid.innerHTML = cuponesDB.map(c => {
    const alcanza = misPuntos >= c.costo;
    return `
      <div class="cupon visible ${!alcanza ? 'canjeado' : ''}">
        <div class="cupon-emoji">${c.emoji}</div>
        <h3>${c.titulo}</h3>
        <p class="cupon-costo">${c.costo} puntos</p>
        <button class="btn ${!alcanza ? 'btn-locked' : 'btn-primary'}" data-id="${c.id}" ${!alcanza ? 'disabled' : ''}>
          ${alcanza ? 'Canjear' : 'Faltan puntos'}
        </button>
      </div>
    `;
  }).join("");

  grid.querySelectorAll("button[data-id]").forEach(btn => {
    btn.onclick = () => canjear(btn.dataset.id, cuponesDB);
  });
}

async function canjear(id, cuponesDB) {
  const cupon = cuponesDB.find(c => c.id === id);
  if (!cupon || misPuntos < cupon.costo) return;

  // Descontar puntos
  await supabase.from('puntos').update({ puntos: misPuntos - cupon.costo }).eq('couple_id', coupleId).eq('user_id', userId);
  
  await cargarPuntos();
  await cargarCupones();
  alert("¡Cupón canjeado con éxito! 💜");
  if (window.lanzarConfeti) window.lanzarConfeti(1500);
}

document.addEventListener("DOMContentLoaded", initCuponera);