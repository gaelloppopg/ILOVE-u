/* =========================================
   CONFETI - Canvas sin librerías externas
   ========================================= */

(function () {
  let canvas, ctx, particles = [], animId = null, endTime = 0;
  const COLORS = ["#f28ca6", "#d4a373", "#fbd5dd", "#fff0f4", "#ffd6e0", "#ffb3c6"];
  const EMOJIS = ["💖", "💗", "✨", "🌸", "💕"];

  function setup() {
    canvas = document.getElementById("confetiCanvas");
    if (!canvas) return false;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    return true;
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function crearParticula() {
    const tipo = Math.random() < 0.25 ? "emoji" : "rect";
    return {
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      size: 8 + Math.random() * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.2,
      tipo,
      vida: 1
    };
  }

  function loop() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ahora = Date.now();
    const restante = endTime - ahora;

    if (restante > 0 && particles.length < 250) {
      for (let i = 0; i < 4; i++) particles.push(crearParticula());
    }

    particles.forEach((p, i) => {
      p.x += p.vx + Math.sin((p.y + p.rot * 20) / 40) * 0.6;
      p.y += p.vy;
      p.rot += p.vrot;
      p.vy += 0.02;
      p.vx *= 0.998;
      if (restante < 500) p.vida -= 0.02;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.vida);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (p.tipo === "emoji") {
        ctx.font = `${p.size + 6}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.emoji, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();

      if (p.y > canvas.height + 40 || p.vida <= 0) particles.splice(i, 1);
    });

    if (particles.length > 0 || restante > 0) {
      animId = requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      animId = null;
    }
  }

  window.lanzarConfeti = function (duracionMs = 2000) {
    if (!canvas && !setup()) return;
    endTime = Date.now() + duracionMs;
    if (!animId) loop();
  };

  document.addEventListener("DOMContentLoaded", () => {
    setup();
  });
})();