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
    btn.addEventListener("click", async () => {
      if (!deferredPrompt) {
        alert("Para instalar la app:\n\n1. Toca el menú ⋮ de tu navegador\n2. Selecciona 'Añadir a pantalla de inicio' o 'Instalar app'");
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") btn.style.display = "none";
      deferredPrompt = null;
    });
  }
});