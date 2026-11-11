import { supabase } from './supabase.js';
import { subirArchivo } from './storage.js';

// ============================================================
//  ESTADO COMPARTIDO (libro, museo, temas)
// ============================================================
let coupleId = null;
let obras = [];
let paginas = [];
let paginaActual = 0;
const OBRAS_POR_PAGINA = 4;
let obraActualEnMuseo = null;
let preferenciaDispositivo = 'auto';
let modoEdicion = false;
let obraEditandoId = null;
let fondoEditandoId = null;

// ============================================================
//  UTILIDADES
// ============================================================
function cargarImagen(src, isCORS = false) {
  return new Promise((res, rej) => {
    const img = new Image();
    if (isCORS) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => {
      const fb = new Image();
      fb.onload = () => res(fb);
      fb.onerror = () => rej(new Error("No se pudo cargar imagen: " + src));
      fb.src = src;
    };
    img.src = src;
  });
}

function canvasABlob(cnv) { return new Promise((res) => cnv.toBlob(res, "image/png")); }
function generarUUID() {
  return crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// ============================================================
//  BLOQUEO DE SCROLL
// ============================================================
let _scrollY = 0;
function bloquearScrollBody() {
  if (document.body.dataset.scrollBloqueado === "1") return;
  _scrollY = window.scrollY || 0;
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
function actualizarBloqueoScroll() {
  const e = document.getElementById("estudioOverlay");
  const m = document.getElementById("museoOverlay");
  const p = document.getElementById("panelTemasDrawer");
  const abierto = (e && e.classList.contains("activo"))
    || (m && m.classList.contains("activo"))
    || (p && p.classList.contains("activo"))
    || (document.getElementById("libroWrapper")?.classList.contains("abierto"));
  if (abierto) bloquearScrollBody();
  else desbloquearScrollBody();
}

// ============================================================
//  ESTUDIO MÓVIL — LÓGICA 100% INDEPENDIENTE
// ============================================================
const EstudioMovil = {
  inicializado: false,
  canvas: null,
  ctx: null,
  canvasFondo: null,
  ctxFondo: null,
  trazos: [],
  trazoActual: null,
  dibujando: false,
  herramienta: "pincel",
  color: "#1a1a1a",
  grosor: 8,
  fondoImagen: null,
  fondoColor: "#ffffff",
  fondoOpacidad: 100,

  init() {
    if (this.inicializado) return;
    const vista = document.querySelector('.vista-movil');
    if (!vista) return;

    this.canvas = vista.querySelector('.lienzo-dibujo');
    this.canvasFondo = vista.querySelector('.lienzo-fondo');
    if (!this.canvas || !this.canvasFondo) return;

    this.ctx = this.canvas.getContext('2d');
    this.ctxFondo = this.canvasFondo.getContext('2d');
    this.canvas.style.touchAction = 'none';
    this.canvasFondo.style.touchAction = 'none';

    this._bindCanvas();
    this._bindBotones(vista);
    this._bindMenuLateral(vista);
    this._bindTitulo(vista);
    this._dibujarFondo();

    this.inicializado = true;
  },

  _bindCanvas() {
    const c = this.canvas;
    const start = (e) => {
      if (e.cancelable) e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      this._empezar(p);
    };
    const move = (e) => {
      if (e.cancelable) e.preventDefault();
      if (!this.dibujando) return;
      const p = e.touches ? e.touches[0] : e;
      this._dibujar(p);
    };
    const end = (e) => {
      if (e.cancelable) e.preventDefault();
      this._terminar();
    };

    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', end, { passive: false });
    c.addEventListener('touchcancel', end, { passive: false });
    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    c.addEventListener('mouseup', end);
    c.addEventListener('mouseleave', end);
  },

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    const cx = e.clientX !== undefined ? e.clientX : e.pageX;
    const cy = e.clientY !== undefined ? e.clientY : e.pageY;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  },

  _empezar(e) {
    this.dibujando = true;
    const pos = this._getPos(e);
    this.trazoActual = {
      tipo: this.herramienta,
      color: this.color,
      grosor: this.grosor,
      opacidad: this.herramienta === "lapiz" ? 0.6 : 1,
      sombra: this.herramienta === "neon" ? 25 : 0,
      puntos: [pos]
    };
    this.trazos.push(this.trazoActual);
    this._render();
  },

  _dibujar(e) {
    if (!this.trazoActual) return;
    const pos = this._getPos(e);
    if (this.herramienta === "spray") {
      for (let i = 0; i < 5; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.random() * this.grosor * 2;
        this.trazoActual.puntos.push({
          x: pos.x + Math.cos(ang) * d,
          y: pos.y + Math.sin(ang) * d
        });
      }
    } else {
      this.trazoActual.puntos.push(pos);
    }
    this._render();
  },

  _terminar() {
    this.dibujando = false;
    this.trazoActual = null;
  },

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.trazos.forEach((trazo) => {
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
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (trazo.puntos.length === 1) {
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
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },

  _dibujarFondo() {
    this.ctxFondo.clearRect(0, 0, this.canvasFondo.width, this.canvasFondo.height);
    if (this.fondoImagen) {
      this.ctxFondo.save();
      this.ctxFondo.globalAlpha = this.fondoOpacidad / 100;
      this.ctxFondo.drawImage(this.fondoImagen, 0, 0, this.canvasFondo.width, this.canvasFondo.height);
      this.ctxFondo.restore();
    } else {
      this.ctxFondo.fillStyle = this.fondoColor;
      this.ctxFondo.fillRect(0, 0, this.canvasFondo.width, this.canvasFondo.height);
    }
  },

  _bindBotones(vista) {
    // Herramientas SOLO dentro de la vista móvil
    vista.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        vista.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.herramienta = btn.dataset.tool;
      });
    });

    // Grosor
    vista.querySelectorAll('.input-grosor').forEach(inp => {
      inp.addEventListener('input', (e) => {
        this.grosor = parseInt(e.target.value);
        vista.querySelectorAll('.grosor-badge').forEach(b => b.textContent = this.grosor);
      });
    });

    // Colores
    vista.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        vista.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.color = btn.dataset.color || this.color;
        vista.querySelectorAll('.colorPicker').forEach(cp => cp.value = this.color);
      });
    });

    vista.querySelectorAll('.colorPicker').forEach(cp => {
      cp.addEventListener('input', (e) => {
        this.color = e.target.value;
        vista.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      });
    });

    // Copiar / Pegar / Limpiar
    vista.querySelectorAll('.btn-copiar').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      this.copiar();
    }));
    vista.querySelectorAll('.btn-pegar').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      this.pegar();
    }));
    vista.querySelectorAll('.btn-limpiar').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      this.limpiar();
    }));

    // Guardar (menú lateral + barra instagram)
    vista.querySelectorAll('.btn-guardar').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      guardarObraMovil();
    }));

    // Fondo
    vista.querySelectorAll('.fondo-color-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        this.fondoColor = e.target.value;
        this.fondoImagen = null;
        this._dibujarFondo();
      });
    });
    vista.querySelectorAll('.btn-subir-fondo').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('inputFondo')?.click();
    }));
    vista.querySelectorAll('.btn-quitar-fondo').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      this.fondoImagen = null;
      this.fondoColor = "#ffffff";
      vista.querySelectorAll('.fondo-color-input').forEach(inp => inp.value = "#ffffff");
      this._dibujarFondo();
    }));

    // Input file (compartido, se bindea una vez)
    const inp = document.getElementById('inputFondo');
    if (inp && !inp.dataset.bound) {
      inp.dataset.bound = "1";
      inp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            // Según layout activo, aplicar al estudio correcto
            if (document.body.classList.contains('layout-escritorio')) {
              EstudioEscritorio.setFondoImagen(img);
            } else {
              this.fondoImagen = img;
              this._dibujarFondo();
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  },

  _bindMenuLateral(vista) {
    const btnAbrir = document.getElementById('btnAbrirMenuM');
    const btnCerrar = document.getElementById('btnCerrarMenuM');
    const overlay = document.getElementById('overlayMenu');
    const toolbar = document.getElementById('estudioToolbar');
    if (!btnAbrir || !toolbar || !overlay) return;

    btnAbrir.addEventListener('click', (e) => {
      e.preventDefault();
      toolbar.classList.add('activo');
      overlay.classList.add('activo');
    });
    if (btnCerrar) btnCerrar.addEventListener('click', (e) => {
      e.preventDefault();
      toolbar.classList.remove('activo');
      overlay.classList.remove('activo');
    });
    overlay.addEventListener('click', () => {
      toolbar.classList.remove('activo');
      overlay.classList.remove('activo');
    });
  },

  _bindTitulo(vista) {
    const tM = document.getElementById('tituloObraM');
    const tE = document.getElementById('tituloObra');
    if (tM && tE) {
      tM.addEventListener('input', () => { tE.value = tM.value; });
      tE.addEventListener('input', () => { tM.value = tE.value; });
    }
  },

  copiar() {
    window._portapapeles = window._portapapeles || { fondo: null, trazos: [] };
    window._portapapeles.trazos = JSON.parse(JSON.stringify(this.trazos));
    if (this.fondoImagen) {
      window._portapapeles.fondo = this.fondoImagen;
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = this.canvasFondo.width;
      tmp.height = this.canvasFondo.height;
      const c = tmp.getContext('2d');
      c.fillStyle = this.fondoColor;
      c.fillRect(0, 0, tmp.width, tmp.height);
      window._portapapeles.fondo = tmp;
    }
    alert("Trazos y fondo copiados.");
  },

  pegar() {
    const pp = window._portapapeles;
    if (!pp) { alert("Nada que pegar."); return; }
    if (pp.trazos && pp.trazos.length) {
      pp.trazos.forEach(t => this.trazos.push(JSON.parse(JSON.stringify(t))));
      this._render();
    }
    if (pp.fondo) {
      this.fondoImagen = pp.fondo;
      this._dibujarFondo();
    }
    alert("Trazos pegados.");
  },

  limpiar() {
    this.trazos = [];
    this.trazoActual = null;
    this._render();
  },

  reset() {
    this.trazos = [];
    this.trazoActual = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.fondoImagen = null;
    this.fondoColor = "#ffffff";
    const vista = document.querySelector('.vista-movil');
    vista.querySelectorAll('.fondo-color-input').forEach(i => i.value = "#ffffff");
    document.getElementById('tituloObraM').value = "";
    const tE = document.getElementById('tituloObra');
    if (tE) tE.value = "";
    this._dibujarFondo();
    this._render();
  },

  async cargarObra(obra) {
    this.reset();
    if (obra.capa_fondo_url) {
      try {
        this.fondoImagen = await cargarImagen(obra.capa_fondo_url, true);
        this._dibujarFondo();
      } catch {
        this.fondoColor = obra.fondo_color || "#ffffff";
        document.querySelector('.vista-movil .fondo-color-input').value = this.fondoColor;
        this._dibujarFondo();
      }
    } else {
      this.fondoColor = obra.fondo_color || "#ffffff";
      document.querySelector('.vista-movil .fondo-color-input').value = this.fondoColor;
      this._dibujarFondo();
    }
    if (obra.capa_trazos && Array.isArray(obra.capa_trazos)) {
      this.trazos = JSON.parse(JSON.stringify(obra.capa_trazos));
      this._render();
    }
    document.getElementById('tituloObraM').value = obra.titulo || "";
    const tE = document.getElementById('tituloObra');
    if (tE) tE.value = obra.titulo || "";
  },

  setFondoImagen(img) {
    this.fondoImagen = img;
    this._dibujarFondo();
  },

  /**
   * Genera el canvas compuesto (fondo + trazos) para guardar.
   */
  componerCanvas() {
    const tmp = document.createElement('canvas');
    tmp.width = this.canvas.width;
    tmp.height = this.canvas.height;
    const c = tmp.getContext('2d');
    c.drawImage(this.canvasFondo, 0, 0);
    c.drawImage(this.canvas, 0, 0);
    return tmp;
  }
};

