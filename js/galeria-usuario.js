import { supabase } from './supabase.js';
import { subirArchivo } from './storage.js';

let coupleId = null;
let creadorNombre = "Creador";
let parejaNombre = "Pareja";
let todosLosRecuerdos = [];
let albumsDisponibles = [];

async function initGaleria() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: couple } = await supabase.from('couples').select('*').or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`).maybeSingle();
  if (!couple) return;

  coupleId = couple.id;
  creadorNombre = couple.creador_nombre || "Creador";
  parejaNombre = couple.pareja_nombre || "Pareja";

  document.getElementById("btnAgregarRecuerdo").onclick = () => abrirModalSubida("imagen");
  document.getElementById("btnAgregarVideo").onclick = () => abrirModalSubida("video");

  await cargarDatos();
}

async function cargarDatos() {
  const { data: recs } = await supabase.from('recuerdos').select('*').eq('couple_id', coupleId).order('fecha', { ascending: false });
  todosLosRecuerdos = recs || [];

  const { data: albs } = await supabase.from('albums').select('*').eq('couple_id', coupleId);
  albumsDisponibles = albs || [];

  renderizarFiltros();
  renderizarRecuerdos();
}

function renderizarFiltros() {
  const contenedor = document.getElementById("recuerdosFiltros");
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="filtros-barra">
      <div class="filtro-grupo">
        <label class="filtro-label">📁 Álbum</label>
        <select id="filtroAlbum" class="filtro-select">
          <option value="sin-album">📷 Sin álbum</option>
          ${albumsDisponibles.map(a => `<option value="${a.id}">${a.emoji} ${a.nombre}</option>`).join("")}
        </select>
      </div>
      <div class="filtro-grupo">
        <label class="filtro-label">🔍 Buscar</label>
        <input type="text" id="filtroBusqueda" class="filtro-input" placeholder="Buscar por título...">
      </div>
      <button class="btn-nuevo-album" id="btnNuevoAlbum">➕ Nuevo álbum</button>
    </div>
  `;

  document.getElementById("btnNuevoAlbum").onclick = crearAlbum;
}

async function crearAlbum() {
  const nombre = prompt("Nombre del álbum (ej: Playa, Cumpleaños):");
  if (!nombre) return;
  const emoji = prompt("Un emoji para el álbum:", "📸") || "📸";

  await supabase.from('albums').insert([{ couple_id: coupleId, nombre, emoji, autor: creadorNombre }]);
  cargarDatos();
}

function renderizarRecuerdos() {
  const contenedor = document.getElementById("galeriaUsuarioRecuerdos");
  if (!contenedor) return;

  const fotos = todosLosRecuerdos.filter(r => r.tipo === 'imagen');

  if (fotos.length === 0) {
    contenedor.innerHTML = `<div style="text-align:center;padding:60px;color:#a08bb8;">No hay fotos aún 💜</div>`;
    return;
  }

  contenedor.innerHTML = fotos.map(item => `
    <figure class="galeria-item reveal visible">
      <img src="${item.url}" alt="${item.titulo}" loading="lazy">
      <figcaption>
        <div class="recuerdo-fecha">${new Date(item.fecha).toLocaleDateString('es-ES')} · ${item.autor}</div>
        <p class="recuerdo-texto">${item.descripcion || item.titulo}</p>
        <button class="btn-eliminar-recuerdo" onclick="eliminarRecuerdo('${item.id}')">🗑️</button>
      </figcaption>
    </figure>
  `).join("");
}

window.eliminarRecuerdo = async function(id) {
  if (!confirm("¿Eliminar este recuerdo?")) return;
  await supabase.from('recuerdos').delete().eq('id', id);
  cargarDatos();
};

function abrirModalSubida(tipo) {
  if (!coupleId) return alert("Cargando...");

  let autorSeleccionado = creadorNombre;

  const modal = document.createElement("div");
  modal.className = "subida-modal activo";
  modal.innerHTML = `
    <div class="subida-papel">
      <button class="subida-cerrar">✕</button>
      <h2 class="subida-titulo">Nuevo ${tipo === 'video' ? 'video' : 'recuerdo'}</h2>
      
      <div class="subida-campo">
        <label class="subida-label">¿Quién lo sube?</label>
        <div class="subida-autores">
          <button type="button" class="subida-autor-btn activo" data-autor="${creadorNombre}">✎ ${creadorNombre}</button>
          <button type="button" class="subida-autor-btn" data-autor="${parejaNombre}">✿ ${parejaNombre}</button>
        </div>
      </div>

      <div class="subida-campo">
        <label class="subida-label">Archivo</label>
        <input type="file" id="archivoSubida" accept="${tipo === 'video' ? 'video/*' : 'image/*'}" />
      </div>
      
      <div class="subida-campo">
        <label class="subida-label">Título</label>
        <input type="text" id="tituloSubida" class="subida-input" placeholder="¿Qué es?" />
      </div>

      <div class="subida-campo">
        <label class="subida-label">Descripción</label>
        <textarea id="descSubida" class="subida-textarea" placeholder="Contá un poco más..."></textarea>
      </div>

      <div class="subida-campo">
        <label class="subida-label">Álbum</label>
        <select id="albumSubida" class="subida-input">
          <option value="">— Sin álbum —</option>
          ${albumsDisponibles.map(a => `<option value="${a.id}">${a.emoji} ${a.nombre}</option>`).join("")}
        </select>
      </div>

      <div class="subida-acciones">
        <button class="subida-btn primario" id="btnConfirmar">Subir</button>
        <button class="subida-btn neutro" id="btnCancelar">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll(".subida-autor-btn").forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll(".subida-autor-btn").forEach(b => b.classList.remove("activo"));
      btn.classList.add("activo");
      autorSeleccionado = btn.dataset.autor;
    };
  });

  const cerrar = () => modal.remove();
  modal.querySelector(".subida-cerrar").onclick = cerrar;
  modal.querySelector("#btnCancelar").onclick = cerrar;

  modal.querySelector("#btnConfirmar").onclick = async () => {
    const archivo = modal.querySelector("#archivoSubida").files[0];
    const titulo = modal.querySelector("#tituloSubida").value.trim();
    const desc = modal.querySelector("#descSubida").value.trim();
    const albumId = modal.querySelector("#albumSubida").value;

    if (!archivo) return alert("Selecciona un archivo");

    const btn = modal.querySelector("#btnConfirmar");
    btn.textContent = "Subiendo...";
    btn.disabled = true;

    try {
      const { url } = await subirArchivo(archivo, "recuerdos");
      await supabase.from('recuerdos').insert([{ 
        couple_id: coupleId, 
        titulo: titulo || "Recuerdo", 
        descripcion: desc,
        url, 
        tipo, 
        autor: autorSeleccionado,
        album_id: albumId || null
      }]);
      cerrar();
      cargarDatos();
      if (window.lanzarConfeti) window.lanzarConfeti(1000);
    } catch (err) {
      alert("Error: " + err.message);
      btn.textContent = "Subir";
      btn.disabled = false;
    }
  };
}

initGaleria();