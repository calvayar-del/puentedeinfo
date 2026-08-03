# puente-server

Sistema simple para enviar texto y archivos entre tus dispositivos, con
control de visibilidad por IP. Sin dependencias externas (solo Node.js).

## Cómo correrlo

```bash
node server.js
```

Por defecto usa el puerto 3000. Para cambiarlo:

```bash
PORT=8080 node server.js
```

Abre `http://<IP-o-dominio-de-tu-servidor>:PUERTO` desde cualquier
dispositivo (PC, celular).

## Cómo funciona

- Cada dispositivo que entra queda identificado por su IP (no hay login).
- Lo que envías (texto o archivo) **solo lo ves tú** por defecto.
- Con el botón **Compartir** eliges qué otras IPs (de las que ya han
  visitado la página) pueden ver ese elemento en particular.
- Todo se guarda en `data/data.json` (metadatos) y los archivos/imágenes
  en la carpeta `uploads/`.

## Si lo pones detrás de Nginx / Cloudflare / un proxy

La detección de IP usa el header `X-Forwarded-For`. Asegúrate de que tu
proxy lo esté enviando. Ejemplo mínimo en Nginx:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
}
```

Si varios de tus dispositivos comparten la misma IP pública (por ejemplo,
todos conectados al mismo router de casa/oficina), el sistema los verá
como la misma "IP" y no podrás diferenciarlos entre sí — solo diferenciará
entre redes distintas (ej. tu casa vs. la red móvil del celular).

## Mantenerlo corriendo (opcional)

Para que seguirlo corriendo tras cerrar la terminal, usa `pm2` o similar:

```bash
npm install -g pm2
pm2 start server.js --name puente
```

## Estructura

```
server.js       -> servidor HTTP (rutas API + estáticos)
public/         -> frontend (HTML/CSS/JS)
data/data.json  -> usuarios (IPs) e items guardados
uploads/        -> archivos/imágenes subidos
```
