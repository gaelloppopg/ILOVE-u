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

async function initArte() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: couple } = await supabase.from('couples').select('id').or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`).maybeSingle();
  if (!couple) return;
  coupleId = couple.id;

  canvasFondo = document.getElementById("lienzoFondo");
  ctxFondo = canvasFondo.getContext("2d");
  canvas = document.getElementById("lienzo");
  ctx = canvas.getContext("2d");
  
  configurarEventosDibujo();
  configurarEventosUI();
  initPanelTemas();
  initParallaxLibro();
  await cargarObras();
}

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

  document.getElementById("grosor").oninput = (e) => { grosor = parseInt(e.target.value); document.getElementById("grosorValor").textContent = grosor; };
  
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

  document.getElementById("fondoColor").oninput = (e) => { fondoColor = e.target.value; fondoImagen = null; dibujarFondo(); };
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
  document.getElementById("btnQuitarFondo").onclick = () => { fondoImagen = null; fondoColor = "#ffffff"; dibujarFondo(); };
  
  document.getElementById("btnLimpiar").onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
    fondoImagen = null;
    fondoColor = "#ffffff";
    document.getElementById("fondoColor").value = "#ffffff";
    dibujarFondo();
  };
  
  document.getElementById("btnGuardar").onclick = guardarObra;
}

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
}

function abrirEstudio() {
  modoEdicion = false;
  obraEditandoId = null;
  
  document.getElementById("estudioOverlay").classList.add("activo");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  document.getElementById("tituloObra").value = "";
  fondoImagen = null;
  fondoColor = "#ffffff";
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

function initPanelTemas() {
  const btnAbrir = document.getElementById('btnAbrirPanelTemas');
  const btnCerrar = document.getElementById('btnCerrarPanelTemas');
  const overlay = document.getElementById('panelTemasOverlay');
  const drawer = document.getElementById('panelTemasDrawer');
  const body = document.body;
  const items = document.querySelectorAll('.tema-card');
  const previewColor = document.getElementById('previewColorActual');

  if(!btnAbrir) return;

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

function initParallaxLibro() {
  const wrapper = document.getElementById("libroWrapper");
  if(!wrapper) return;
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

async function cargarObras() {
  const { data } = await supabase.from('arte_obras').select('*').eq('couple_id', coupleId).order('fecha', { ascending: false });
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

window.abrirMuseo = function(id) {
  const obra = obras.find(o => o.id === id);
  if (!obra) return;
  obraActualEnMuseo = obra;
  document.getElementById("museoTitulo").textContent = obra.titulo || "Sin título";
  document.getElementById("museoFecha").textContent = new Date(obra.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById("museoImagen").src = obra.imagen_url;
  document.getElementById("museoOverlay").classList.add("activo");
}

async function editarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  document.getElementById("museoOverlay").classList.remove("activo");
  
  modoEdicion = true;
  obraEditandoId = obraActualEnMuseo.id;
  
  document.getElementById("estudioOverlay").classList.add("activo");
  
  const titulo = obraActualEnMuseo.titulo || "";
  document.getElementById("tituloObra").value = titulo;
  
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    // Cargamos la imagen original en la capa de FONDO
    ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
    ctxFondo.drawImage(img, 0, 0, canvasFondo.width, canvasFondo.height);
    fondoImagen = img;
    
    // Limpiamos la capa de dibujo para que el usuario pinte encima
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  img.src = obraActualEnMuseo.imagen_url;
}

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
    if (obraActualEnMuseo.imagen_url && obraActualEnMuseo.imagen_url.includes('/media/')) {
      const path = obraActualEnMuseo.imagen_url.split('/media/')[1];
      await supabase.storage.from('media').remove([path]);
    }
    await supabase.from('arte_obras').delete().eq('id', obraActualEnMuseo.id);
    document.getElementById("museoOverlay").classList.remove("activo");
    cerrarLibro();
    await cargarObras();
  } catch (err) { alert("Error al eliminar: " + err.message); }
}

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
    ctx.globalCompositeOperation = "destination-out"; 
    ctx.lineWidth = grosor * 2; 
    ctx.shadowBlur = 0; 
  } 
  else if (herramienta === "neon") { ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = grosor; ctx.strokeStyle = color; ctx.shadowBlur = 25; ctx.shadowColor = color; } 
  else if (herramienta === "lapiz") { ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = grosor / 2; ctx.strokeStyle = color; ctx.globalAlpha = 0.6; ctx.shadowBlur = 0; }
  else if (herramienta === "spray") { ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = 1; ctx.fillStyle = color; ctx.shadowBlur = 0; dispararSpray(pos.x, pos.y); } 
  else { ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = grosor; ctx.strokeStyle = color; ctx.globalAlpha = 1; ctx.shadowBlur = 0; }
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

async function guardarObra() {
  const titulo = document.getElementById("tituloObra").value.trim() || "Sin título";
  const btn = document.getElementById("btnGuardar");
  if(btn) { btn.textContent = "Subiendo..."; btn.disabled = true; }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(canvasFondo, 0, 0);
  tempCtx.drawImage(canvas, 0, 0);

  tempCanvas.toBlob(async (blob) => {
    try {
      const file = new File([blob], "obra.png", { type: "image/png" });
      const { url } = await subirArchivo(file, "arte");
      
      let payload = { 
        couple_id: coupleId, 
        titulo, 
        imagen_url: url
      };

      if (modoEdicion && obraEditandoId) {
        await supabase.from('arte_obras').update(payload).eq('id', obraEditandoId);
      } else {
        await supabase.from('arte_obras').insert([payload]);
      }

      document.getElementById("estudioOverlay").classList.remove("activo");
      cerrarLibro();
      await cargarObras();
      
      if (window.lanzarConfeti) window.lanzarConfeti(1000);
      if(btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
      
      modoEdicion = false; obraEditandoId = null;
      
    } catch (err) {
      alert("Error: " + err.message);
      if(btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
    }
  }, "image/png");
}

document.addEventListener("DOMContentLoaded", initArte);