========================================
  PÁGINA NOVIA - Proyecto Personal
========================================

💕 Un pequeño universo hecho con amor.

ESTRUCTURA:
- index.html                → Portada
- pages/                    → Secciones internas
- css/                      → Estilos
- js/                       → Lógica
- assets/images             → Tus fotos
- assets/music              → Tu canción
- assets/videos             → Tu video

PASOS PARA PERSONALIZAR:

1. FECHA DE INICIO
   Abre js/contador.js y edita la constante FECHA_INICIO
   con la fecha real en que comenzaron.

2. HISTORIA
   Edita pages/historia.html - reemplaza los textos
   entre las etiquetas <em>...</em> con tu historia real.

3. RECUERDOS
   Coloca tus fotos en assets/images/recuerdos/
   con nombres recuerdo1.jpg, recuerdo2.jpg, etc.
   Edita los títulos y descripciones en pages/recuerdos.html.

4. CARTAS
   Abre js/cartas.js y edita el array CARTAS con tus
   propias cartas. El sistema desbloquea 1 cada 48 horas.

5. RAZONES
   Abre js/razones.js y agrega todas las razones en el
   array RAZONES. Puedes poner hasta 1000.

6. JUEGO
   Abre js/juego.js y edita el array PREGUNTAS con
   tus propias preguntas. Cada pregunta tiene 4 opciones.

7. CUPONERA
   Abre js/cuponera.js y edita el array CUPONES
   con los premios que quieras ofrecer.

8. MÚSICA
   Coloca tu canción en assets/music/nuestra-cancion.mp3

9. VIDEO
   Coloca tu video en assets/videos/recuerdo.mp4

SISTEMA DE PUNTOS:
Los puntos del juego se guardan en localStorage y se
comparten con la cuponera del mismo navegador.

RESET (para pruebas):
Abre la consola del navegador (F12) y ejecuta:
  localStorage.clear()

Hecho con 💖