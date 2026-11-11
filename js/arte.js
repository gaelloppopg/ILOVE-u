import { supabase } from './supabase.js';
import { subirArchivo } from './storage.js';

// ============================================================
//  VARIABLES GLOBALES
// ============================================================
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
let fondoEditandoId = null;
let preferenciaDispositivo = 'auto';

let trazos = [];
let trazoActual = null;
let portapapeles = { fondo: null, trazos: [] };

// ============================================================
//  UTILIDADES
// ============================================================
function cargarImagen(src, isCORS = false) {
  return new Promise((res, rej) => {
    const img = new Image();
    if (isCORS) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => {
      const imgFallback = new Image();
      imgFallback.onload = () => res(imgFallback);
      imgFallback.onerror = () => rej(new Error("No se pudo cargar imagen: " + src));
      imgFallback.src = src;
    };
    img.src = src;
  });
}

function canvasABlob(cnv) { return new Promise((res) => cnv.toBlob(res, "image/png")); }
function generarUUID() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2); }

/** Devuelve el contenedor de la vista activa según el layout del body */
function vistaActiva() {
  if (document.body.classList.contains('layout-escritorio')) {
    return document.querySelector('.vista-escritorio');
  }
  return document.querySelector('.vista-movil');
}

/** Devuelve los canvas de la vista activa */
function obtenerCanvasActivos() {
  const vista = vistaActiva();
  if (!vista) return { cFondo: null, cDibujo: null };
  return {
    cFondo: vista.querySelector('.lienzo-fondo'),
    cDibujo: vista.querySelector('.lienzo-dibujo'),
    stack: vista.querySelector('.canvas-stack')
  };
}

// ============================================================
//  BLOQUEO DE SCROLL (FIX PRINCIPAL)
// ============================================================
let _scrollY = 0;

/**
 * Bloquea el scroll del body. Se usa al abrir estudio, museo o libro.
 * Usa position:fixed para forzar bloqueo en iOS Safari.
 */
function bloquearScrollBody() {
  if (document.body.dataset.scrollBloqueado === "1") return;
  _scrollY = window.scrollY || window.pageYOffset || 0;
  document.body.dataset.scrollBloqueado = "1";
  document.body.style.position = "fixed";
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.overscrollBehavior = "none";
}

/** Restaura el scroll del body */
function desbloquearScrollBody() {
  if (document.body.dataset.scrollBloqueado !== "1") return;
  document.body.dataset.scrollBloqueado = "0";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  document.documentElement.style.overscrollBehavior = "";
  window.scrollTo(0, _scrollY);
}

/**
 * Revisa si algún overlay crítico sigue abierto y,
 * si no queda ninguno, restaura el scroll.
 */
function actualizarBloqueoScroll() {
  const estudio = document.getElementById("estudioOverlay");
  const museo = document.getElementById("museoOverlay");
  const panel = document.getElementById("panelTemasDrawer");

  const estudioAbierto = estudio && estudio.classList.contains("activo");
  const museoAbierto = museo && museo.classList.contains("activo");
  const panelAbierto = panel && panel.classList.contains("activo");

  if (estudioAbierto || museoAbierto || panelAbierto) {
    bloquearScrollBody();
  } else {
    desbloquearScrollBody();
  }
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
    const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(lte|wap|fone))))/i.test(navigator.userAgent);
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;

    if (isTablet) preferenciaDispositivo = 'tablet';
    else if (isMobile) preferenciaDispositivo = 'movil';
    else preferenciaDispositivo = 'escritorio';
  }

  document.body.classList.remove('layout-movil', 'layout-tablet', 'layout-escritorio');
  document.body.classList.add(`layout-${preferenciaDispositivo}`);

  const { cFondo, cDibujo } = obtenerCanvasActivos();
  canvasFondo = cFondo;
  canvas = cDibujo;

  if (canvasFondo) ctxFondo = canvasFondo.getContext("2d");
  if (canvas) {
    ctx = canvas.getContext("2d");
    canvas.style.touchAction = "none";
  }

  dibujarFondo();
  configurarEventosDibujo();
  configurarEventosUI();
  initPanelTemas();
  initParallaxLibro();
  await cargarObras();
}