// ============================================================
//  ESTUDIO ESCRITORIO — LÓGICA INDEPENDIENTE (como antes, aislada)
// ============================================================
const EstudioEscritorio = {
  inicializado: false,
  canvas: null,
  ctx: null,
  canvasFondo: null,
  ctxFondo: null,
  trazos: [],
  trazoActual: null,
  dibujando: false,
  herramienta: "pincel",
  color: "#1a1a1a",
  grosor: 8,
  fondoImagen: null,
  fondoColor: "#ffffff",
  fondoOpacidad: 100,

  init() {
    if (this.inicializado) return;
    const vista = document.querySelector('.vista-escritorio');
    if (!vista) return;
    this.canvas = vista.querySelector('.lienzo-dibujo');
    this.canvasFondo = vista.querySelector('.lienzo-fondo');
    if (!this.canvas || !this.canvasFondo) return;
    this.ctx = this.canvas.getContext('2d');
    this.ctxFondo = this.canvasFondo.getContext('2d');
    this._bindCanvas();
    this._bindBotones(vista);
    this._dibujarFondo();
    this.inicializado = true;
  },

  _bindCanvas() {
    const c = this.canvas;
    const start = (e) => { if (e.cancelable) e.preventDefault(); this._empezar(e); };
    const move = (e) => { if (this.dibujando) this._dibujar(e); };
    const end = () => this._terminar();
    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    c.addEventListener('mouseup', end);
    c.addEventListener('mouseleave', end);
    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', end, { passive: false });
  },

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy
    };
  },

  _empezar(e) {
    this.dibujando = true;
    const pos = this._getPos(e);
    this.trazoActual = {
      tipo: this.herramienta, color: this.color, grosor: this.grosor,
      opacidad: this.herramienta === "lapiz" ? 0.6 : 1,
      sombra: this.herramienta === "neon" ? 25 : 0,
      puntos: [pos]
    };
    this.trazos.push(this.trazoActual);
    this._render();
  },

  _dibujar(e) {
    if (!this.trazoActual) return;
    const pos = this._getPos(e);
    if (this.herramienta === "spray") {
      for (let i = 0; i < 5; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.random() * this.grosor * 2;
        this.trazoActual.puntos.push({
          x: pos.x + Math.cos(ang) * d,
          y: pos.y + Math.sin(ang) * d
        });
      }
    } else {
      this.trazoActual.puntos.push(pos);
    }
    this._render();
  },

  _terminar() { this.dibujando = false; this.trazoActual = null; },

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.trazos.forEach((trazo) => {
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
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.random() * 1.5 + 0.5, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (trazo.puntos.length === 1) {
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
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },

  _dibujarFondo() {
    this.ctxFondo.clearRect(0, 0, this.canvasFondo.width, this.canvasFondo.height);
    if (this.fondoImagen) {
      this.ctxFondo.save();
      this.ctxFondo.globalAlpha = this.fondoOpacidad / 100;
      this.ctxFondo.drawImage(this.fondoImagen, 0, 0, this.canvasFondo.width, this.canvasFondo.height);
      this.ctxFondo.restore();
    } else {
      this.ctxFondo.fillStyle = this.fondoColor;
      this.ctxFondo.fillRect(0, 0, this.canvasFondo.width, this.canvasFondo.height);
    }
  },

  _bindBotones(vista) {
    vista.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        vista.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.herramienta = btn.dataset.tool;
      });
    });
    vista.querySelectorAll('.input-grosor').forEach(inp => {
      inp.addEventListener('input', (e) => {
        this.grosor = parseInt(e.target.value);
        vista.querySelectorAll('.grosor-badge').forEach(b => b.textContent = this.grosor);
      });
    });
    vista.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        vista.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.color = btn.dataset.color || this.color;
      });
    });
    vista.querySelectorAll('.btn-copiar').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); this.copiar(); }));
    vista.querySelectorAll('.btn-pegar').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); this.pegar(); }));
    vista.querySelectorAll('.btn-limpiar').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); this.limpiar(); }));
    vista.querySelectorAll('.btn-guardar').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); guardarObraEscritorio(); }));

    vista.querySelectorAll('.fondo-color-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        this.fondoColor = e.target.value;
        this.fondoImagen = null;
        this._dibujarFondo();
      });
    });
    vista.querySelectorAll('.btn-subir-fondo').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('inputFondo')?.click();
    }));
    vista.querySelectorAll('.btn-quitar-fondo').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      this.fondoImagen = null;
      this.fondoColor = "#ffffff";
      vista.querySelectorAll('.fondo-color-input').forEach(inp => inp.value = "#ffffff");
      this._dibujarFondo();
    }));
  },

  copiar() {
    window._portapapeles = window._portapapeles || { fondo: null, trazos: [] };
    window._portapapeles.trazos = JSON.parse(JSON.stringify(this.trazos));
    if (this.fondoImagen) {
      window._portapapeles.fondo = this.fondoImagen;
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = this.canvasFondo.width;
      tmp.height = this.canvasFondo.height;
      const c = tmp.getContext('2d');
      c.fillStyle = this.fondoColor;
      c.fillRect(0, 0, tmp.width, tmp.height);
      window._portapapeles.fondo = tmp;
    }
    alert("Trazos y fondo copiados.");
  },

  pegar() {
    const pp = window._portapapeles;
    if (!pp) { alert("Nada que pegar."); return; }
    if (pp.trazos?.length) {
      pp.trazos.forEach(t => this.trazos.push(JSON.parse(JSON.stringify(t))));
      this._render();
    }
    if (pp.fondo) {
      this.fondoImagen = pp.fondo;
      this._dibujarFondo();
    }
    alert("Trazos pegados.");
  },

  limpiar() {
    this.trazos = [];
    this.trazoActual = null;
    this._render();
  },

  reset() {
    this.trazos = [];
    this.trazoActual = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.fondoImagen = null;
    this.fondoColor = "#ffffff";
    document.querySelectorAll('.vista-escritorio .fondo-color-input').forEach(i => i.value = "#ffffff");
    const tE = document.getElementById('tituloObra');
    if (tE) tE.value = "";
    this._dibujarFondo();
    this._render();
  },

  async cargarObra(obra) {
    this.reset();
    if (obra.capa_fondo_url) {
      try {
        this.fondoImagen = await cargarImagen(obra.capa_fondo_url, true);
        this._dibujarFondo();
      } catch {
        this.fondoColor = obra.fondo_color || "#ffffff";
        document.querySelector('.vista-escritorio .fondo-color-input').value = this.fondoColor;
        this._dibujarFondo();
      }
    } else {
      this.fondoColor = obra.fondo_color || "#ffffff";
      document.querySelector('.vista-escritorio .fondo-color-input').value = this.fondoColor;
      this._dibujarFondo();
    }
    if (obra.capa_trazos && Array.isArray(obra.capa_trazos)) {
      this.trazos = JSON.parse(JSON.stringify(obra.capa_trazos));
      this._render();
    }
    const tE = document.getElementById('tituloObra');
    if (tE) tE.value = obra.titulo || "";
  },

  setFondoImagen(img) {
    this.fondoImagen = img;
    this._dibujarFondo();
  },

  componerCanvas() {
    const tmp = document.createElement('canvas');
    tmp.width = this.canvas.width;
    tmp.height = this.canvas.height;
    const c = tmp.getContext('2d');
    c.drawImage(this.canvasFondo, 0, 0);
    c.drawImage(this.canvas, 0, 0);
    return tmp;
  }
};

