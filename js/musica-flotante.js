// js/musica-flotante.js
import { supabase } from './supabase.js';

// Creamos el estado global compartido
window.reproductorGlobal = {
  audio: null,
  spotifyIframe: null,
  estaReproduciendo: false,
  pausarTodo: function() {
    if (this.audio) { this.audio.pause(); }
    if (this.spotifyIframe) {
      // Para pausar Spotify, destruimos el iframe y lo volvemos a crear sin autoplay
      const id = this.spotifyIframe.src.match(/track\/([a-zA-Z0-9]+)/);
      if(id) {
        this.spotifyIframe.src = `https://open.spotify.com/embed/track/${id[1]}?utm_source=generator`;
      }
    }
    this.estaReproduciendo = false;
    actualizarBotonesUI();
  },
  playTodo: function() {
    if (this.audio) { this.audio.play(); }
    if (this.spotifyIframe) {
      const id = this.spotifyIframe.src.match(/track\/([a-zA-Z0-9]+)/);
      if(id) {
        this.spotifyIframe.src = `https://open.spotify.com/embed/track/${id[1]}?utm_source=generator&autoplay=1`;
      }
    }
    this.estaReproduciendo = true;
    actualizarBotonesUI();
  }
};

// Función para sincronizar la UI (el vinilo flotante y el botón central)
function actualizarBotonesUI() {
  const vinylFlotante = document.getElementById('floatingVinyl');
  if (vinylFlotante) {
    if (window.reproductorGlobal.estaReproduciendo) vinylFlotante.classList.add('playing');
    else vinylFlotante.classList.remove('playing');
  }

  const vinylCentral = document.getElementById('vinyl');
  const btnCentral = document.getElementById('playBtn');
  if (btnCentral && vinylCentral) {
    if (window.reproductorGlobal.estaReproduciendo) {
      btnCentral.textContent = '⏸ Pausar';
      vinylCentral.classList.add('playing');
    } else {
      btnCentral.textContent = '▶ Reproducir';
      vinylCentral.classList.remove('playing');
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: couple } = await supabase
    .from('couples')
    .select('cancion_spotify_url, cancion_mp3_url')
    .or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`)
    .maybeSingle();
    
  if (!couple) return;

  const spotifyUrl = couple.cancion_spotify_url;
  const mp3Url = couple.cancion_mp3_url;

  if (!spotifyUrl && !mp3Url) return;

  let spotifyTrackId = null;
  if (spotifyUrl) {
    const match = spotifyUrl.match(/spotify\.com\/(?:intl-[a-z]+\/)?(?:track|playlist|album)\/([a-zA-Z0-9]+)/);
    if (match && match[1]) spotifyTrackId = match[1];
  }

  // Inyectamos el vinilo flotante si no está ya
  if (!document.getElementById('floatingVinylContainer')) {
    const playerHTML = `
      <div class="floating-vinyl-container" id="floatingVinylContainer">
        <div class="floating-vinyl" id="floatingVinyl">
          <div class="floating-vinyl-hole"></div>
        </div>
        ${mp3Url ? `<audio id="miniAudio" src="${mp3Url}" loop></audio>` : ''}
        <div id="spotifyIframeContainer" style="position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; overflow: hidden;"></div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', playerHTML);
  }

  const audio = document.getElementById('miniAudio');
  const spotifyContainer = document.getElementById('spotifyIframeContainer');
  const vinyl = document.getElementById('floatingVinyl');

  // Configuramos el estado global con los elementos actuales
  if (audio) {
    window.reproductorGlobal.audio = audio;
    audio.addEventListener('pause', () => { window.reproductorGlobal.estaReproduciendo = false; actualizarBotonesUI(); });
    audio.addEventListener('play', () => { window.reproductorGlobal.estaReproduciendo = true; actualizarBotonesUI(); });
  }

  if (spotifyTrackId) {
    spotifyContainer.innerHTML = `<iframe class="spotify-iframe" src="https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    window.reproductorGlobal.spotifyIframe = spotifyContainer.querySelector('iframe');
  }

  // Evento del click en el vinilo flotante
  vinyl.onclick = () => {
    if (window.reproductorGlobal.estaReproduciendo) {
      window.reproductorGlobal.pausarTodo();
    } else {
      window.reproductorGlobal.playTodo();
    }
  };

  // Conectamos el botón del reproductor central
  const btnCentral = document.getElementById('playBtn');
  if (btnCentral) {
    btnCentral.onclick = () => {
      if (window.reproductorGlobal.estaReproduciendo) {
        window.reproductorGlobal.pausarTodo();
      } else {
        window.reproductorGlobal.playTodo();
      }
    };
  }
});