// ============================================================
//  EVENTOS TÁCTILES Y DIBUJO
// ============================================================
function configurarEventosDibujo() {
  const vista = vistaActiva();
  if (!vista) return;
  const canvasDibujo = vista.querySelector('.lienzo-dibujo');
  if (!canvasDibujo) return;

  if (!canvas) {
    canvas = canvasDibujo;
    ctx = canvas.getContext("2d");
    canvas.style.touchAction = "none";
  }

  const manejarStart = (e) => {
    // ⚠️ NO llamamos preventDefault aquí para no bloquear clicks
    // pero sí evitamos que el touch haga scroll
    if (e.cancelable) e.preventDefault();
    const punto = e.touches ? e.touches[0] : e;
    empezarDibujo(punto);
  };
  const manejarMove = (e) => {
    if (e.cancelable) e.preventDefault();
    const punto = e.touches ? e.touches[0] : e;
    dibujar(punto);
  };
  const manejarEnd = (e) => {
    if (e.cancelable) e.preventDefault();
    terminarDibujo();
  };

  canvasDibujo.addEventListener('touchstart', manejarStart, { passive: false });
  canvasDibujo.addEventListener('touchmove', manejarMove, { passive: false });
  canvasDibujo.addEventListener('touchend', manejarEnd, { passive: false });
  canvasDibujo.addEventListener('touchcancel', manejarEnd, { passive: false });
  canvasDibujo.addEventListener('mousedown', manejarStart);
  canvasDibujo.addEventListener('mousemove', (e) => { if (dibujando) manejarMove(e); });
  canvasDibujo.addEventListener('mouseup', manejarEnd);
  canvasDibujo.addEventListener('mouseleave', manejarEnd);

  // Herramientas
  document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".tool-btn[data-tool]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      herramienta = btn.dataset.tool;
    });
  });

  // Grosor
  document.querySelectorAll(".input-grosor").forEach(inp => {
    inp.addEventListener("input", (e) => {
      grosor = parseInt(e.target.value);
      document.querySelectorAll(".grosor-badge").forEach(b => b.textContent = grosor);
    });
  });

  // Colores
  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      color = btn.dataset.color || color;
      document.querySelectorAll(".colorPicker").forEach(cp => cp.value = color);
    });
  });

  document.querySelectorAll(".colorPicker").forEach(cp => {
    cp.addEventListener("input", (e) => {
      color = e.target.value;
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
    });
  });

  // Portapapeles
  const copiarFn = (e) => {
    if (e) e.preventDefault();
    portapapeles.trazos = JSON.parse(JSON.stringify(trazos));
    if (fondoImagen) portapapeles.fondo = fondoImagen;
    else {
      const tempFondo = document.createElement("canvas");
      tempFondo.width = canvasFondo.width; tempFondo.height = canvasFondo.height;
      const ctxF = tempFondo.getContext("2d");
      ctxF.fillStyle = fondoColor; ctxF.fillRect(0, 0, canvasFondo.width, canvasFondo.height);
      portapapeles.fondo = tempFondo;
    }
    alert("Trazos y fondo copiados.");
  };

  const pegarFn = (e) => {
    if (e) e.preventDefault();
    if (portapapeles.trazos && portapapeles.trazos.length > 0) {
      portapapeles.trazos.forEach(trazo => trazos.push(JSON.parse(JSON.stringify(trazo))));
      renderizarTrazos();
    }
    if (portapapeles.fondo) { fondoImagen = portapapeles.fondo; dibujarFondo(); }
    alert("Trazos pegados.");
  };

  const limpiarFn = (e) => {
    if (e) e.preventDefault();
    trazos = []; trazoActual = null; renderizarTrazos();
  };
  const guardarFn = (e) => {
    if (e) e.preventDefault();
    guardarObra();
  };

  document.querySelectorAll(".btn-copiar").forEach(b => b.addEventListener("click", copiarFn));
  document.querySelectorAll(".btn-pegar").forEach(b => b.addEventListener("click", pegarFn));
  document.querySelectorAll(".btn-limpiar").forEach(b => b.addEventListener("click", limpiarFn));
  document.querySelectorAll(".btn-guardar").forEach(b => b.addEventListener("click", guardarFn));

  // Fondo
  document.querySelectorAll(".fondo-color-input").forEach(inp => {
    inp.addEventListener("input", (e) => {
      fondoColor = e.target.value; fondoImagen = null; dibujarFondo();
    });
  });

  document.querySelectorAll(".btn-subir-fondo").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault();
    const el = document.getElementById("inputFondo");
    if (el) el.click();
  }));

  document.querySelectorAll(".btn-quitar-fondo").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault();
    fondoImagen = null; fondoColor = "#ffffff";
    document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = "#ffffff");
    dibujarFondo();
  }));

  const inpFondo = document.getElementById("inputFondo");
  if (inpFondo && !inpFondo.dataset.bound) {
    inpFondo.dataset.bound = "1";
    inpFondo.addEventListener("change", (e) => {
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
    });
  }
}

