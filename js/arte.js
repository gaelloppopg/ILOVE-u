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
let fondoEditandoId = null;
let preferenciaDispositivo = 'auto';

// ARRAY DE COMPONENTES: Aquí se guardan todos los trazos
let trazos = []; 
let trazoActual = null;
let trazoSeleccionadoIndex = -1;
let portapapeles = { fondo: null, trazos: [] }; 

// ============================================================
//  UTILIDADES
// ============================================================
function cargarImagen(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo cargar imagen: " + src));
    img.src = src;
  });
}

function canvasABlob(cnv) {
  return new Promise((res) => cnv.toBlob(res, "image/png"));
}

function generarUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function renderizarTrazos() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  trazos.forEach((trazo, index) => {
    ctx.beginPath();
    ctx.lineCap = "round"; 
    ctx.lineJoin = "round";
    
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
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
        ctx.fill();
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
        for (let i = 1; i < trazo.puntos.length; i++) {
          ctx.lineTo(trazo.puntos[i].x, trazo.puntos[i].y);
        }
        ctx.stroke();
      }
    }

    // Resaltar si está seleccionado en el panel
    if (index === trazoSeleccionadoIndex) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        Math.min(...trazo.puntos.map(p=>p.x)) - 10,
        Math.min(...trazo.puntos.map(p=>p.y)) - 10,
        Math.max(...trazo.puntos.map(p=>p.x)) - Math.min(...trazo.puntos.map(p=>p.x)) + 20,
        Math.max(...trazo.puntos.map(p=>p.y)) - Math.min(...trazo.puntos.map(p=>p.y)) + 20
      );
      ctx.setLineDash([]);
    }
  });
  
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  
  actualizarPanelTrazos();
}