// ============================================================
//  GUARDADO
// ============================================================
async function guardarObraMovil() {
  if (!EstudioMovil.inicializado) return;
  const titulo = (document.getElementById('tituloObraM')?.value || '').trim() || "Sin título";

  document.querySelectorAll('.vista-movil .btn-guardar').forEach(b => {
    b.dataset.originalText = b.textContent;
    b.textContent = "Guardando..."; b.disabled = true;
  });

  try {
    const tmp = EstudioMovil.componerCanvas();
    const blob = await canvasABlob(tmp);
    const file = new File([blob], `obra_${Date.now()}.png`, { type: "image/png" });
    const { url } = await subirArchivo(file, "arte");

    let urlFondo = null;
    if (EstudioMovil.fondoImagen) {
      const blobF = await canvasABlob(EstudioMovil.canvasFondo);
      const fileF = new File([blobF], `fondo_${fondoEditandoId}.png`, { type: "image/png" });
      const r = await subirArchivo(fileF, "arte/capas");
      urlFondo = r.url;
    }

    const payload = {
      couple_id: coupleId,
      titulo,
      imagen_url: url,
      capa_fondo_url: urlFondo,
      capa_trazos: EstudioMovil.trazos,
      fondo_id: fondoEditandoId,
      fondo_color: EstudioMovil.fondoColor,
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
    alert("Error al guardar: " + err.message);
  } finally {
    document.querySelectorAll('.vista-movil .btn-guardar').forEach(b => {
      b.textContent = b.dataset.originalText || "Guardar";
      b.disabled = false;
    });
    modoEdicion = false; obraEditandoId = null; fondoEditandoId = null;
  }
}

async function guardarObraEscritorio() {
  if (!EstudioEscritorio.inicializado) return;
  const titulo = (document.getElementById('tituloObra')?.value || '').trim() || "Sin título";
  document.querySelectorAll('.vista-escritorio .btn-guardar').forEach(b => {
    b.dataset.originalText = b.textContent;
    b.textContent = "Guardando..."; b.disabled = true;
  });
  try {
    const tmp = EstudioEscritorio.componerCanvas();
    const blob = await canvasABlob(tmp);
    const file = new File([blob], `obra_${Date.now()}.png`, { type: "image/png" });
    const { url } = await subirArchivo(file, "arte");
    let urlFondo = null;
    if (EstudioEscritorio.fondoImagen) {
      const blobF = await canvasABlob(EstudioEscritorio.canvasFondo);
      const fileF = new File([blobF], `fondo_${fondoEditandoId}.png`, { type: "image/png" });
      const r = await subirArchivo(fileF, "arte/capas");
      urlFondo = r.url;
    }
    const payload = {
      couple_id: coupleId, titulo, imagen_url: url,
      capa_fondo_url: urlFondo, capa_trazos: EstudioEscritorio.trazos,
      fondo_id: fondoEditandoId, fondo_color: EstudioEscritorio.fondoColor,
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
    alert("Error al guardar: " + err.message);
  } finally {
    document.querySelectorAll('.vista-escritorio .btn-guardar').forEach(b => {
      b.textContent = b.dataset.originalText || "Guardar Obra";
      b.disabled = false;
    });
    modoEdicion = false; obraEditandoId = null; fondoEditandoId = null;
  }
}

// ============================================================
//  ABRIR / CERRAR ESTUDIO
// ============================================================
function abrirEstudio() {
  modoEdicion = false;
  obraEditandoId = null;
  fondoEditandoId = generarUUID();

  const overlay = document.getElementById("estudioOverlay");
  if (overlay) overlay.classList.add("activo");

  // Inicializar el estudio según layout activo
  if (document.body.classList.contains('layout-escritorio')) {
    EstudioEscritorio.init();
    EstudioEscritorio.reset();
  } else {
    EstudioMovil.init();
    EstudioMovil.reset();
  }

  bloquearScrollBody();
  document.body.classList.add('estudio-abierto');
}

function cerrarEstudio() {
  const el = document.getElementById("estudioOverlay");
  if (el) el.classList.remove("activo");
  document.body.classList.remove('estudio-abierto');
  const toolbar = document.getElementById('estudioToolbar');
  const overlayMenu = document.getElementById('overlayMenu');
  if (toolbar) toolbar.classList.remove('activo');
  if (overlayMenu) overlayMenu.classList.remove('activo');
  actualizarBloqueoScroll();
}

// ============================================================
//  INICIALIZACIÓN GLOBAL
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

  // Inicializar AMBOS estudios (cada uno bindea sus propios botones sin colisión)
  EstudioMovil.init();
  EstudioEscritorio.init();

  configurarEventosUI();
  initPanelTemas();
  initParallaxLibro();
  await cargarObras();
}

// ============================================================
//  UI GENERAL (libro, museo, temas)
// ============================================================
function configurarEventosUI() {
  document.querySelectorAll("#btnNuevaObra").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault(); abrirEstudio();
  }));
  document.querySelectorAll("#cerrarEstudio").forEach(b => b.addEventListener("click", (e) => {
    e.preventDefault(); cerrarEstudio();
  }));
  document.querySelectorAll("#btnCerrarLibro").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); cerrarLibro(); }));
  document.querySelectorAll("#libroPortada").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); abrirLibro(); }));
  document.querySelectorAll("#btnPrev").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); paginaAnterior(); }));
  document.querySelectorAll("#btnNext").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); paginaSiguiente(); }));

  document.querySelectorAll("#btnCerrarMuseo").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); cerrarMuseo(); }));
  document.querySelectorAll("#museoOverlay").forEach(m => m.addEventListener("click", (e) => {
    if (e.target.id === 'museoOverlay') cerrarMuseo();
  }));

  document.querySelectorAll("#btnBorrarObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); borrarObraDesdeMuseo(); }));
  document.querySelectorAll("#btnEditarObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); editarObraDesdeMuseo(); }));
  document.querySelectorAll("#btnCopiarObraMuseo").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); copiarObraDesdeMuseo(); }));
  document.querySelectorAll("#btnDescargarObra").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); descargarObraComoPNG(); }));
}