function configurarEventosUI() {
  document.querySelectorAll("#btnNuevaObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); abrirEstudio(); }));
  document.querySelectorAll("#cerrarEstudio").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault();
    cerrarEstudio();
  }));

  document.querySelectorAll("#btnCerrarLibro").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); cerrarLibro(); }));
  document.querySelectorAll("#libroPortada").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); abrirLibro(); }));
  document.querySelectorAll("#btnPrev").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); paginaAnterior(); }));
  document.querySelectorAll("#btnNext").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); paginaSiguiente(); }));

  document.querySelectorAll("#btnCerrarMuseo").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault();
    cerrarMuseo();
  }));

  document.querySelectorAll("#museoOverlay").forEach(m => m.addEventListener("click", (e) => {
    if (e.target.id === 'museoOverlay') cerrarMuseo();
  }));

  document.querySelectorAll("#btnBorrarObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); borrarObraDesdeMuseo(); }));
  document.querySelectorAll("#btnEditarObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); editarObraDesdeMuseo(); }));
  document.querySelectorAll("#btnCopiarObraMuseo").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); copiarObraDesdeMuseo(); }));
  document.querySelectorAll("#btnDescargarObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); descargarObraComoPNG(); }));

  const btnAbrirMenu = document.getElementById('btnAbrirMenuM');
  const btnCerrarMenu = document.getElementById('btnCerrarMenuM');
  const overlay = document.getElementById('overlayMenu');
  const toolbar = document.getElementById('estudioToolbar');

  if (btnAbrirMenu && overlay && toolbar) {
    btnAbrirMenu.addEventListener('click', (e) => {
      e.preventDefault();
      toolbar.classList.add('activo');
      overlay.classList.add('activo');
    });
    if (btnCerrarMenu) btnCerrarMenu.addEventListener('click', (e) => {
      e.preventDefault();
      toolbar.classList.remove('activo');
      overlay.classList.remove('activo');
    });
    overlay.addEventListener('click', () => {
      toolbar.classList.remove('activo');
      overlay.classList.remove('activo');
    });
  }

  // Sincronizar títulos
  const tE = document.getElementById('tituloObra');
  const tM = document.getElementById('tituloObraM');
  if (tE && tM) {
    tE.addEventListener('input', () => { tM.value = tE.value; });
    tM.addEventListener('input', () => { tE.value = tM.value; });
  }
}

// ============================================================
//  LÓGICA DE DIBUJO
// ============================================================
function abrirEstudio() {
  modoEdicion = false;
  obraEditandoId = null;
  fondoEditandoId = generarUUID();

  trazos = []; trazoActual = null;
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderizarTrazos();

  fondoImagen = null;
  fondoColor = "#ffffff";

  document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = "#ffffff");
  document.querySelectorAll("#tituloObra, #tituloObraM").forEach(inp => inp.value = "");

  dibujarFondo();

  const overlay = document.getElementById("estudioOverlay");
  if (overlay) overlay.classList.add("activo");

  document.body.classList.add("estudio-abierto");
  bloquearScrollBody(); // ⚠️ FIX
}

