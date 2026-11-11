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
let fondoColor = "#ffffff";
let paginas = [];
let paginaActual = 0;
const OBRAS_POR_PAGINA = 4;
let obraActualEnMuseo = null;
let modoEdicion = false;
let obraEditandoId = null;
let fondoEditandoId = null;
let trazos = []; 
let trazoActual = null;
let portapapeles = { fondo: null, trazos: [] }; 
let preferenciaDispositivo = 'auto';

function cargarImagen(src, isCORS = false) {
  return new Promise((res, rej) => {
    const img = new Image();
    if (isCORS) img.crossOrigin = "anonymous"; 
    img.onload = () => res(img);
    img.onerror = () => {
      const imgFallback = new Image();
      imgFallback.onload = () => res(imgFallback);
      imgFallback.onerror = () => rej(new Error("Error imagen: " + src));
      imgFallback.src = src;
    };
    img.src = src;
  });
}

function canvasABlob(cnv) { return new Promise((res) => cnv.toBlob(res, "image/png")); }
function generarUUID() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2); }

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
    const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(lte|wap|fone))))/i.test(navigator.userAgent);
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isTablet) preferenciaDispositivo = 'tablet';
    else if (isMobile) preferenciaDispositivo = 'movil';
    else preferenciaDispositivo = 'escritorio';
  }

  document.body.className = `layout-${preferenciaDispositivo}`;

  canvasFondo = document.querySelector(".lienzo-fondo");
  ctxFondo = canvasFondo.getContext("2d");
  canvas = document.querySelector(".lienzo-dibujo");
  ctx = canvas.getContext("2d");
  
  dibujarFondo();
  configurarEventosDibujo();
  configurarEventosUI();
  await cargarObras();
}

function configurarEventosDibujo() {
  if (canvas) {
    canvas.addEventListener("mousedown", empezarDibujo);
    canvas.addEventListener("mousemove", dibujar);
    canvas.addEventListener("mouseup", terminarDibujo);
    canvas.addEventListener("mouseleave", terminarDibujo);
  }
  
  document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tool-btn[data-tool]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      herramienta = btn.dataset.tool;
    };
  });

  document.querySelectorAll(".input-grosor").forEach(inp => {
    inp.oninput = (e) => {
      grosor = parseInt(e.target.value);
      document.querySelectorAll(".grosor-badge").forEach(b => b.textContent = grosor);
    };
  });
  
  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      color = btn.dataset.color;
      document.querySelectorAll(".colorPicker").forEach(cp => cp.value = color);
    };
  });

  document.querySelectorAll(".colorPicker").forEach(cp => {
    cp.oninput = (e) => {
      color = e.target.value;
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
    };
  });

  const copiarFn = () => {
    portapapeles.trazos = JSON.parse(JSON.stringify(trazos)); 
    if (fondoImagen) portapapeles.fondo = fondoImagen;
    else {
      const tempFondo = document.createElement("canvas");
      tempFondo.width = canvasFondo.width; tempFondo.height = canvasFondo.height;
      const ctxF = tempFondo.getContext("2d");
      ctxF.fillStyle = fondoColor; ctxF.fillRect(0, 0, canvasFondo.width, canvasFondo.height);
      portapapeles.fondo = tempFondo;
    }
    alert("Copiado.");
  };

  const pegarFn = () => {
    if (portapapeles.trazos && portapapeles.trazos.length > 0) {
      portapapeles.trazos.forEach(trazo => trazos.push(JSON.parse(JSON.stringify(trazo))));
      renderizarTrazos();
    }
    if (portapapeles.fondo) { fondoImagen = portapapeles.fondo; dibujarFondo(); }
    alert("Pegado.");
  };

  const limpiarFn = () => { trazos = []; trazoActual = null; renderizarTrazos(); };
  const guardarFn = () => guardarObra();

  document.querySelectorAll(".btn-copiar").forEach(b => b.onclick = copiarFn);
  document.querySelectorAll(".btn-pegar").forEach(b => b.onclick = pegarFn);
  document.querySelectorAll(".btn-limpiar").forEach(b => b.onclick = limpiarFn);
  document.querySelectorAll(".btn-guardar").forEach(b => b.onclick = guardarFn);

  // Fondo (Multiple)
  document.querySelectorAll(".fondo-color-input").forEach(inp => {
    inp.oninput = (e) => { fondoColor = e.target.value; fondoImagen = null; dibujarFondo(); };
  });
  
  document.querySelectorAll(".btn-subir-fondo").forEach(b => b.onclick = () => document.getElementById("inputFondo").click());
  
  document.querySelectorAll(".btn-quitar-fondo").forEach(b => b.onclick = () => { 
    fondoImagen = null; fondoColor = "#ffffff"; 
    document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = "#ffffff");
    dibujarFondo(); 
  });

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
}

