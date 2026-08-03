const { put, list } = require('@vercel/blob');

const ITEMS_PATH = 'puente/items.json';

async function loadItems() {
  try {
    const { blobs } = await list({ prefix: ITEMS_PATH });
    const found = blobs.find((b) => b.pathname === ITEMS_PATH);
    if (!found) return [];
    const res = await fetch(found.url);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function saveItems(items) {
  await put(ITEMS_PATH, JSON.stringify(items), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const items = await loadItems();
    items.sort((a, b) => b.ts - a.ts);
    return res.status(200).json({ items });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'JSON inválido' }); }
    }
    const { type, content, name } = body || {};
    if (!type) return res.status(400).json({ error: 'Falta el tipo' });

    const items = await loadItems();
    const id = require('crypto').randomBytes(8).toString('hex');
    const item = { id, ts: Date.now(), type };

    if (type === 'text') {
      if (!content || !content.trim()) return res.status(400).json({ error: 'Texto vacío' });
      item.content = content;
    } else if (type === 'image' || type === 'file') {
      const match = /^data:(.+);base64,(.+)$/.exec(content || '');
      if (!match) return res.status(400).json({ error: 'Archivo inválido' });
      const buffer = Buffer.from(match[2], 'base64');
      const ext = (name && name.includes('.')) ? name.split('.').pop() : (match[1].split('/')[1] || 'bin');
      const blob = await put(`puente/uploads/${id}.${ext}`, buffer, {
        access: 'public',
        contentType: match[1],
      });
      item.url = blob.url;
      item.name = name || `${id}.${ext}`;
    } else {
      return res.status(400).json({ error: 'Tipo desconocido' });
    }

    items.push(item);
    await saveItems(items);
    return res.status(200).json({ item });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Método no permitido' });
};
