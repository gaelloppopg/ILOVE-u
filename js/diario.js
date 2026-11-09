import { supabase } from './supabase.js';

let coupleId = null;
let creadorNombre = "Creador";
let parejaNombre = "Pareja";
let entradas = [];
let filtroTexto = "";
const COLORES = ["amarillo", "rosa", "celeste", "verde", "naranja", "lila"];

function formatearFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escaparHTML(texto) {
  if (!texto) return "";
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function hashCode(str) {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return hash;
}

// 1. INICIAR EL DIARIO
async function initDiario() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: couple } = await supabase.from('couples').select('*').or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`).maybeSingle();
  if (!couple) return;
  
  coupleId = couple.id;
  creadorNombre = couple.creador_nombre || "Creador";
  parejaNombre = couple.pareja_nombre || "Pareja";

  // Enlazar eventos
  const btnNueva = document.getElementById("btnNuevaEntrada");
  if (btnNueva) btnNueva.onclick = abrirEscritura;

  const buscador = document.getElementById("buscadorDiario");
  if (buscador) buscador.oninput = (e) => { filtroTexto = e.target.value; renderizarMural(); };

  // Cargar las notas
  await cargarEntradas();
}

// 2. CARGAR DESDE SUPABASE
async function cargarEntradas() {
  const sync = document.getElementById("diarioSync");
  if (sync) sync.className = "diario-sync sincronizando";

  const { data, error } = await supabase
    .from('diario_entries')
    .select('*')
    .eq('couple_id', coupleId)
    .order('fecha', { ascending: false });

  if (error) {
    console.error("Error al cargar:", error);
    if (sync) sync.className = "diario-sync error";
    return;
  }

  entradas = data || [];
  if (sync) sync.className = "diario-sync";
  renderizarMural();
}

// 3. DIBUJAR LAS NOTAS EN PANTALLA
function renderizarMural() {
  const grid = document.getElementById("muralGrid");
  if (!grid) return;

  const filtro = filtroTexto.trim().toLowerCase();
  const filtradas = filtro ? entradas.filter(e => (e.titulo || "").toLowerCase().includes(filtro) || (e.texto || "").toLowerCase().includes(filtro)) : entradas;

  if (filtradas.length === 0) {
    grid.innerHTML = `<div class="diario-vacio"><strong>El diario está vacío</strong>Escriban la primera entrada juntos.</div>`;
    return;
  }

  grid.innerHTML = filtradas.map((e) => {
    const rot = ((hashCode(e.id) % 5) - 2) * 0.7;
    const color = COLORES[Math.abs(hashCode(e.id)) % COLORES.length];
    return `
      <article class="post-it color-${color} visible" data-id="${e.id}" style="--rot: ${rot}deg;">
        <div class="post-it-chinche"></div>
        <div class="post-it-meta">
          <span class="post-it-autor">✎ ${escaparHTML(e.autor)}</span>
          <span class="post-it-fecha">${formatearFecha(e.fecha)}</span>
        </div>
        <h3 class="post-it-titulo">${escaparHTML(e.titulo)}</h3>
        <p class="post-it-preview">${escaparHTML((e.texto || "").slice(0, 150))}</p>
        <div class="post-it-hint">Leer →</div>
      </article>
    `;
  }).join("");

  // Hacer clickeables las notas
  grid.querySelectorAll(".post-it").forEach(p => {
    p.onclick = () => {
      const entrada = entradas.find(x => x.id === p.dataset.id);
      if (entrada) abrirLectura(entrada);
    };
  });
}

// 4. LEER UNA NOTA
function abrirLectura(entrada) {
  const modal = document.createElement("div");
  modal.className = "diario-modal activo";
  modal.innerHTML = `
    <div class="diario-papel">
      <button class="diario-cerrar">✕</button>
      <div class="diario-modal-meta"><span class="diario-modal-autor">✎ ${escaparHTML(entrada.autor)}</span><span class="diario-modal-fecha">${formatearFecha(entrada.fecha)}</span></div>
      <h2 class="diario-modal-titulo">${escaparHTML(entrada.titulo)}</h2>
      <div class="diario-modal-cuerpo">${escaparHTML(entrada.texto)}</div>
      <div class="diario-modal-acciones"><button class="btn-diario peligro" id="btnBorrar">Eliminar</button><button class="btn-diario neutro" id="btnCerrar">Cerrar</button></div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  
  const cerrar = () => { modal.remove(); document.body.style.overflow = ""; };
  modal.querySelector(".diario-cerrar").onclick = cerrar;
  modal.querySelector("#btnCerrar").onclick = cerrar;
  modal.querySelector("#btnBorrar").onclick = async () => {
    if (confirm("¿Eliminar esta entrada?")) { 
      await supabase.from('diario_entries').delete().eq('id', entrada.id); 
      cargarEntradas(); 
      cerrar(); 
    }
  };
}