function configurarEventosUI() {
  document.querySelectorAll("#btnNuevaObra").forEach(b => b.onclick = abrirEstudio);
  document.querySelectorAll("#cerrarEstudio").forEach(b => b.onclick = () => document.getElementById("estudioOverlay").classList.remove("activo"));
  
  document.querySelectorAll("#libroPortada").forEach(b => b.onclick = abrirLibro);
  document.querySelectorAll("#btnCerrarMuseo").forEach(b => b.onclick = () => document.getElementById("museoOverlay").classList.remove("activo"));
  document.querySelectorAll("#btnBorrarObra").forEach(b => b.onclick = borrarObraDesdeMuseo);
  document.querySelectorAll("#btnEditarObra").forEach(b => b.onclick = editarObraDesdeMuseo);
  document.querySelectorAll("#btnCopiarObraMuseo").forEach(b => b.onclick = copiarObraDesdeMuseo);

  const btnAbrirMenu = document.getElementById('btnAbrirMenuM');
  const btnCerrarMenu = document.getElementById('btnCerrarMenuM');
  const overlay = document.getElementById('overlayMenu');
  const toolbar = document.getElementById('estudioToolbar');

  if (btnAbrirMenu && overlay && toolbar) {
    btnAbrirMenu.addEventListener('click', () => { toolbar.classList.add('activo'); overlay.classList.add('activo'); });
    if(btnCerrarMenu) btnCerrarMenu.addEventListener('click', () => { toolbar.classList.remove('activo'); overlay.classList.remove('activo'); });
    overlay.addEventListener('click', () => { toolbar.classList.remove('activo'); overlay.classList.remove('activo'); });
  }
}

function abrirEstudio() {
  modoEdicion = false;
  obraEditandoId = null;
  fondoEditandoId = generarUUID();
  
  trazos = []; trazoActual = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderizarTrazos();
  
  fondoImagen = null;
  fondoColor = "#ffffff";
  document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = "#ffffff");
  document.querySelectorAll("#tituloObra, #tituloObraM").forEach(inp => inp.value = "");
  
  dibujarFondo(); 
  document.getElementById("estudioOverlay").classList.add("activo");
}

function dibujarFondo() {
  if(!ctxFondo) return;
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  if (fondoImagen) {
    ctxFondo.drawImage(fondoImagen, 0, 0, canvasFondo.width, canvasFondo.height);
  } else {
    ctxFondo.fillStyle = fondoColor;
    ctxFondo.fillRect(0, 0, canvasFondo.width, canvasFondo.height);
  }
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
}

function empezarDibujo(e) {
  dibujando = true;
  const pos = getPos(e);
  trazoActual = { tipo: herramienta, color: color, grosor: grosor, puntos: [pos] };
  trazos.push(trazoActual);
  renderizarTrazos();
}

function dibujar(e) {
  if (!dibujando || !trazoActual) return;
  trazoActual.puntos.push(getPos(e));
  renderizarTrazos();
}

function terminarDibujo() {
  dibujando = false;
  trazoActual = null;
}

