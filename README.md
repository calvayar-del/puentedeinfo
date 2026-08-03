# puente (versión Vercel, pública)

Cualquiera que entre al enlace puede ver todo lo que se ha enviado y
agregar lo suyo. No hay control de IP ni privacidad — es un tablero
compartido simple.

## Pasos para desplegar

1. Sube esta carpeta a un repo de GitHub (o usa `vercel` CLI directamente
   sin GitHub, con `vercel deploy` desde esta carpeta).
2. Importa el repo en https://vercel.com/new
3. **Paso obligatorio — activar Blob storage:**
   - Dentro del proyecto en Vercel, ve a la pestaña **Storage**.
   - Click en **Create Database** → elige **Blob**.
   - Conéctalo a este proyecto. Esto agrega automáticamente la variable
     de entorno `BLOB_READ_WRITE_TOKEN` que el código necesita.
   - Sin este paso, los textos e imágenes no se van a poder guardar
     (las funciones en `/api` fallarán).
4. Vuelve a desplegar (Vercel suele redeployar solo al conectar el
   storage; si no, dale a "Redeploy" manualmente).
5. Abre la URL que te da Vercel desde tu PC y tu celular. Todo lo que
   subas ahí aparece para cualquiera que abra ese mismo enlace.

## Límites a tener en cuenta

- Vercel tiene un límite duro de **~4.5MB por request** en sus
  funciones serverless (no es configurable). Las imágenes se comprimen
  automáticamente en el navegador antes de subirlas para no pasarse de
  ese límite; archivos de otro tipo muy pesados (videos grandes, etc.)
  no van a poder subirse.
- El plan gratuito de Vercel Blob tiene una cuota de almacenamiento
  mensual — para uso personal (capturas, textos) no deberías
  acercarte al límite, pero bórralos de vez en cuando con el botón "✕"
  si guardas muchas imágenes.
- Es completamente público: cualquiera con el enlace ve y puede subir
  contenido. No compartas la URL si no quieres eso.

## Estructura

```
index.html       -> página (servida como archivo estático en la raíz)
style.css        -> estilos
app.js           -> lógica del frontend
api/items.js     -> GET (listar) y POST (crear) — usa Vercel Blob
api/items/[id].js -> DELETE (borrar un elemento y su archivo)
package.json     -> dependencia @vercel/blob
```
