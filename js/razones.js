// js/razones.js
import { supabase } from './supabase.js';

let coupleId = null;
let razones = [];
let filtroTexto = "";

function numeroRazon(n) { return String(n).padStart(3, "0"); }

async function initRazones() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: couple } = await supabase.from('couples').select('id').or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`).maybeSingle();
  if (!couple) return;
  coupleId = couple.id;

  const btnNuevaRazon = document.getElementById("btnNuevaRazon");
  if (btnNuevaRazon) btnNuevaRazon.style.display = "none";

  document.getElementById("buscadorRazones").oninput = (e) => { filtroTexto = e.target.value; renderRazones(filtroTexto); };
  await cargarRazones();
}

async function cargarRazones() {
  const { data, error } = await supabase.from('razones').select('*').eq('couple_id', coupleId).order('numero', { ascending: true });
  if (!error) { razones = data || []; renderRazones(); }
}

function renderRazones(filtro = "") {
  const grid = document.getElementById("razonesGrid");
  if (!grid) return;

  const filtroLower = filtro.trim().toLowerCase();
  const lista = filtroLower ? razones.filter(r => (r.texto || "").toLowerCase().includes(filtroLower)) : razones;

  if (lista.length === 0) {
    grid.innerHTML = `<div class="razones-vacio">Aún no hay razones. Agrégalas desde el Panel de Administración.</div>`;
    document.getElementById("contadorRazones").textContent = 0;
    return;
  }

  grid.innerHTML = lista.map((r, i) => `
    <article class="petalo visible" data-id="${r.id}" style="transition-delay: ${Math.min(i * 40, 600)}ms">
      <button class="petalo-delete" data-id="${r.id}" title="Eliminar">🗑️</button>
      <span class="petalo-num">Razón <strong>${numeroRazon(r.numero || i + 1)}</strong></span>
      <p class="petalo-texto">${r.texto}</p>
      ${r.descripcion ? `<p class="petalo-desc">${r.descripcion}</p>` : ""}
    </article>
  `).join("");

  document.getElementById("contadorRazones").textContent = razones.length;

  grid.querySelectorAll(".petalo").forEach(p => {
    p.onclick = (e) => {
      if (e.target.closest('.petalo-delete')) return;
      const razon = razones.find(x => x.id === p.dataset.id);
      if (razon) abrirRazon(razon);
    };
  });

  grid.querySelectorAll(".petalo-delete").forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!confirm("¿Eliminar esta razón?")) return;
      await supabase.from('razones').delete().eq('id', btn.dataset.id);
      await cargarRazones();
    };
  });
}

function abrirRazon(razon) {
  const modal = document.getElementById("razonModal");
  document.getElementById("razonModalNum").textContent = `Razón ${numeroRazon(razon.numero)}`;
  document.getElementById("razonModalTexto").textContent = razon.texto;
  const descEl = document.getElementById("razonModalDesc");
  if (razon.descripcion) { descEl.textContent = razon.descripcion; descEl.style.display = "block"; } else { descEl.style.display = "none"; }
  modal.classList.add("activo"); document.body.style.overflow = "hidden";
}

document.getElementById("razonModalCerrar").onclick = () => document.getElementById("razonModal").classList.remove("activo");
document.getElementById("razonModal").onclick = (e) => { if(e.target === e.currentTarget) e.currentTarget.classList.remove("activo"); };
document.addEventListener("DOMContentLoaded", initRazones);