function actualizarPanelTrazos() {
  const lista = document.getElementById("listaTrazos");
  if (!lista) return;
  lista.innerHTML = "";
  
  if (trazos.length === 0) {
    lista.innerHTML = "<div style='color:#666; font-size:0.8rem; text-align:center;'>Vacío</div>";
    return;
  }

  trazos.forEach((trazo, i) => {
    const item = document.createElement("div");
    item.className = `trazo-item ${i === trazoSeleccionadoIndex ? 'seleccionado' : ''}`;
    item.innerHTML = `
      <span>${trazo.tipo.toUpperCase()} ${i+1}</span>
      <span style="color:${trazo.color}">■</span>
    `;
    item.onclick = () => {
      trazoSeleccionadoIndex = (trazoSeleccionadoIndex === i) ? -1 : i;
      renderizarTrazos();
    };
    lista.appendChild(item);
  });
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
//  EVENTOS DE DIBUJO Y COPIAR/PEGAR
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

  // ---- COPIAR Y PEGAR (LÓGICA DE COMPONENTES) ----
  const btnCopiar = document.getElementById("btnCopiarPintura");
  const btnPegar = document.getElementById("btnPegarPintura");

  if (btnCopiar) {
    btnCopiar.onclick = () => {
      portapapeles.trazos = JSON.parse(JSON.stringify(trazos)); // Copia profunda
      const textoOriginal = btnCopiar.textContent;
      btnCopiar.textContent = "¡Copiado!";
      setTimeout(() => btnCopiar.textContent = textoOriginal, 1500);
    };
  }

  if (btnPegar) {
    btnPegar.onclick = () => {
      if (!portapapeles.trazos || portapapeles.trazos.length === 0) {
        alert("No hay trazos copiados en el portapapeles.");
        return;
      }
      
      // Pegamos los trazos al array actual uno por uno
      portapapeles.trazos.forEach(trazoCopiado => {
        // Clonamos para que no compartan referencia
        const nuevoTrazo = JSON.parse(JSON.stringify(trazoCopiado));
        trazos.push(nuevoTrazo);
      });
      
      trazoSeleccionadoIndex = -1;
      renderizarTrazos();
      
      const textoOriginal = btnPegar.textContent;
      btnPegar.textContent = "¡Pegado!";
      setTimeout(() => btnPegar.textContent = textoOriginal, 1500);
    };
  }

  // ---- FONDO (Capa bloqueada) ----
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

  document.getElementById("btnLimpiar").onclick = () => {
    trazos = [];
    trazoSeleccionadoIndex = -1;
    renderizarTrazos();
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
  document.getElementById("btnCopiarObraMuseo").onclick = copiarObraDesdeMuseo;

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
//  ESTUDIO: ABRIR / DIBUJAR FONDO
// ============================================================
function abrirEstudio() {
  modoEdicion = false;
  obraEditandoId = null;
  fondoEditandoId = generarUUID();
  
  document.getElementById("estudioOverlay").classList.add("activo");
  
  if (trazos.length === 0) {
    trazos = [];
    trazoSeleccionadoIndex = -1;
    renderizarTrazos();
  }

  document.getElementById("tituloObra").value = "";
  
  if (!portapapeles.fondo) {
    fondoImagen = null;
    fondoColor = "#ffffff";
    document.getElementById("fondoColor").value = "#ffffff";
    dibujarFondo();
  }
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
//  LÓGICA DE DIBUJO (REGISTRANDO COMPONENTES)
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

// ============================================================
//  RESTO DE FUNCIONES (MUSEO, GUARDAR, etc.)
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

async function copiarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  const btn = document.getElementById("btnCopiarObraMuseo");
  const textoOriginal = btn.textContent;
  btn.textContent = "Copiando...";

  try {
    const obra = obraActualEnMuseo;
    
    // Copiar fondo
    if (obra.capa_fondo_url) {
      portapapeles.fondo = await cargarImagen(obra.capa_fondo_url);
    } else {
      const canvasFondoTemp = document.createElement("canvas");
      canvasFondoTemp.width = 900; canvasFondoTemp.height = 600;
      const ctxF = canvasFondoTemp.getContext("2d");
      ctxF.fillStyle = "#ffffff";
      ctxF.fillRect(0, 0, 900, 600);
      portapapeles.fondo = canvasFondoTemp;
    }

    // Copiar trazos (Si la obra vieja no tiene trazos registrados, no podemos separarlos, 
    // así que lo metemos como una imagen "quemada" en el portapapeles de trazos)
    if (obra.capa_trazos && obra.capa_trazos.length > 0) {
      portapapeles.trazos = obra.capa_trazos;
    } else {
      alert("Esta es una obra antigua. Sus trazos no se pueden separar. Se copiará como una sola imagen.");
      // Lógica de fallback para obras viejas...
    }
    
    btn.textContent = "¡Copiado!";
    document.getElementById("museoOverlay").classList.remove("activo");
    abrirEstudio(); 
    
    setTimeout(() => {
      btn.textContent = textoOriginal;
      alert("Componentes copiados. Presiona 'Pegar Trazos' en el panel de la izquierda.");
    }, 500);

  } catch (err) {
    console.error("Error al copiar obra:", err);
    alert("No se pudo copiar la obra.");
    btn.textContent = textoOriginal;
  }
}

async function editarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  document.getElementById("museoOverlay").classList.remove("activo");

  modoEdicion = true;
  obraEditandoId = obraActualEnMuseo.id;
  fondoEditandoId = obraActualEnMuseo.fondo_id || generarUUID();

  document.getElementById("estudioOverlay").classList.add("activo");
  document.getElementById("tituloObra").value = obraActualEnMuseo.titulo || "";

  fondoImagen = null;
  fondoColor = "#ffffff";
  fondoOpacidad = 100;
  document.getElementById("fondoColor").value = "#ffffff";
  ctxFondo.clearRect(0, 0, canvasFondo.width, canvasFondo.height);
  ctxFondo.fillStyle = "#ffffff";
  ctxFondo.fillRect(0, 0, canvasFondo.width, canvasFondo.height);

  const obra = obraActualEnMuseo;

  // Si tiene trazos guardados, los cargamos como componentes
  if (obra.capa_trazos && Array.isArray(obra.capa_trazos)) {
    trazos = JSON.parse(JSON.stringify(obra.capa_trazos));
    renderizarTrazos();
    
    if (obra.capa_fondo_url) {
      fondoImagen = await cargarImagen(obra.capa_fondo_url);
      dibujarFondo();
    }
    return;
  }

  // CASO B: Obra antigua (sin trazos separados, solo imagen plana)
  trazos = []; // No hay componentes separados
  renderizarTrazos();
  try {
    const imgFull = await cargarImagen(obra.imagen_url);
    ctx.drawImage(imgFull, 0, 0, canvas.width, canvas.height);
  } catch (err) {
    console.error("No se pudo cargar la obra:", err);
    alert("No se pudo cargar la obra para editar.");
  }
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
    document.getElementById("museoOverlay").classList.remove("activo");
    cerrarLibro();
    await cargarObras();
  } catch (err) { alert("Error al eliminar: " + err.message); }
}

async function guardarObra() {
  const titulo = document.getElementById("tituloObra").value.trim() || "Sin título";
  const btn = document.getElementById("btnGuardar");
  if (btn) { btn.textContent = "Subiendo..."; btn.disabled = true; }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(canvasFondo, 0, 0);
  tempCtx.drawImage(canvas, 0, 0);

  try {
    const blobFinal = await canvasABlob(tempCanvas);
    const fileFinal = new File([blobFinal], `obra_${Date.now()}.png`, { type: "image/png" });
    const { url: urlFinal } = await subirArchivo(fileFinal, "arte");

    const blobFondo = await canvasABlob(canvasFondo);
    const fileFondo = new File([blobFondo], `fondo_${fondoEditandoId}.png`, { type: "image/png" });
    const { url: urlFondo } = await subirArchivo(fileFondo, "arte/capas");

    // Aquí guardamos el array de trazos como JSON en la base de datos
    const payload = {
      couple_id: coupleId,
      titulo,
      imagen_url: urlFinal,
      capa_fondo_url: urlFondo,
      capa_trazos: trazos, // <-- Guardamos los componentes
      fondo_id: fondoEditandoId,
      fondo_color: fondoColor,
      capas_version: 3 // Nueva versión con trazos
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
    if (btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
    
    modoEdicion = false; obraEditandoId = null; fondoEditandoId = null;

  } catch (err) {
    alert("Error: " + err.message);
    if (btn) { btn.textContent = "Guardar Obra"; btn.disabled = false; }
  }
}

document.addEventListener("DOMContentLoaded", initArte);