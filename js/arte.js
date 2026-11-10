import { supabase } from './supabase.js';
import { subirArchivo } from './storage.js';

let coupleId = null;
let obras = [];
let canvas, ctx, canvasFondo, ctxFondo;
let dibujando = false;
let herramienta = "pincel";
let color = "#1a1a1a";
let grosor = 8;
let fondoImagen = null;
let fondoOpacidad = 100;
let fondoColor = "#ffffff";
let paginas = [];
let paginaActual = 0;
const OBRAS_POR_PAGINA = 4;
let obraActualEnMuseo = null;
let modoEdicion = false;
let obraEditandoId = null;
let preferenciaDispositivo = 'auto';

// ============================================================
//  UTILIDADES
// ============================================================
function cargarImagen(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo cargar imagen: " + src));
    img.src = src;
  });
}

function canvasABlob(cnv) {
  return new Promise((res) => cnv.toBlob(res, "image/png"));
}

// ============================================================
//  INICIALIZACIÓN
// ============================================================
async function initArte() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  
  const { data: couple } = await supabase
    .from('couples')
    .select('id, preferencia_dispositivo')
    .or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`)
    .maybeSingle();
  if (!couple) return;
  
  coupleId = couple.id;
  preferenciaDispositivo = couple.preferencia_dispositivo || 'auto';

  if (preferenciaDispositivo === 'auto') {
    const isMobile = window.innerWidth <= 1024 || /Mobi|Android/i.test(navigator.userAgent);
    preferenciaDispositivo = isMobile ? 'movil' : 'escritorio';
  }

  document.body.classList.remove('layout-movil', 'layout-escritorio');
  document.body.classList.add(`layout-${preferenciaDispositivo}`);

  reorganizarUI(preferenciaDispositivo);

  canvasFondo = document.getElementById("lienzoFondo");
  ctxFondo = canvasFondo.getContext("2d");
  canvas = document.getElementById("lienzo");
  ctx = canvas.getContext("2d");
  
  dibujarFondo();

  configurarEventosDibujo();
  configurarEventosUI();
  initPanelTemas();
  initParallaxLibro();
  await cargarObras();
}

// ============================================================
//  REORGANIZACIÓN UI
// ============================================================
function reorganizarUI(dispositivo) {
  const toolbar = document.getElementById('estudioToolbar');
  const topbar = document.getElementById('estudioTopbar');
  const footer = document.getElementById('estudioFooter');
  if (!toolbar || !topbar || !footer) return;

  if (document.getElementById('grupoTituloM')) document.getElementById('grupoTituloM').remove();
  if (document.getElementById('grupoAccionesM')) document.getElementById('grupoAccionesM').remove();

  if (dispositivo === 'movil') {
    const tituloObra = document.getElementById('tituloObra');
    if (tituloObra) {
      const divTitulo = document.createElement('div');
      divTitulo.className = 'tool-group';
      divTitulo.id = 'grupoTituloM';
      divTitulo.innerHTML = '<span class="tool-label">Título de la Obra</span>';
      tituloObra.parentNode.removeChild(tituloObra);
      divTitulo.appendChild(tituloObra);
      toolbar.insertBefore(divTitulo, toolbar.firstChild);
    }

    const divAcciones = document.createElement('div');
    divAcciones.className = 'tool-group';
    divAcciones.id = 'grupoAccionesM';
    divAcciones.style.marginTop = '20px';
    footer.parentNode.removeChild(footer);
    divAcciones.appendChild(footer);
    toolbar.appendChild(divAcciones);
    footer.style.display = 'flex'; 
    footer.style.flexDirection = 'column';
    footer.style.gap = '10px';

    document.getElementById('btnAbrirMenuM').style.display = 'flex';
    topbar.style.display = 'none';
  } else {
    const tituloObra = document.getElementById('tituloObra');
    if (tituloObra) topbar.appendChild(tituloObra);
    topbar.appendChild(footer);
    footer.style.display = 'flex';
    footer.style.flexDirection = 'row';
    footer.style.gap = '10px';
    document.getElementById('btnAbrirMenuM').style.display = 'none';
    topbar.style.display = 'flex';
  }
}

// ============================================================
//  EVENTOS DE DIBUJO
// ============================================================
function configurarEventosDibujo() {
  canvas.addEventListener("mousedown", empezarDibujo);
  canvas.addEventListener("mousemove", dibujar);
  canvas.addEventListener("mouseup", terminarDibujo);
  canvas.addEventListener("mouseleave", terminarDibujo);
  
  document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tool-btn[data-tool]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      herramienta = btn.dataset.tool;
    };
  });

  document.getElementById("grosor").oninput = (e) => {
    grosor = parseInt(e.target.value);
    document.getElementById("grosorValor").textContent = grosor;
  };
  
  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      color = btn.dataset.color;
      document.getElementById("colorPicker").value = color;
    };
  });

  document.getElementById("colorPicker").oninput = (e) => {
    color = e.target.value;
    document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
  };

  // ---- FONDO (capa bloqueada inferior) ----
  document.getElementById("fondoColor").oninput = (e) => { 
    fondoColor = e.target.value; 
    fondoImagen = null; 
    dibujarFondo(); 
  };
  
  document.getElementById("btnSubirFondo").onclick = () => document.getElementById("inputFondo").click();
  document.getElementById("inputFondo").onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => { fondoImagen = img; dibujarFondo(); };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  };
  
  document.getElementById("btnQuitarFondo").onclick = () => { 
    fondoImagen = null; 
    fondoColor = "#ffffff"; 
    document.getElementById("fondoColor").value = "#ffffff";
    dibujarFondo(); 
  };

  // ---- LIMPIAR LIENZO: solo pintura, fondo intacto ----
  document.getElementById("btnLimpiar").onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  
  document.getElementById("btnGuardar").onclick = guardarObra;
}

// ============================================================
//  EVENTOS UI
// ============================================================
function configurarEventosUI() {
  document.getElementById("btnNuevaObra").onclick = () => abrirEstudio();
  document.getElementById("cerrarEstudio").onclick = () => document.getElementById("estudioOverlay").classList.remove("activo");
  
  document.getElementById("btnCerrarLibro").onclick = cerrarLibro;
  document.getElementById("libroPortada").onclick = abrirLibro;
  document.getElementById("btnPrev").onclick = paginaAnterior;
  document.getElementById("btnNext").onclick = paginaSiguiente;

  document.getElementById("btnCerrarMuseo").onclick = () => document.getElementById("museoOverlay").classList.remove("activo");
  document.getElementById("museoOverlay").onclick = (e) => { if (e.target.id === 'museoOverlay') document.getElementById("museoOverlay").classList.remove("activo"); };
  document.getElementById("btnBorrarObra").onclick = borrarObraDesdeMuseo;
  document.getElementById("btnDescargarObra").onclick = descargarObraComoPNG;
  document.getElementById("btnEditarObra").onclick = editarObraDesdeMuseo;

  const btnAbrirMenu = document.getElementById('btnAbrirMenuM');
  const btnCerrarMenu = document.getElementById('btnCerrarMenuM');
  const overlay = document.getElementById('overlayMenu');
  const toolbar = document.getElementById('estudioToolbar');

  if (btnAbrirMenu && overlay) {
    btnAbrirMenu.addEventListener('click', () => { toolbar.classList.add('activo'); overlay.classList.add('activo'); });
    btnCerrarMenu.addEventListener('click', () => { toolbar.classList.remove('activo'); overlay.classList.remove('activo'); });
    overlay.addEventListener('click', () => { toolbar.classList.remove('activo'); overlay.classList.remove('activo'); });

    document.querySelectorAll('.tool-btn, .color-btn').forEach(el => {
      el.addEventListener('click', () => {
        setTimeout(() => { toolbar.classList.remove('activo'); overlay.classList.remove('activo'); }, 150);
      });
    });
  }
}

// ============================================================
//  ESTUDIO
// ============================================================
function abrirEstudio() {
  modoEdicion = false;
  obraEditandoId = null;
  
  document.getElementById("estudioOverlay").classList.add("activo");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  document.getElementById("tituloObra").value = "";
  fondoImagen = null;
  fondoColor = "#ffffff";
  fondoOpacidad = 100;
  document.getElementById("fondoColor").value = "#ffffff";
  dibujarFondo();
}

function dibujarFondo() {
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  if (fondoImagen) {
    ctxFondo.save();
    ctxFondo.globalAlpha = fondoOpacidad / 100;
    ctxFondo.drawImage(fondoImagen, 0, 0, canvasFondo.width, canvasFondo.height);
    ctxFondo.restore();
  } else {
    ctxFondo.fillStyle = fondoColor;
    ctxFondo.fillRect(0, 0, canvasFondo.width, canvasFondo.height);
  }
}

// ============================================================
//  PANEL DE TEMAS
// ============================================================
function initPanelTemas() {
  const btnAbrir = document.getElementById('btnAbrirPanelTemas');
  const btnCerrar = document.getElementById('btnCerrarPanelTemas');
  const overlay = document.getElementById('panelTemasOverlay');
  const drawer = document.getElementById('panelTemasDrawer');
  const body = document.body;
  const items = document.querySelectorAll('.tema-card');
  const previewColor = document.getElementById('previewColorActual');
  if (!btnAbrir) return;

  btnAbrir.onclick = () => { drawer.classList.add('activo'); overlay.classList.add('activo'); };
  const cerrarPanel = () => { drawer.classList.remove('activo'); overlay.classList.remove('activo'); };
  btnCerrar.onclick = cerrarPanel;
  overlay.onclick = cerrarPanel;

  items.forEach(item => {
    item.onclick = () => {
      items.forEach(i => i.classList.remove('activo'));
      item.classList.add('activo');
      const tema = item.dataset.setTema;
      body.setAttribute('data-tema', tema);
      const previewStyle = item.querySelector('.tema-card-preview').style.background;
      previewColor.style.background = previewStyle;
      localStorage.setItem('tema_pagina', tema);
      cerrarPanel();
    };
  });

  const temaGuardado = localStorage.getItem('tema_pagina');
  if (temaGuardado) {
    body.setAttribute('data-tema', temaGuardado);
    const itemActivo = document.querySelector(`.tema-card[data-set-tema="${temaGuardado}"]`);
    if (itemActivo) {
      items.forEach(i => i.classList.remove('activo'));
      itemActivo.classList.add('activo');
      previewColor.style.background = itemActivo.querySelector('.tema-card-preview').style.background;
    }
  }
}

// ============================================================
//  PARALLAX LIBRO
// ============================================================
function initParallaxLibro() {
  const wrapper = document.getElementById("libroWrapper");
  if (!wrapper) return;
  wrapper.addEventListener("mousemove", (e) => {
    if (!wrapper.classList.contains("abierto")) return;
    const rect = wrapper.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    wrapper.style.transform = `rotateX(${-y * 4}deg) rotateY(${x * 4}deg)`;
  });
  wrapper.addEventListener("mouseleave", () => {
    if (wrapper.classList.contains("abierto")) wrapper.style.transform = `rotateX(0deg) rotateY(0deg)`;
  });
}

// ============================================================
//  CARGA DE OBRAS
// ============================================================
async function cargarObras() {
  const { data } = await supabase
    .from('arte_obras')
    .select('*')
    .eq('couple_id', coupleId)
    .order('fecha', { ascending: false });
  obras = data || [];
  generarLibro();
}

function generarLibro() {
  const contenedor = document.getElementById("libroPaginas");
  contenedor.innerHTML = "";
  paginas = [];

  if (obras.length === 0) {
    const hojaVacia = document.createElement("div");
    hojaVacia.className = "hoja";
    hojaVacia.innerHTML = `
      <div class="hoja-cara" style="display:flex; align-items:center; justify-content:center; grid-column: 1/-1; grid-row: 1/-1;">
        <p style="font-family:'Caveat'; font-size:2.5rem; color:#aaa; text-align:center;">Aún no hay obras...<br>Crea la primera.</p>
      </div>
      <div class="hoja-cara trasera"></div>
    `;
    contenedor.appendChild(hojaVacia);
    return;
  }

  for (let i = 0; i < obras.length; i += OBRAS_POR_PAGINA) {
    paginas.push(obras.slice(i, i + OBRAS_POR_PAGINA));
  }

  for (let i = 0; i < paginas.length; i++) {
    const hoja = document.createElement("div");
    hoja.className = "hoja";
    hoja.dataset.index = i;

    const caraFrente = document.createElement("div");
    caraFrente.className = "hoja-cara";
    caraFrente.innerHTML = `${paginas[i].map(obra => crearEstampaHTML(obra)).join("")}`;
    
    const caraTrasera = document.createElement("div");
    caraTrasera.className = "hoja-cara trasera";
    if (i + 1 < paginas.length) {
      caraTrasera.innerHTML = `${paginas[i + 1].map(obra => crearEstampaHTML(obra)).join("")}`;
    }

    hoja.appendChild(caraFrente);
    hoja.appendChild(caraTrasera);
    contenedor.appendChild(hoja);
  }

  actualizarZIndex();
  actualizarControles();
}

function crearEstampaHTML(obra) {
  return `
    <div class="estampa-obra" onclick="event.stopPropagation(); abrirMuseo('${obra.id}')">
      <img src="${obra.imagen_url}" alt="${obra.titulo}" loading="lazy" />
      <h4>${obra.titulo || "Sin título"}</h4>
    </div>
  `;
}

// ============================================================
//  NAVEGACIÓN LIBRO
// ============================================================
function abrirLibro() {
  document.getElementById("libroWrapper").classList.add("abierto");
  document.getElementById("libroControles").classList.add("activo");
  document.getElementById("btnCerrarLibro").style.display = "flex";
  paginaActual = 1;
  actualizarPaginas();
}

function cerrarLibro() {
  const wrapper = document.getElementById("libroWrapper");
  wrapper.classList.remove("abierto");
  wrapper.style.transform = ""; 
  document.getElementById("libroControles").classList.remove("activo");
  document.getElementById("btnCerrarLibro").style.display = "none";
  paginaActual = 0;
  const hojas = document.querySelectorAll(".hoja");
  hojas.forEach(hoja => hoja.classList.remove("volteada"));
  actualizarZIndex();
  actualizarControles();
}

function paginaAnterior() { if (paginaActual > 1) { paginaActual--; animarPagina(); } }
function paginaSiguiente() { if (paginaActual < paginas.length) { paginaActual++; animarPagina(); } }

function animarPagina() {
  const wrapper = document.getElementById("libroWrapper");
  wrapper.classList.add("girando");
  actualizarPaginas();
  setTimeout(() => wrapper.classList.remove("girando"), 1200);
}

function actualizarPaginas() {
  const hojas = document.querySelectorAll(".hoja");
  hojas.forEach((hoja, index) => {
    if (index < paginaActual - 1) hoja.classList.add("volteada");
    else hoja.classList.remove("volteada");
  });
  actualizarZIndex();
  actualizarControles();
}

function actualizarZIndex() {
  const hojas = document.querySelectorAll(".hoja");
  hojas.forEach((hoja, index) => {
    hoja.style.zIndex = hoja.classList.contains("volteada") ? index + 1 : hojas.length - index + 10;
  });
}

function actualizarControles() {
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const indicador = document.getElementById("indicadorPaginas");
  btnPrev.disabled = paginaActual <= 1;
  btnNext.disabled = paginaActual >= paginas.length;
  if (paginaActual === 0) indicador.textContent = "Libro Cerrado";
  else {
    const pag1 = (paginaActual - 1) * 2 + 1;
    const pag2 = pag1 + 1;
    indicador.textContent = `Páginas ${pag1} - ${pag2}`;
  }
}

// ============================================================
//  MUSEO
// ============================================================
window.abrirMuseo = function(id) {
  const obra = obras.find(o => o.id === id);
  if (!obra) return;
  obraActualEnMuseo = obra;
  document.getElementById("museoTitulo").textContent = obra.titulo || "Sin título";
  document.getElementById("museoFecha").textContent = new Date(obra.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById("museoImagen").src = obra.imagen_url;
  document.getElementById("museoOverlay").classList.add("activo");
}

// ============================================================
//  EDICIÓN: RECONSTRUIR CADA CAPA DESDE LA BD/STORAGE
// ============================================================
async function editarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  document.getElementById("museoOverlay").classList.remove("activo");

  modoEdicion = true;
  obraEditandoId = obraActualEnMuseo.id;

  document.getElementById("estudioOverlay").classList.add("activo");
  document.getElementById("tituloObra").value = obraActualEnMuseo.titulo || "";

  // Reset local
  fondoImagen = null;
  fondoColor = "#ffffff";
  fondoOpacidad = 100;
  document.getElementById("fondoColor").value = "#ffffff";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  ctxFondo.fillStyle = "#ffffff";
  ctxFondo.fillRect(0, 0, canvasFondo.width, canvasFondo.height);

  const obra = obraActualEnMuseo;

  // ------------------------------------------------------------
  // CASO A: la BD YA tiene ambas capas separadas → cargar cada una
  // ------------------------------------------------------------
  if (obra.capa_fondo_url && obra.capa_dibujo_url) {
    try {
      const [imgFondo, imgDibujo] = await Promise.all([
        cargarImagen(obra.capa_fondo_url),
        cargarImagen(obra.capa_dibujo_url)
      ]);

      // Fondo → capa inferior
      ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
      ctxFondo.drawImage(imgFondo, 0, 0, canvasFondo.width, canvasFondo.height);
      fondoImagen = imgFondo;

      // Pintura → capa superior (borrable)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgDibujo, 0, 0, canvas.width, canvas.height);
      return;
    } catch (err) {
      console.warn("Fallo cargando capas separadas, se migrará:", err);
      // cae al CASO B
    }
  }

  // ------------------------------------------------------------
  // CASO B: obra antigua (sin capas) → MIGRAR
  //   - La imagen_url (fondo + pintura) se coloca en la CAPA SUPERIOR
  //     para que sea borrable.
  //   - El fondo queda blanco debajo.
  //   - Se guardan las dos capas en Storage y se actualizan las URLs
  //     en la BD, de modo que la próxima edición ya entra por CASO A.
  // ------------------------------------------------------------
  try {
    const imgFull = await cargarImagen(obra.imagen_url);

    // Pintura editable = imagen completa
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgFull, 0, 0, canvas.width, canvas.height);

    // Fondo = blanco sólido
    ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
    ctxFondo.fillStyle = "#ffffff";
    ctxFondo.fillRect(0, 0, canvasFondo.width, canvasFondo.height);

    // ---- Migración: subir ambas capas a Storage y guardar URLs ----
    await migrarObraACapas(obra.id, canvasFondo, canvas);

  } catch (err) {
    console.error("No se pudo migrar la obra:", err);
    alert("No se pudo cargar la obra para editar.");
  }
}

/**
 * Sube las dos capas actuales a Storage y persiste sus URLs en la BD.
 * Se llama al editar una obra antigua para que a partir de ahora tenga capas separadas.
 */
async function migrarObraACapas(obraId, cnvFondo, cnvDibujo) {
  try {
    const blobFondo = await canvasABlob(cnvFondo);
    const blobDibujo = await canvasABlob(cnvDibujo);

    const fileFondo = new File([blobFondo], `fondo_${obraId}.png`, { type: "image/png" });
    const fileDibujo = new File([blobDibujo], `dibujo_${obraId}.png`, { type: "image/png" });

    const [{ url: urlFondo }, { url: urlDibujo }] = await Promise.all([
      subirArchivo(fileFondo, "arte/capas"),
      subirArchivo(fileDibujo, "arte/capas")
    ]);

    await supabase
      .from('arte_obras')
      .update({
        capa_fondo_url: urlFondo,
        capa_dibujo_url: urlDibujo,
        capas_version: 2
      })
      .eq('id', obraId);

    // Actualizar el objeto en memoria para que la próxima edición use CASO A
    if (obraActualEnMuseo && obraActualEnMuseo.id === obraId) {
      obraActualEnMuseo.capa_fondo_url = urlFondo;
      obraActualEnMuseo.capa_dibujo_url = urlDibujo;
      obraActualEnMuseo.capas_version = 2;
    }
    const idx = obras.findIndex(o => o.id === obraId);
    if (idx !== -1) {
      obras[idx].capa_fondo_url = urlFondo;
      obras[idx].capa_dibujo_url = urlDibujo;
      obras[idx].capas_version = 2;
    }

    console.log("Obra migrada a capas separadas ✅");
  } catch (err) {
    console.error("Error en migración de capas:", err);
  }
}

// ============================================================
//  DESCARGAR / BORRAR
// ============================================================
async function descargarObraComoPNG() {
  if (!obraActualEnMuseo || !obraActualEnMuseo.imagen_url) return;
  try {
    const response = await fetch(obraActualEnMuseo.imagen_url);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none'; a.href = url;
    a.download = `Obra-${obraActualEnMuseo.titulo || 'Sin-titulo'}.png`;
    document.body.appendChild(a); a.click();
    window.URL.revokeObjectURL(url); document.body.removeChild(a);
  } catch (error) { alert("Error al descargar: " + error.message); }
}

async function borrarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  if (!confirm("¿Estás seguro de que quieres eliminar esta obra para siempre?")) return;
  try {
    const obra = obraActualEnMuseo;

    // Borrar archivos de Storage si están en /media/
    const paths = [];
    const pushPath = (u) => { if (u && u.includes('/media/')) paths.push(u.split('/media/')[1]); };
    pushPath(obra.imagen_url);
    pushPath(obra.capa_fondo_url);
    pushPath(obra.capa_dibujo_url);
    if (paths.length) await supabase.storage.from('media').remove(paths);

    await supabase.from('arte_obras').delete().eq('id', obra.id);
    document.getElementById("museoOverlay").classList.remove("activo");
    cerrarLibro();
    await cargarObras();
  } catch (err) { alert("Error al eliminar: " + err.message); }
}

// ============================================================
//  DIBUJO (capa superior, borrable)
// ============================================================
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function empezarDibujo(e) {
  dibujando = true;
  const pos = getPos(e);
  ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  
  if (herramienta === "borrador") {
    // Solo borra la capa de PINTURA. El fondo (canvasFondo) es intocable aquí.
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = grosor * 2;
    ctx.shadowBlur = 0;
  } 
  else if (herramienta === "neon") {
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = grosor;
    ctx.strokeStyle = color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = color;
  } 
  else if (herramienta === "lapiz") {
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = grosor / 2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.shadowBlur = 0;
  }
  else if (herramienta === "spray") {
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1;
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    dispararSpray(pos.x, pos.y);
  } 
  else {
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = grosor;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

function dibujar(e) {
  if (!dibujando) return;
  const pos = getPos(e);
  if (herramienta === "spray") { dispararSpray(pos.x, pos.y); } 
  else { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
}

function terminarDibujo() {
  dibujando = false;
  ctx.closePath();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function dispararSpray(x, y) {
  const radio = grosor * 2;
  for (let i = 0; i < 15; i++) {
    const angulo = Math.random() * Math.PI * 2;
    const distancia = Math.random() * radio;
    const px = x + Math.cos(angulo) * distancia;
    const py = y + Math.sin(angulo) * distancia;
    ctx.beginPath();
    ctx.arc(px, py, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
//  GUARDAR: COMPOSICIÓN + DOS CAPAS EN STORAGE + URLs EN BD
// ============================================================
async function guardarObra() {
  const titulo = document.getElementById("tituloObra").value.trim() || "Sin título";
  const btn = document.getElementById("btnGuardar");
  if (btn) { btn.textContent = "Subiendo..."; btn.disabled = true; }

  // 1. Composición final (fondo + pintura) para el museo
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(canvasFondo, 0, 0);
  tempCtx.drawImage(canvas, 0, 0);

  try {
    // 2. Subir composición
    const blobFinal = await canvasABlob(tempCanvas);
    const fileFinal = new File([blobFinal], `obra_${Date.now()}.png`, { type: "image/png" });
    const { url: urlFinal } = await subirArchivo(fileFinal, "arte");

    // 3. Subir cada capa por separado
    const blobFondo = await canvasABlob(canvasFondo);
    const blobDibujo = await canvasABlob(canvas);
    const idTag = modoEdicion && obraEditandoId ? obraEditandoId : Date.now();

    const fileFondo = new File([blobFondo], `fondo_${idTag}.png`, { type: "image/png" });
    const fileDibujo = new File([blobDibujo], `dibujo_${idTag}.png`, { type: "image/png" });

    const [{ url: urlFondo }, { url: urlDibujo }] = await Promise.all([
      subirArchivo(fileFondo, "arte/capas"),
      subirArchivo(fileDibujo, "arte/capas")
    ]);

    const payload = {
      couple_id: coupleId,
      titulo,
      imagen_url: urlFinal,
      capa_fondo_url: urlFondo,
      capa_dibujo_url: urlDibujo,
      capas_version: 2
    };

    let obraGuardada;
    if (modoEdicion && obraEditandoId) {
      // Borrar capas viejas de Storage si existían
      const vieja = obras.find(o => o.id === obraEditandoId);
      if (vieja) {
        const paths = [];
        if (vieja.capa_fondo_url?.includes('/media/')) paths.push(vieja.capa_fondo_url.split('/media/')[1]);
        if (vieja.capa_dibujo_url?.includes('/media/')) paths.push(vieja.capa_dibujo_url.split('/media/')[1]);
        if (paths.length) await supabase.storage.from('media').remove(paths);
      }
      const { data } = await supabase.from('arte_obras').update(payload).eq('id', obraEditandoId).select().maybeSingle();
      obraGuardada = data;
    } else {
      const { data } = await supabase.from('arte_obras').insert([payload]).select().maybeSingle();
      obraGuardada = data;
    }

    // Sincronizar objeto en memoria
    if (obraGuardada) {
      const idx = obras.findIndex(o => o.id === obraGuardada.id);
      if (idx !== -1) obras[idx] = obraGuardada;
    }

    document.getElementById("estudioOverlay").classList.remove("activo");
    cerrarLibro();
    await cargarObras();
    
    if (window.lanzarConfeti) window.lanzarConfeti(1000);
    if (btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
    
    modoEdicion = false; obraEditandoId = null;

  } catch (err) {
    alert("Error: " + err.message);
    if (btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
  }
}

document.addEventListener("DOMContentLoaded", initArte);