function initPanelTemas() {
  const btnAbrir = document.getElementById('btnAbrirPanelTemas');
  const btnCerrar = document.getElementById('btnCerrarPanelTemas');
  const overlay = document.getElementById('panelTemasOverlay');
  const drawer = document.getElementById('panelTemasDrawer');
  const items = document.querySelectorAll('.tema-card');
  const previewColor = document.getElementById('previewColorActual');
  if (!btnAbrir) return;

  btnAbrir.addEventListener('click', (e) => {
    e.preventDefault();
    drawer.classList.add('activo'); overlay.classList.add('activo');
    bloquearScrollBody();
  });
  const cerrar = () => {
    drawer.classList.remove('activo'); overlay.classList.remove('activo');
    actualizarBloqueoScroll();
  };
  if (btnCerrar) btnCerrar.addEventListener('click', (e) => { e.preventDefault(); cerrar(); });
  if (overlay) overlay.addEventListener('click', cerrar);

  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      items.forEach(i => i.classList.remove('activo'));
      item.classList.add('activo');
      const tema = item.dataset.setTema;
      document.body.setAttribute('data-tema', tema);
      const bg = item.querySelector('.tema-card-preview').style.background;
      if (previewColor) previewColor.style.background = bg;
      localStorage.setItem('tema_pagina', tema);
      cerrar();
    });
  });

  const guardado = localStorage.getItem('tema_pagina');
  if (guardado) {
    document.body.setAttribute('data-tema', guardado);
    const itemActivo = document.querySelector(`.tema-card[data-set-tema="${guardado}"]`);
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
    if (wrapper.classList.contains("abierto")) wrapper.style.transform = "rotateX(0deg) rotateY(0deg)";
  });
}