// 5. CREAR UNA NOTA NUEVA
function abrirEscritura() {
  if (!coupleId) return alert("Cargando... espera un segundo.");

  let autorSeleccionado = creadorNombre;

  const modal = document.createElement("div");
  modal.className = "diario-modal activo";
  modal.innerHTML = `
    <div class="diario-papel">
      <button class="diario-cerrar">✕</button>
      <h2 class="diario-modal-titulo" style="margin-bottom:30px;">Nueva entrada</h2>
      <div class="diario-form">
        
        <div class="diario-campo">
          <label class="diario-label">¿Quién escribe?</label>
          <div class="diario-autores">
            <button type="button" class="diario-autor-btn activo" data-autor="${creadorNombre}">✎ ${creadorNombre}</button>
            <button type="button" class="diario-autor-btn" data-autor="${parejaNombre}">✿ ${parejaNombre}</button>
          </div>
        </div>

        <div class="diario-campo"><label class="diario-label">Título</label><input type="text" id="diarioTitulo" class="diario-input" /></div>
        <div class="diario-campo"><label class="diario-label">Texto</label><textarea id="diarioTexto" class="diario-textarea"></textarea></div>
        
        <div class="diario-form-acciones"><button class="btn-diario primario" id="btnGuardar">Publicar</button><button class="btn-diario neutro" id="btnCancelar">Cancelar</button></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  modal.querySelectorAll(".diario-autor-btn").forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll(".diario-autor-btn").forEach(b => b.classList.remove("activo"));
      btn.classList.add("activo");
      autorSeleccionado = btn.dataset.autor;
    };
  });

  const cerrar = () => { modal.remove(); document.body.style.overflow = ""; };
  modal.querySelector(".diario-cerrar").onclick = cerrar;
  modal.querySelector("#btnCancelar").onclick = cerrar;
  
  modal.querySelector("#btnGuardar").onclick = async () => {
    const titulo = modal.querySelector("#diarioTitulo").value.trim();
    const texto = modal.querySelector("#diarioTexto").value.trim();
    
    if (!titulo && !texto) return alert("Escribe algo 💜");

    const btn = modal.querySelector("#btnGuardar");
    btn.textContent = "Guardando...";
    btn.disabled = true;

    const { error } = await supabase.from('diario_entries').insert([{ 
      couple_id: coupleId, 
      titulo: titulo || "Sin título", 
      texto, 
      autor: autorSeleccionado 
    }]);

    if (error) { 
      alert("Error: " + error.message); 
      btn.textContent = "Publicar";
      btn.disabled = false;
    } else { 
      cerrar(); 
      await cargarEntradas(); // Recargamos la lista inmediatamente
      if(window.lanzarConfeti) window.lanzarConfeti(1000); 
    }
  };
}

// Arrancar todo asegurando que el DOM esté listo
document.addEventListener("DOMContentLoaded", initDiario);