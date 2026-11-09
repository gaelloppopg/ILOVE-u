/* =========================================
   SCRIPT GENERAL
   - Reveals al hacer scroll
   - Confeti de bienvenida
   - Modo oscuro
   ========================================= */

// ==================== REVEALS ====================
function observarReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal:not(.visible)").forEach(el => io.observe(el));
}
document.addEventListener("DOMContentLoaded", observarReveals);

// ==================== CONFETI BIENVENIDA ====================
document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".hero") && !sessionStorage.getItem("bienvenida_mostrada")) {
    sessionStorage.setItem("bienvenida_mostrada", "1");
    setTimeout(() => window.lanzarConfeti && window.lanzarConfeti(2000), 600);
  }
});

// ==================== 🌙 MODO OSCURO ====================
(function () {
  const STORAGE_TEMA = "tema_novia";

  function aplicarTema(tema) {
    const esOscuro = tema === "oscuro";
    document.documentElement.setAttribute("data-theme", esOscuro ? "dark" : "light");
    const btn = document.getElementById("btnTema");
    if (btn) btn.textContent = esOscuro ? "☀️" : "🌙";
  }

  function temaGuardado() {
    return localStorage.getItem(STORAGE_TEMA) || "claro";
  }

  window.toggleTema = function () {
    const actual = document.documentElement.getAttribute("data-theme") === "dark" ? "oscuro" : "claro";
    const nuevo = actual === "oscuro" ? "claro" : "oscuro";
    localStorage.setItem(STORAGE_TEMA, nuevo);
    aplicarTema(nuevo);
  };

  aplicarTema(temaGuardado());

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("btnTema")) return;
    const btn = document.createElement("button");
    btn.id = "btnTema";
    btn.className = "btn-tema";
    btn.setAttribute("aria-label", "Cambiar tema");
    btn.addEventListener("click", window.toggleTema);
    document.body.appendChild(btn);
    aplicarTema(temaGuardado());
    console.log("🌙 Botón de tema creado");
  });
})();