async function cargarObras() {
  const { data } = await supabase.from('arte_obras').select('*')
    .eq('couple_id', coupleId).order('fecha', { ascending: false });
  obras = data || [];
  generarLibro();
}

function generarLibro() {
  const contenedor = document.getElementById("libroPaginas");
  if (!contenedor) return;
  contenedor.innerHTML = "";
  paginas = [];
  if (obras.length === 0) {
    const hoja = document.createElement("div");
    hoja.className = "hoja";
    hoja.innerHTML = `<div class="hoja-cara" style="display:flex;align-items:center;justify-content:center;grid-column:1/-1;grid-row:1/-1;"><p style="font-family:'Caveat';font-size:2.5rem;color:#aaa;text-align:center;">Aún no hay obras...<br>Crea la primera.</p></div><div class="hoja-cara trasera"></div>`;
    contenedor.appendChild(hoja);
    return;
  }
  for (let i = 0; i < obras.length; i += OBRAS_POR_PAGINA) paginas.push(obras.slice(i, i + OBRAS_POR_PAGINA));
  for (let i = 0; i < paginas.length; i++) {
    const hoja = document.createElement("div");
    hoja.className = "hoja"; hoja.dataset.index = i;
    const f = document.createElement("div");
    f.className = "hoja-cara";
    f.innerHTML = paginas[i].map(crearEstampaHTML).join("");
    const t = document.createElement("div");
    t.className = "hoja-cara trasera";
    if (i + 1 < paginas.length) t.innerHTML = paginas[i + 1].map(crearEstampaHTML).join("");
    hoja.appendChild(f); hoja.appendChild(t);
    contenedor.appendChild(hoja);
  }
  actualizarZIndex(); actualizarControles();
}

