// js/utils.js
import imageCompression from 'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.mjs';

// 🛑 1. MANEJO DE ERRORES GLOBAL
window.addEventListener('error', function(event) {
  console.error("Error global capturado:", event.error);
});

window.addEventListener('unhandledrejection', function(event) {
  console.error("Promesa rechazada no manejada:", event.reason);
});

// 🛑 2. COMPRESIÓN DE IMÁGENES MEJORADA
export async function comprimirImagen(file, opciones = {}) {
  // Si no es imagen, devolverlo tal cual
  if (!file.type.startsWith('image/')) return file;
  
  // Si es un GIF, no comprimir (pierde animación)
  if (file.type === 'image/gif') return file;
  
  // Si es SVG, no comprimir
  if (file.type === 'image/svg+xml') return file;

  // Detectar el tamaño original
  const tamañoOriginal = file.size / 1024 / 1024; // MB
  console.log(`🖼️ Imagen original: ${tamañoOriginal.toFixed(2)} MB`);

  // Configuración adaptativa según el tamaño
  let maxSizeMB = opciones.maxSizeMB || 0.8; // 800KB por defecto
  let maxWidthOrHeight = opciones.maxWidthOrHeight || 1920;

  // Si la imagen es muy grande, comprimir más agresivamente
  if (tamañoOriginal > 5) {
    maxSizeMB = 0.5;
    maxWidthOrHeight = 1600;
  } else if (tamañoOriginal > 2) {
    maxSizeMB = 0.6;
    maxWidthOrHeight = 1920;
  }

  const options = {
    maxSizeMB,
    maxWidthOrHeight,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.85,
    onProgress: (progress) => {
      if (opciones.onProgress) opciones.onProgress(progress);
    }
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    const tamañoComprimido = compressedBlob.size / 1024 / 1024;
    console.log(`✅ Imagen comprimida: ${tamañoComprimido.toFixed(2)} MB (${((1 - tamañoComprimido/tamañoOriginal) * 100).toFixed(0)}% reducción)`);
    
    // Devolver como un nuevo File
    return new File([compressedBlob], file.name.replace(/\.[^/.]+$/, ".webp"), {
      type: 'image/webp',
      lastModified: Date.now()
    });
  } catch (error) {
    console.warn("Error comprimiendo imagen, usando original:", error);
    return file;
  }
}

// 🛑 3. COMPRESIÓN DE AUDIO (opcional)
export async function comprimirAudio(file) {
  if (!file.type.startsWith('audio/')) return file;
  // Los audios ya se graban en webm comprimido, no se pueden comprimir más sin librerías pesadas
  return file;
}

// 🛑 4. VALIDACIÓN DE TIPOS DE ARCHIVO
export function validarArchivo(file, tiposPermitidos, tamañoMaxMB = 10) {
  if (!file) return { valido: false, error: "No hay archivo" };
  
  const tamañoMB = file.size / 1024 / 1024;
  if (tamañoMB > tamañoMaxMB) {
    return { valido: false, error: `El archivo es demasiado grande (${tamañoMB.toFixed(1)} MB). Máximo ${tamañoMaxMB} MB.` };
  }
  
  if (tiposPermitidos && !tiposPermitidos.some(tipo => file.type.startsWith(tipo))) {
    return { valido: false, error: `Tipo de archivo no permitido. Usa: ${tiposPermitidos.join(', ')}` };
  }
  
  return { valido: true };
}