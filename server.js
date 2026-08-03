// puente-server: sistema simple de texto/archivos compartido por IP
// Sin dependencias externas: solo módulos nativos de Node (http, fs, crypto, path).
// Uso: node server.js   (por defecto en el puerto 3000, o el que indique process.env.PORT)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'data.json');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15MB por request

// ---------- almacenamiento (data.json) ----------
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: {}, items: [] };
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- utilidades ----------
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  let ip = fwd ? fwd.split(',')[0].trim() : req.socket.remoteAddress;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip || 'desconocida';
}

function registerVisitor(data, ip) {
  if (!data.users[ip]) {
    data.users[ip] = { firstSeen: Date.now(), label: null };
  }
  data.users[ip].lastSeen = Date.now();
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res, baseDir, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(baseDir, safePath);
  if (!filePath.startsWith(baseDir)) { res.writeHead(403); res.end('Prohibido'); return; }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('No encontrado'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// item visible para 'viewerIp' si es el dueño o si está en sharedWith
function visibleTo(item, viewerIp) {
  return item.ownerIp === viewerIp || (item.sharedWith || []).includes(viewerIp);
}

function publicItem(item, viewerIp) {
  return {
    id: item.id,
    type: item.type,
    content: item.type === 'text' ? item.content : undefined,
    url: item.type !== 'text' ? ('/uploads/' + item.filename) : undefined,
    name: item.name || null,
    ts: item.ts,
    ownerIp: item.ownerIp,
    isMine: item.ownerIp === viewerIp,
    sharedWith: item.ownerIp === viewerIp ? (item.sharedWith || []) : undefined,
  };
}

// ---------- servidor ----------
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const ip = getClientIp(req);

  // --- API ---
  if (pathname === '/api/me' && req.method === 'GET') {
    const data = loadData();
    registerVisitor(data, ip);
    saveData(data);
    const others = Object.keys(data.users).filter((u) => u !== ip);
    return sendJson(res, 200, { ip, others });
  }

  if (pathname === '/api/items' && req.method === 'GET') {
    const data = loadData();
    const items = data.items
      .filter((it) => visibleTo(it, ip))
      .sort((a, b) => b.ts - a.ts)
      .map((it) => publicItem(it, ip));
    return sendJson(res, 200, { items });
  }

  if (pathname === '/api/items' && req.method === 'POST') {
    let body = [];
    let total = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES && !rejected) {
        rejected = true;
        sendJson(res, 413, { error: 'El contenido es demasiado grande (máx 15MB).' });
        req.destroy();
      }
      body.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      let parsedBody;
      try { parsedBody = JSON.parse(Buffer.concat(body).toString('utf8')); }
      catch (e) { return sendJson(res, 400, { error: 'JSON inválido' }); }

      const { type, content, name } = parsedBody;
      const data = loadData();
      registerVisitor(data, ip);

      const item = {
        id: crypto.randomBytes(8).toString('hex'),
        ownerIp: ip,
        ts: Date.now(),
        sharedWith: [],
        type,
      };

      if (type === 'text') {
        if (!content || !content.trim()) return sendJson(res, 400, { error: 'Texto vacío' });
        item.content = content;
      } else if (type === 'image' || type === 'file') {
        // content llega como data URL: data:<mime>;base64,<datos>
        const match = /^data:(.+);base64,(.+)$/.exec(content || '');
        if (!match) return sendJson(res, 400, { error: 'Archivo inválido' });
        const mime = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        const extFromName = name ? path.extname(name) : '';
        const ext = extFromName || ('.' + (mime.split('/')[1] || 'bin'));
        const filename = item.id + ext;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
        item.filename = filename;
        item.name = name || filename;
      } else {
        return sendJson(res, 400, { error: 'Tipo desconocido' });
      }

      data.items.push(item);
      saveData(data);
      return sendJson(res, 200, { item: publicItem(item, ip) });
    });
    return;
  }

  const shareMatch = /^\/api\/items\/([a-f0-9]+)\/share$/.exec(pathname);
  if (shareMatch && req.method === 'POST') {
    let body = [];
    req.on('data', (c) => body.push(c));
    req.on('end', () => {
      let parsedBody;
      try { parsedBody = JSON.parse(Buffer.concat(body).toString('utf8')); }
      catch (e) { return sendJson(res, 400, { error: 'JSON inválido' }); }
      const data = loadData();
      const item = data.items.find((it) => it.id === shareMatch[1]);
      if (!item) return sendJson(res, 404, { error: 'No encontrado' });
      if (item.ownerIp !== ip) return sendJson(res, 403, { error: 'Solo el dueño puede compartir' });
      item.sharedWith = Array.isArray(parsedBody.ips) ? parsedBody.ips : [];
      saveData(data);
      return sendJson(res, 200, { item: publicItem(item, ip) });
    });
    return;
  }

  const deleteMatch = /^\/api\/items\/([a-f0-9]+)$/.exec(pathname);
  if (deleteMatch && req.method === 'DELETE') {
    const data = loadData();
    const idx = data.items.findIndex((it) => it.id === deleteMatch[1]);
    if (idx === -1) return sendJson(res, 404, { error: 'No encontrado' });
    if (data.items[idx].ownerIp !== ip) return sendJson(res, 403, { error: 'Solo el dueño puede borrar' });
    const [removed] = data.items.splice(idx, 1);
    if (removed.filename) {
      const fp = path.join(UPLOADS_DIR, removed.filename);
      fs.unlink(fp, () => {});
    }
    saveData(data);
    return sendJson(res, 200, { ok: true });
  }

  // --- estáticos ---
  if (pathname.startsWith('/uploads/')) {
    return serveStatic(req, res, UPLOADS_DIR, pathname.replace('/uploads/', ''));
  }
  if (pathname === '/' ) {
    return serveStatic(req, res, PUBLIC_DIR, '/index.html');
  }
  return serveStatic(req, res, PUBLIC_DIR, pathname);
});

// asegurar carpetas/archivos base
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) saveData({ users: {}, items: [] });

server.listen(PORT, () => {
  console.log('puente-server escuchando en http://localhost:' + PORT);
});