function crearEstampaHTML(obra) {
  return `<div class="estampa-obra" onclick="event.stopPropagation(); window.abrirMuseo('${obra.id}')">
    <img src="${obra.imagen_url}" alt="${obra.titulo}" loading="lazy" />
    <h4>${obra.titulo || "Sin título"}</h4></div>`;
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
  bloquearScrollBody();
}

function cerrarLibro() {
  const lw = document.getElementById("libroWrapper");
  const lc = document.getElementById("libroControles");
  const bc = document.getElementById("btnCerrarLibro");
  if (lw) { lw.classList.remove("abierto"); lw.style.transform = ""; }
  if (lc) lc.classList.remove("activo");
  if (bc) bc.style.display = "none";
  paginaActual = 0;
  document.querySelectorAll(".hoja").forEach(h => h.classList.remove("volteada"));
  actualizarZIndex(); actualizarControles();
  actualizarBloqueoScroll();
}

function paginaAnterior() { if (paginaActual > 1) { paginaActual--; animarPagina(); } }
function paginaSiguiente() { if (paginaActual < paginas.length) { paginaActual++; animarPagina(); } }
function animarPagina() {
  const w = document.getElementById("libroWrapper");
  if (w) w.classList.add("girando");
  actualizarPaginas();
  setTimeout(() => { if (w) w.classList.remove("girando"); }, 1200);
}
function actualizarPaginas() {
  document.querySelectorAll(".hoja").forEach((h, i) => {
    if (i < paginaActual - 1) h.classList.add("volteada"); else h.classList.remove("volteada");
  });
  actualizarZIndex(); actualizarControles();
}
function actualizarZIndex() {
  const hojas = document.querySelectorAll(".hoja");
  hojas.forEach((h, i) => {
    h.style.zIndex = h.classList.contains("volteada") ? i + 1 : hojas.length - i + 10;
  });
}
function actualizarControles() {
  const p = document.getElementById("btnPrev");
  const n = document.getElementById("btnNext");
  const ind = document.getElementById("indicadorPaginas");
  if (p) p.disabled = paginaActual <= 1;
  if (n) n.disabled = paginaActual >= paginas.length;
  if (ind) {
    if (paginaActual === 0) ind.textContent = "Libro Cerrado";
    else {
      const a = (paginaActual - 1) * 2 + 1;
      ind.textContent = `Páginas ${a} - ${a + 1}`;
    }
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
  bloquearScrollBody();
};

function cerrarMuseo() {
  document.getElementById("museoOverlay").classList.remove("activo");
  actualizarBloqueoScroll();
}

async function editarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  const obra = obraActualEnMuseo;
  cerrarMuseo();
  modoEdicion = true;
  obraEditandoId = obra.id;
  fondoEditandoId = obra.fondo_id || generarUUID();

  document.getElementById("estudioOverlay").classList.add("activo");

  if (document.body.classList.contains('layout-escritorio')) {
    EstudioEscritorio.init();
    await EstudioEscritorio.cargarObra(obra);
  } else {
    EstudioMovil.init();
    await EstudioMovil.cargarObra(obra);
  }

  bloquearScrollBody();
  document.body.classList.add('estudio-abierto');
}