function renderizarTrazos() {
  if(!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  trazos.forEach((trazo) => {
    ctx.beginPath();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (trazo.tipo === "borrador") {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = trazo.color;
    }
    ctx.lineWidth = trazo.grosor;
    if (trazo.puntos.length === 1) {
      ctx.arc(trazo.puntos[0].x, trazo.puntos[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.moveTo(trazo.puntos[0].x, trazo.puntos[0].y);
      for (let i = 1; i < trazo.puntos.length; i++) ctx.lineTo(trazo.puntos[i].x, trazo.puntos[i].y);
      ctx.stroke();
    }
  });
}

async function guardarObra() {
  const t1 = document.getElementById("tituloObra");
  const t2 = document.getElementById("tituloObraM");
  const titulo = ((t1 ? t1.value : "") || (t2 ? t2.value : "")).trim() || "Sin título";
  
  const btn = document.querySelector(".btn-guardar");
  if(btn) { btn.textContent = "Guardando..."; btn.disabled = true; }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(canvasFondo, 0, 0);
  tempCtx.drawImage(canvas, 0, 0);

  try {
    const blobFinal = await canvasABlob(tempCanvas);
    const fileFinal = new File([blobFinal], `obra_${Date.now()}.png`, { type: "image/png" });
    const { url: urlFinal } = await subirArchivo(fileFinal, "arte");

    let urlFondo = null;
    if (fondoImagen) {
      const blobFondo = await canvasABlob(canvasFondo);
      const fileFondo = new File([blobFondo], `fondo_${fondoEditandoId}.png`, { type: "image/png" });
      const res = await subirArchivo(fileFondo, "arte/capas");
      urlFondo = res.url;
    }

    const payload = {
      couple_id: coupleId, titulo, imagen_url: urlFinal,
      capa_fondo_url: urlFondo, capa_trazos: trazos,
      fondo_id: fondoEditandoId, fondo_color: fondoColor, capas_version: 3
    };

    let obraGuardada;
    if (modoEdicion && obraEditandoId) {
      const { data } = await supabase.from('arte_obras').update(payload).eq('id', obraEditandoId).select().maybeSingle();
      obraGuardada = data;
    } else {
      const { data } = await supabase.from('arte_obras').insert([payload]).select().maybeSingle();
      obraGuardada = data;
    }

    if (obraGuardada) {
      const idx = obras.findIndex(o => o.id === obraGuardada.id);
      if (idx !== -1) obras[idx] = obraGuardada;
    }

    document.getElementById("estudioOverlay").classList.remove("activo");
    cerrarLibro();
    await cargarObras();
    
    if (window.lanzarConfeti) window.lanzarConfeti(1000);
    
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    if(btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
    modoEdicion = false; obraEditandoId = null; fondoEditandoId = null;
  }
}

async function editarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  document.getElementById("museoOverlay").classList.remove("activo");

  modoEdicion = true;
  obraEditandoId = obraActualEnMuseo.id;
  fondoEditandoId = obraActualEnMuseo.fondo_id || generarUUID();

  document.getElementById("estudioOverlay").classList.add("activo");
  document.querySelectorAll("#tituloObra, #tituloObraM").forEach(inp => inp.value = obraActualEnMuseo.titulo || "");

  fondoImagen = null;
  fondoColor = "#ffffff";
  document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = "#ffffff");
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  
  const obra = obraActualEnMuseo;

  if (obra.capa_fondo_url) {
    try {
      fondoImagen = await cargarImagen(obra.capa_fondo_url, true);
      dibujarFondo();
    } catch (err) {
      fondoColor = obra.fondo_color || "#ffffff";
      document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = fondoColor);
      dibujarFondo();
    }
  } else {
    fondoColor = obra.fondo_color || "#ffffff";
    document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = fondoColor);
    dibujarFondo();
  }

  if (obra.capa_trazos && Array.isArray(obra.capa_trazos)) {
    trazos = JSON.parse(JSON.stringify(obra.capa_trazos));
    renderizarTrazos();
  } else {
    trazos = []; 
    renderizarTrazos();
    try {
      const imgFull = await cargarImagen(obra.imagen_url, true);
      ctx.drawImage(imgFull, 0, 0, canvas.width, canvas.height);
    } catch (err) { console.error("No se pudo cargar la obra antigua"); }
  }
}

async function copiarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  const btn = document.getElementById("btnCopiarObraMuseo");
  btn.textContent = "Copiando...";

  try {
    const obra = obraActualEnMuseo;
    if (obra.capa_fondo_url) {
      portapapeles.fondo = await cargarImagen(obra.capa_fondo_url, true); 
    } else {
      const cTemp = document.createElement("canvas"); cTemp.width = 900; cTemp.height = 600;
      const xTemp = cTemp.getContext("2d"); xTemp.fillStyle = obra.fondo_color || "#ffffff"; xTemp.fillRect(0,0,900,600);
      portapapeles.fondo = cTemp;
    }
    portapapeles.trazos = (obra.capa_trazos && obra.capa_trazos.length > 0) ? obra.capa_trazos : [];
    
    btn.textContent = "¡Copiado!";
    document.getElementById("museoOverlay").classList.remove("activo");
    abrirEstudio(); 
    setTimeout(() => { btn.textContent = "Copiar Todo"; }, 500);
  } catch (err) { alert("Error al copiar"); btn.textContent = "Copiar Todo"; }
}

async function cargarObras() {
  const { data } = await supabase.from('arte_obras').select('*').eq('couple_id', coupleId).order('fecha', { ascending: false });
  obras = data || [];
  const contenedor = document.getElementById("libroPaginas");
  contenedor.innerHTML = "";
  if (obras.length === 0) {
    contenedor.innerHTML = `<p style="text-align:center; padding: 20px;">Aún no hay obras.</p>`;
    return;
  }
  let html = "";
  obras.forEach(obra => {
    html += `<div class="estampa-obra" onclick="event.stopPropagation(); abrirMuseo('${obra.id}')"><img src="${obra.imagen_url}" /><h4>${obra.titulo}</h4></div>`;
  });
  contenedor.innerHTML = html;
}

function abrirLibro() { document.getElementById("libroWrapper").classList.add("abierto"); }
function cerrarLibro() { document.getElementById("libroWrapper").classList.remove("abierto"); }

window.abrirMuseo = function(id) {
  const obra = obras.find(o => o.id === id);
  if (!obra) return;
  obraActualEnMuseo = obra;
  document.getElementById("museoTitulo").textContent = obra.titulo || "Sin título";
  document.getElementById("museoImagen").src = obra.imagen_url;
  document.getElementById("museoOverlay").classList.add("activo");
}

async function borrarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  if (!confirm("¿Eliminar esta obra?")) return;
  try {
    await supabase.from('arte_obras').delete().eq('id', obraActualEnMuseo.id);
    document.getElementById("museoOverlay").classList.remove("activo");
    cerrarLibro();
    await cargarObras();
  } catch (err) { alert("Error al eliminar"); }
}

document.addEventListener("DOMContentLoaded", initArte);