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
   BOTÓN DE INSTALAR PWA (Vinculado al botón bonito del HTML)
   ========================================= */
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // En lugar de crear un botón feo, mostramos el botón bonito que ya está en el HTML
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
        alert("Para instalar:\n\n1. Toca el menú ⋮ de Chrome\n2. Elige 'Añadir a pantalla de inicio'");
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") btn.style.display = "none";
      deferredPrompt = null;
    });
  }
});