async function copiarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  const obra = obraActualEnMuseo;
  const botones = document.querySelectorAll("#btnCopiarObraMuseo");
  const orig = Array.from(botones).map(b => b.textContent);
  botones.forEach(b => b.textContent = "Copiando...");

  try {
    window._portapapeles = window._portapapeles || { fondo: null, trazos: [] };
    if (obra.capa_fondo_url) {
      window._portapapeles.fondo = await cargarImagen(obra.capa_fondo_url, true);
    } else {
      const t = document.createElement("canvas");
      t.width = 900; t.height = 600;
      const c = t.getContext("2d");
      c.fillStyle = obra.fondo_color || "#ffffff";
      c.fillRect(0, 0, 900, 600);
      window._portapapeles.fondo = t;
    }
    window._portapapeles.trazos = (obra.capa_trazos && obra.capa_trazos.length) ? obra.capa_trazos : [];

    botones.forEach(b => b.textContent = "¡Copiado!");
    cerrarMuseo();
    abrirEstudio();

    // Auto-pegar en el estudio activo
    setTimeout(() => {
      if (document.body.classList.contains('layout-escritorio')) EstudioEscritorio.pegar();
      else EstudioMovil.pegar();
    }, 100);

    setTimeout(() => botones.forEach((b, i) => b.textContent = orig[i]), 500);
  } catch (err) {
    alert("No se pudo copiar: " + err.message);
    botones.forEach((b, i) => b.textContent = orig[i]);
  }
}

async function descargarObraComoPNG() {
  if (!obraActualEnMuseo?.imagen_url) return;
  try {
    const r = await fetch(obraActualEnMuseo.imagen_url);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Obra-${obraActualEnMuseo.titulo || 'Sin-titulo'}.png`;
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); document.body.removeChild(a);
  } catch (e) { alert("Error: " + e.message); }
}

async function borrarObraDesdeMuseo() {
  if (!obraActualEnMuseo) return;
  if (!confirm("¿Eliminar esta obra para siempre?")) return;
  try {
    const obra = obraActualEnMuseo;
    const paths = [];
    const push = (u) => { if (u && u.includes('/media/')) paths.push(u.split('/media/')[1]); };
    push(obra.imagen_url); push(obra.capa_fondo_url);
    if (paths.length) await supabase.storage.from('media').remove(paths);
    await supabase.from('arte_obras').delete().eq('id', obra.id);
    cerrarMuseo(); cerrarLibro();
    await cargarObras();
  } catch (e) { alert("Error: " + e.message); }
}

document.addEventListener("DOMContentLoaded", initArte);