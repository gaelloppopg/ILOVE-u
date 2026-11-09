// js/exportar-mapa.js

export function initExportadorMapa(todosLosRecuerdos, TIPOS) {
  const modal = document.getElementById('modalExportar');
  const btnExportar = document.getElementById('btnExportarMapa');
  const previewImg = document.getElementById('previewCanvas');
  const listaContainer = document.getElementById('exportarLista');
  const btnDescargar = document.getElementById('btnDescargarMapa');
  
  let ultimoEstado = "";
  let intervaloPrevia = null;
  let tempMapPrevio = null;
  let tempDivPrevio = null;

  const MAPTILER_API_KEY = 'tSwSFgCCQCYrOaJEOxw7';

  // 🛑 ESTILOS CORREGIDOS Y AMPLIADOS 🛑
  const ESTILOS_MAPA = {
    // Los que ya funcionaban
    clasico:    { url: 'basic-v2',      pinBg: '#ffffff', pinBorder: '#212529', pinIcon: '#212529' },
    ciberpunk:  { url: 'backdrop',      pinBg: '#fcee0a', pinBorder: '#00ffff', pinIcon: '#000000' },
    azul:       { url: 'ocean',         pinBg: '#0a192f', pinBorder: '#64ffda', pinIcon: '#64ffda' },
    vintage:    { url: 'toner-v2',      pinBg: '#f4ecd8', pinBorder: '#5c4033', pinIcon: '#5c4033' },
    oscuro:     { url: 'basic-dark',    pinBg: '#333333', pinBorder: '#ffffff', pinIcon: '#ffffff' },
    satelite:   { url: 'satellite',     pinBg: '#ffffff', pinBorder: '#ff0000', pinIcon: '#ff0000' },
    relieve:    { url: 'outdoor-v2',    pinBg: '#e8f5e9', pinBorder: '#2e7d32', pinIcon: '#2e7d32' },
    acuarela:   { url: 'winter-v2',     pinBg: '#e1f5fe', pinBorder: '#4fc3f7', pinIcon: '#0277bd' },
    bosque:     { url: 'topo-v2',       pinBg: '#e8f5e9', pinBorder: '#4caf50', pinIcon: '#1b5e20' },
    minimalista:{ url: 'basic-v2',      pinBg: '#ffffff', pinBorder: '#000000', pinIcon: '#000000' },
    nocturno:   { url: 'dataviz-dark',  pinBg: '#1a1a2e', pinBorder: '#e94560', pinIcon: '#e94560' },
    
    // 🛑 CORREGIDOS 🛑
    // 'neon' no existe como tal, usamos 'backdrop' con pines brillantes
    neon:       { url: 'backdrop',      pinBg: '#ff00ff', pinBorder: '#00ffff', pinIcon: '#ffffff' }, 
    // 'desierto' se llama 'landscape'
    desierto:   { url: 'landscape',     pinBg: '#fff3e0', pinBorder: '#ff9800', pinIcon: '#e65100' },
    // 'atardecer' no existe, usamos 'winter' pero con pines cálidos
    atardecer:  { url: 'winter-v2',     pinBg: '#fce4ec', pinBorder: '#e91e63', pinIcon: '#880e4f' }
  };

  btnExportar.onclick = () => {
    listaContainer.innerHTML = todosLosRecuerdos.map(r => `
      <div class="exportar-item">
        <input type="checkbox" id="check-${r.id}" value="${r.id}" checked>
        <label for="check-${r.id}">${r.titulo}</label>
      </div>
    `).join('');
    
    modal.classList.add('activo');
    iniciarEscuchaCambios();
    actualizarVistaPrevia();
  };

  document.querySelectorAll('.tema-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tema-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      actualizarVistaPrevia();
    };
  });

  function iniciarEscuchaCambios() {
    if (intervaloPrevia) clearInterval(intervaloPrevia);
    intervaloPrevia = setInterval(() => {
      if (!modal.classList.contains('activo')) return;
      const seleccionados = Array.from(listaContainer.querySelectorAll('input:checked')).map(c => c.value).sort().join(',');
      const temaActivo = document.querySelector('.tema-btn.activo')?.dataset.tema || 'clasico';
      const estadoActual = `${seleccionados}_${temaActivo}`;

      if (estadoActual !== ultimoEstado) {
        ultimoEstado = estadoActual;
        actualizarVistaPrevia();
      }
    }, 100);
  }

  async function actualizarVistaPrevia() {
    const seleccionados = Array.from(listaContainer.querySelectorAll('input:checked')).map(c => c.value);
    const recuerdosFiltrados = todosLosRecuerdos.filter(r => seleccionados.includes(r.id));
    
    if (recuerdosFiltrados.length === 0) {
      previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999">Selecciona al menos un recuerdo</text></svg>';
      return;
    }

    const temaActivo = document.querySelector('.tema-btn.activo')?.dataset.tema || 'clasico';
    const configTema = ESTILOS_MAPA[temaActivo] || ESTILOS_MAPA.clasico;

    if (tempMapPrevio) { tempMapPrevio.remove(); tempMapPrevio = null; }
    if (tempDivPrevio) { tempDivPrevio.remove(); tempDivPrevio = null; }

    tempDivPrevio = document.createElement('div');
    tempDivPrevio.style.position = 'absolute'; tempDivPrevio.style.width = '800px'; tempDivPrevio.style.height = '500px';
    tempDivPrevio.style.left = '-9999px'; tempDivPrevio.style.border = '10px solid #fff'; tempDivPrevio.style.borderRadius = '15px'; tempDivPrevio.style.overflow = 'hidden';
    
    document.body.appendChild(tempDivPrevio);

    tempMapPrevio = L.map(tempDivPrevio, { zoomControl: false, attributionControl: false, fadeAnimation: false });

    // 🛑 Inyectamos un estilo para forzar que los pines del preview usen los colores del tema
    const styleId = `pin-style-${temaActivo}`;
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = `
        .pin-custom.tema-${temaActivo} { border-color: ${configTema.pinBorder} !important; background-color: ${configTema.pinBg} !important; }
        .pin-custom.tema-${temaActivo} svg { fill: ${configTema.pinIcon} !important; }
      `;
      document.head.appendChild(styleEl);
    }

    const urlTiles = `https://api.maptiler.com/maps/${configTema.url}/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}&no-labels`;
    
    L.tileLayer(urlTiles, { maxZoom: 19 }).addTo(tempMapPrevio);

    const bounds = L.latLngBounds(recuerdosFiltrados.map(r => [r.latitud, r.longitud]));
    
    recuerdosFiltrados.forEach(rec => {
      const tipoBase = TIPOS[rec.tipo] || TIPOS.cita;
      
      let iconoHTML;
      const imgMiniatura = rec.miniatura_url || rec.imagen_url; 
      
      if (imgMiniatura) {
        iconoHTML = `<div class="pin-custom tema-${temaActivo}"><img src="${imgMiniatura}" alt=""></div>`;
      } else {
        iconoHTML = `<div class="pin-custom tema-${temaActivo}"><svg viewBox="0 0 24 24">${tipoBase.icon}</svg></div>`;
      }

      const iconoCustom = L.divIcon({ className: 'pin-wrapper', html: iconoHTML, iconSize: [45, 45], iconAnchor: [22, 45] });
      L.marker([rec.latitud, rec.longitud], { icon: iconoCustom }).addTo(tempMapPrevio);
    });

    tempMapPrevio.fitBounds(bounds.pad(0.3));

    await new Promise(resolve => tempMapPrevio.whenReady(() => setTimeout(resolve, 1000)));

    try {
      const canvas = await html2canvas(tempDivPrevio, { useCORS: true, scale: 1, backgroundColor: '#ffffff' });
      previewImg.src = canvas.toDataURL('image/png');
    } catch (e) { console.error("Error en previa: ", e); }
  }

  btnDescargar.onclick = async () => {
    const seleccionados = Array.from(listaContainer.querySelectorAll('input:checked')).map(c => c.value);
    const recuerdosFiltrados = todosLosRecuerdos.filter(r => seleccionados.includes(r.id));
    
    if (recuerdosFiltrados.length === 0) return alert("Selecciona al menos un recuerdo.");

    const temaActivo = document.querySelector('.tema-btn.activo')?.dataset.tema || 'clasico';
    const configTema = ESTILOS_MAPA[temaActivo] || ESTILOS_MAPA.clasico;

    btnDescargar.textContent = "Generando...";
    btnDescargar.disabled = true;

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute'; tempDiv.style.width = '1200px'; tempDiv.style.height = '800px';
    tempDiv.style.left = '-9999px'; tempDiv.style.border = '15px solid #fff'; tempDiv.style.borderRadius = '20px'; tempDiv.style.boxShadow = '0 0 40px rgba(0,0,0,0.2)'; tempDiv.style.overflow = 'hidden';
    
    document.body.appendChild(tempDiv);

    const tempMap = L.map(tempDiv, { zoomControl: false, attributionControl: false, fadeAnimation: false });
    
    const urlTiles = `https://api.maptiler.com/maps/${configTema.url}/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}&no-labels`;
    L.tileLayer(urlTiles, { maxZoom: 19 }).addTo(tempMap);

    const bounds = L.latLngBounds(recuerdosFiltrados.map(r => [r.latitud, r.longitud]));
    
    recuerdosFiltrados.forEach(rec => {
      const tipoBase = TIPOS[rec.tipo] || TIPOS.cita;
      let iconoHTML;
      const imgMiniatura = rec.miniatura_url || rec.imagen_url; 
      
      if (imgMiniatura) {
        iconoHTML = `<div class="pin-custom tema-${temaActivo}"><img src="${imgMiniatura}" alt=""></div>`;
      } else {
        iconoHTML = `<div class="pin-custom tema-${temaActivo}"><svg viewBox="0 0 24 24">${tipoBase.icon}</svg></div>`;
      }

      const iconoCustom = L.divIcon({ className: 'pin-wrapper', html: iconoHTML, iconSize: [45, 45], iconAnchor: [22, 45] });
      L.marker([rec.latitud, rec.longitud], { icon: iconoCustom }).addTo(tempMap);
    });

    tempMap.fitBounds(bounds.pad(0.3));
    await new Promise(resolve => tempMap.whenReady(() => setTimeout(resolve, 2500)));

    try {
      const canvas = await html2canvas(tempDiv, { useCORS: true, scale: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = 'nuestro-mapa-recuerdos.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      modal.classList.remove('activo');
    } catch (e) { alert("Error al generar imagen: " + e.message); } finally { 
      tempMap.remove(); tempDiv.remove(); 
      btnDescargar.textContent = "Descargar Imagen"; btnDescargar.disabled = false;
    }
  };
}