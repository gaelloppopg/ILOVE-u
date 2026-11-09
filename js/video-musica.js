/* =========================================
   VIDEO + MÚSICA
   Pausa la música cuando el video se reproduce,
   la reanuda cuando el video se pausa/termina.
   ========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const videos = document.querySelectorAll("video");
  if (!videos.length) return;

  const musica = window.__audioGlobal;
  if (!musica) {
    console.warn("⚠️ No hay audio global cargado");
    return;
  }

  videos.forEach((video, i) => {
    let musicaEstabaReproduciendo = false;

    // Cuando el video empieza a reproducirse
video.addEventListener("play", () => {
  if (!musica.paused) {
    musicaEstabaReproduciendo = true;
    musica.volume = 0.09; // volumen casi en 0
  }
});

    // Cuando se pausa el video
    video.addEventListener("pause", () => {
      // Solo reanudar si NO terminó (porque al terminar se dispara 'ended')
      if (!video.ended && musicaEstabaReproduciendo) {
        musica.play().then(() => {
          console.log(`▶️ Música reanudada tras pausar video #${i + 1}`);
        }).catch(() => {});
        musicaEstabaReproduciendo = false;
      }
    });

    // Cuando termina el video
    video.addEventListener("ended", () => {
      if (musicaEstabaReproduciendo) {
        musica.play().then(() => {
          console.log(`▶️ Música reanudada tras terminar video #${i + 1}`);
        }).catch(() => {});
        musicaEstabaReproduciendo = false;
      }
    });

    console.log(`🎬 Video #${i + 1} conectado a control de música`);
  });
});