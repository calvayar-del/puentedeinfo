const { put, list, del } = require('@vercel/blob');

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
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { id } = req.query;
  const items = await loadItems();
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });

  const [removed] = items.splice(idx, 1);
  if (removed.url) {
    try { await del(removed.url); } catch (e) { /* si ya no existe, seguimos igual */ }
  }
  await saveItems(items);
  return res.status(200).json({ ok: true });
};
