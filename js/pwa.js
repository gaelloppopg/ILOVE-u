/* =========================================
   PWA - Registro SW + auto-actualización
   ========================================= */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const enPages = location.pathname.includes("/pages/");
    const swPath = enPages ? "../sw.js" : "./sw.js";
    const swScope = enPages ? "../" : "./";

    navigator.serviceWorker.register(swPath, { scope: swScope })
      .then((reg) => {
        console.log("✅ Service Worker registrado. Scope:", reg.scope);
        setInterval(() => { reg.update(); }, 30 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) reg.update();
        });
      })
      .catch((e) => {
        console.warn("SW no registrado (normal si file://):", e.message);
      });
  });
}

/* =========================================
   BOTÓN DE INSTALAR PWA
   ========================================= */
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Mostramos el botón si el navegador permite la instalación
  const btn = document.getElementById("btnInstalarPWAUnico");
  if (btn) btn.style.display = "inline-flex";
});

window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("btnInstalarPWAUnico");
  if (btn) btn.style.display = "none";
  if (window.lanzarConfeti) window.lanzarConfeti(1500);
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnInstalarPWAUnico");
  if (btn) {
    // Siempre lo mostramos por defecto para que el usuario lo vea
    btn.style.display = "inline-flex";
    
    btn.addEventListener("click", async () => {
      // Si es iPhone o no está soportado el prompt
      if (!deferredPrompt) {
        alert("Para instalar la app en tu celular:\n\n1. Si estás en iPhone, toca el botón 'Compartir' (cuadro con flecha) en Safari.\n2. Selecciona 'Añadir a pantalla de inicio'.\n\nSi estás en Android o PC, usa el menú del navegador (⋮) y elige 'Instalar App'.");
        return;
      }
      // Si está soportado, lanzamos la ventana nativa
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") btn.style.display = "none";
      deferredPrompt = null;
    });
  }
});