function cerrarEstudio() {
  const el = document.getElementById("estudioOverlay");
  if (el) el.classList.remove("activo");
  document.body.classList.remove("estudio-abierto");

  // Cerrar menú lateral móvil si estaba abierto
  const toolbar = document.getElementById('estudioToolbar');
  const overlayMenu = document.getElementById('overlayMenu');
  if (toolbar) toolbar.classList.remove('activo');
  if (overlayMenu) overlayMenu.classList.remove('activo');

  actualizarBloqueoScroll(); // ⚠️ FIX
}

function dibujarFondo() {
  if (!ctxFondo || !canvasFondo) return;
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

function getPos(e) {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = (e.clientX !== undefined) ? e.clientX : e.pageX;
  const clientY = (e.clientY !== undefined) ? e.clientY : e.pageY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function empezarDibujo(e) {
  if (!canvas || !ctx) return;
  dibujando = true;
  const pos = getPos(e);
  trazoActual = {
    tipo: herramienta,
    color: color,
    grosor: grosor,
    opacidad: herramienta === "lapiz" ? 0.6 : 1,
    sombra: herramienta === "neon" ? 25 : 0,
    puntos: [pos]
  };
  trazos.push(trazoActual);
  renderizarTrazos();
}

function dibujar(e) {
  if (!dibujando || !trazoActual) return;
  const pos = getPos(e);
  if (herramienta === "spray") {
    for (let i = 0; i < 5; i++) {
      const angulo = Math.random() * Math.PI * 2;
      const distancia = Math.random() * grosor * 2;
      trazoActual.puntos.push({
        x: pos.x + Math.cos(angulo) * distancia,
        y: pos.y + Math.sin(angulo) * distancia
      });
    }
  } else {
    trazoActual.puntos.push(pos);
  }
  renderizarTrazos();
}

function terminarDibujo() {
  dibujando = false;
  trazoActual = null;
}

function renderizarTrazos() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  trazos.forEach((trazo) => {
    ctx.beginPath();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (trazo.tipo === "borrador") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = trazo.grosor * 2;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = trazo.grosor;
      ctx.strokeStyle = trazo.color;
      ctx.globalAlpha = trazo.opacidad || 1;
      ctx.shadowBlur = trazo.sombra || 0;
      if (trazo.sombra) ctx.shadowColor = trazo.color;
    }
    if (trazo.tipo === "spray") {
      ctx.fillStyle = trazo.color;
      trazo.puntos.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.random() * 1.5 + 0.5, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      if (trazo.puntos.length === 1) {
        ctx.beginPath();
        ctx.arc(trazo.puntos[0].x, trazo.puntos[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = trazo.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(trazo.puntos[0].x, trazo.puntos[0].y);
        for (let i = 1; i < trazo.puntos.length; i++) ctx.lineTo(trazo.puntos[i].x, trazo.puntos[i].y);
        ctx.stroke();
      }
    }
  });
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ============================================================
//  GUARDADO Y MUSEO
// ============================================================
async function guardarObra() {
  if (!canvas || !canvasFondo) {
    alert("Error: no se encontró el lienzo.");
    return;
  }

  const t1 = document.getElementById("tituloObra");
  const t2 = document.getElementById("tituloObraM");
  const titulo = ((t1 ? t1.value : "") || (t2 ? t2.value : "")).trim() || "Sin título";

  document.querySelectorAll(".btn-guardar").forEach(b => { b.textContent = "Guardando..."; b.disabled = true; });

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(canvasFondo, 0, 0);
  tempCtx.drawImage(canvas, 0, 0);

  try {
    let blobFinal;
    try {
      blobFinal = await canvasABlob(tempCanvas);
    } catch (error) {
      throw new Error("El lienzo está contaminado por CORS. Asegúrate de que el bucket sea público.");
    }

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
      couple_id: coupleId,
      titulo,
      imagen_url: urlFinal,
      capa_fondo_url: urlFondo,
      capa_trazos: trazos,
      fondo_id: fondoEditandoId,
      fondo_color: fondoColor,
      capas_version: 3
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

    cerrarEstudio();
    cerrarLibro();
    await cargarObras();

    if (window.lanzarConfeti) window.lanzarConfeti(1000);

  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    document.querySelectorAll(".btn-guardar").forEach(b => { b.textContent = "Guardar Obra"; b.disabled = false; });
    document.querySelectorAll(".btn-accion-principal.btn-guardar").forEach(b => { b.textContent = "Guardar"; });
    modoEdicion = false; obraEditandoId = null; fondoEditandoId = null;
  }
}

async function editarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  cerrarMuseo();

  const { cFondo, cDibujo } = obtenerCanvasActivos();
  canvasFondo = cFondo; canvas = cDibujo;
  if (canvasFondo) ctxFondo = canvasFondo.getContext("2d");
  if (canvas) ctx = canvas.getContext("2d");

  modoEdicion = true;
  obraEditandoId = obraActualEnMuseo.id;
  fondoEditandoId = obraActualEnMuseo.fondo_id || generarUUID();

  const eo = document.getElementById("estudioOverlay");
  if (eo) eo.classList.add("activo");
  document.querySelectorAll("#tituloObra, #tituloObraM").forEach(inp => inp.value = obraActualEnMuseo.titulo || "");

  fondoImagen = null;
  fondoColor = "#ffffff";
  document.querySelectorAll(".fondo-color-input").forEach(inp => inp.value = "#ffffff");

  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (ctxFondo && canvasFondo) ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);

  const obra = obraActualEnMuseo;

  if (obra.capa_fondo_url) {
    try {
      fondoImagen = await cargarImagen(obra.capa_fondo_url, true);
      dibujarFondo();
    } catch (err) {
      console.warn("Fondo no disponible, usando color sólido.");
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
      if (ctx && canvas) ctx.drawImage(imgFull, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.error("No se pudo cargar la obra antigua:", err);
    }
  }

  document.body.classList.add("estudio-abierto");
  bloquearScrollBody(); // ⚠️ FIX
}

async function copiarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  const botones = document.querySelectorAll("#btnCopiarObraMuseo");
  const textosOriginales = Array.from(botones).map(b => b.textContent);
  botones.forEach(b => b.textContent = "Copiando...");

  try {
    const obra = obraActualEnMuseo;
    if (obra.capa_fondo_url) {
      portapapeles.fondo = await cargarImagen(obra.capa_fondo_url, true);
    } else {
      const canvasFondoTemp = document.createElement("canvas");
      canvasFondoTemp.width = 900; canvasFondoTemp.height = 600;
      const ctxF = canvasFondoTemp.getContext("2d");
      ctxF.fillStyle = obra.fondo_color || "#ffffff";
      ctxF.fillRect(0, 0, 900, 600);
      portapapeles.fondo = canvasFondoTemp;
    }

    if (obra.capa_trazos && obra.capa_trazos.length > 0) {
      portapapeles.trazos = obra.capa_trazos;
    } else {
      portapapeles.trazos = [];
    }

    botones.forEach(b => b.textContent = "¡Copiado!");
    cerrarMuseo();
    abrirEstudio();

    setTimeout(() => {
      botones.forEach((b, i) => b.textContent = textosOriginales[i]);
    }, 500);
  } catch (err) {
    console.error("Error al copiar obra:", err);
    alert("No se pudo copiar la obra.");
    botones.forEach((b, i) => b.textContent = textosOriginales[i]);
  }
}

// ============================================================
//  UI DEL LIBRO Y TEMAS
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

  btnAbrir.addEventListener('click', (e) => {
    e.preventDefault();
    drawer.classList.add('activo');
    overlay.classList.add('activo');
    bloquearScrollBody(); // ⚠️ FIX
  });
  const cerrarPanel = () => {
    drawer.classList.remove('activo');
    overlay.classList.remove('activo');
    actualizarBloqueoScroll(); // ⚠️ FIX
  };
  if (btnCerrar) btnCerrar.addEventListener('click', (e) => { e.preventDefault(); cerrarPanel(); });
  if (overlay) overlay.addEventListener('click', cerrarPanel);

  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      items.forEach(i => i.classList.remove('activo'));
      item.classList.add('activo');
      const tema = item.dataset.setTema;
      body.setAttribute('data-tema', tema);
      const previewStyle = item.querySelector('.tema-card-preview').style.background;
      if (previewColor) previewColor.style.background = previewStyle;
      localStorage.setItem('tema_pagina', tema);
      cerrarPanel();
    });
  });

  const temaGuardado = localStorage.getItem('tema_pagina');
  if (temaGuardado) {
    body.setAttribute('data-tema', temaGuardado);
    const itemActivo = document.querySelector(`.tema-card[data-set-tema="${temaGuardado}"]`);
    if (itemActivo) {
      items.forEach(i => i.classList.remove('activo'));
      itemActivo.classList.add('activo');
      if (previewColor) previewColor.style.background = itemActivo.querySelector('.tema-card-preview').style.background;
    }
  }
}

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
  if (!contenedor) return;
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
    <div class="estampa-obra" onclick="event.stopPropagation(); window.abrirMuseo('${obra.id}')">
      <img src="${obra.imagen_url}" alt="${obra.titulo}" loading="lazy" />
      <h4>${obra.titulo || "Sin título"}</h4>
    </div>
  `;
}

function abrirLibro() {
  const lw = document.getElementById("libroWrapper");
  const lc = document.getElementById("libroControles");
  const bc = document.getElementById("btnCerrarLibro");

  if (lw) lw.classList.add("abierto");
  if (lc) lc.classList.add("activo");
  if (bc) bc.style.display = "flex";

  paginaActual = 1;
  actualizarPaginas();
  bloquearScrollBody(); // ⚠️ FIX
}

function cerrarLibro() {
  const lw = document.getElementById("libroWrapper");
  const lc = document.getElementById("libroControles");
  const bc = document.getElementById("btnCerrarLibro");

  if (lw) { lw.classList.remove("abierto"); lw.style.transform = ""; }
  if (lc) lc.classList.remove("activo");
  if (bc) bc.style.display = "none";

  paginaActual = 0;
  const hojas = document.querySelectorAll(".hoja");
  hojas.forEach(hoja => hoja.classList.remove("volteada"));
  actualizarZIndex();
  actualizarControles();
  actualizarBloqueoScroll(); // ⚠️ FIX
}

function paginaAnterior() { if (paginaActual > 1) { paginaActual--; animarPagina(); } }
function paginaSiguiente() { if (paginaActual < paginas.length) { paginaActual++; animarPagina(); } }

function animarPagina() {
  const wrapper = document.getElementById("libroWrapper");
  if (wrapper) wrapper.classList.add("girando");
  actualizarPaginas();
  setTimeout(() => { if (wrapper) wrapper.classList.remove("girando"); }, 1200);
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
  if (btnPrev) btnPrev.disabled = paginaActual <= 1;
  if (btnNext) btnNext.disabled = paginaActual >= paginas.length;
  if (indicador) {
    if (paginaActual === 0) indicador.textContent = "Libro Cerrado";
    else {
      const pag1 = (paginaActual - 1) * 2 + 1;
      const pag2 = pag1 + 1;
      indicador.textContent = `Páginas ${pag1} - ${pag2}`;
    }
  }
}

window.abrirMuseo = function(id) {
  const obra = obras.find(o => o.id === id);
  if (!obra) return;
  obraActualEnMuseo = obra;
  const mt = document.getElementById("museoTitulo");
  if (mt) mt.textContent = obra.titulo || "Sin título";
  const mf = document.getElementById("museoFecha");
  if (mf) mf.textContent = new Date(obra.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const mi = document.getElementById("museoImagen");
  if (mi) mi.src = obra.imagen_url;
  const mo = document.getElementById("museoOverlay");
  if (mo) mo.classList.add("activo");
  bloquearScrollBody(); // ⚠️ FIX
};

function cerrarMuseo() {
  const mo = document.getElementById("museoOverlay");
  if (mo) mo.classList.remove("activo");
  actualizarBloqueoScroll(); // ⚠️ FIX
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
    const obra = obraActualEnMuseo;
    const paths = [];
    const pushPath = (u) => { if (u && u.includes('/media/')) paths.push(u.split('/media/')[1]); };
    pushPath(obra.imagen_url);
    pushPath(obra.capa_fondo_url);

    if (paths.length) await supabase.storage.from('media').remove(paths);

    await supabase.from('arte_obras').delete().eq('id', obra.id);
    cerrarMuseo();
    cerrarLibro();
    await cargarObras();
  } catch (err) { alert("Error al eliminar: " + err.message); }
}

document.addEventListener("DOMContentLoaded", initArte);