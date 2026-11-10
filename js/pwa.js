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
  console.log("🔥 beforeinstallprompt detectado. Botón PWA listo.");
  const btn = document.getElementById("btnInstalarPWAUnico");
  if (btn) btn.style.display = "inline-flex";
});

window.addEventListener("appinstalled", () => {
  console.log("🎉 App instalada correctamente.");
  const btn = document.getElementById("btnInstalarPWAUnico");
  if (btn) btn.style.display = "none";
  if (window.lanzarConfeti) window.lanzarConfeti(1500);
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnInstalarPWAUnico");
  if (!btn) {
    console.warn("⚠️ No se encontró el botón PWA (id='btnInstalarPWAUnico')");
    return;
  }

  // Forzamos que se vea SIEMPRE, independientemente del evento
  btn.style.display = "inline-flex";

  btn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      alert(
        "Para instalar la app:\n\n" +
        "1. Toca el menú ⋮ de tu navegador\n" +
        "2. Selecciona 'Añadir a pantalla de inicio' o 'Instalar app'\n\n" +
        "Si ya está instalada, este mensaje no aparecerá más."
      );
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("Resultado de la instalación:", outcome);
    if (outcome === "accepted") btn.style.display = "none";
    deferredPrompt = null;
  });
});