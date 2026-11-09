// js/storage.js
import { supabase } from './supabase.js';
import { comprimirImagen } from './utils.js';

export async function subirArchivo(archivo, carpeta = 'general') {
  try {
    let archivoAComprimir = archivo;
    if (archivo.type && archivo.type.startsWith('image/')) {
      archivoAComprimir = await comprimirImagen(archivo);
    }

    const fileExt = archivoAComprimir.name.split('.').pop() || 'webp';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${carpeta}/${fileName}`;

    const { data, error } = await supabase.storage.from('media').upload(filePath, archivoAComprimir);
    if (error) throw error;

    const { data: urlData, error: urlError } = await supabase.storage
      .from('media')
      .createSignedUrl(filePath, 315360000);
    if (urlError) throw urlError;

    return { url: urlData.signedUrl, path: filePath };
  } catch (error) {
    console.error("Error subiendo archivo:", error);
    throw error;
  }
}