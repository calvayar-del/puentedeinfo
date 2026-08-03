const bannerEl = document.getElementById('banner');
const itemsEl = document.getElementById('items');
const countEl = document.getElementById('count');
const textIn = document.getElementById('textIn');

function showBanner(msg, type){
  bannerEl.textContent = msg;
  bannerEl.className = 'banner ' + type;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { bannerEl.className = 'banner'; }, 4500);
}

function fmtTime(ts){
  return new Date(ts).toLocaleString('es-PE', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
}

async function loadItems(){
  try{
    const res = await fetch('/api/items');
    const data = await res.json();
    render(data.items || []);
  }catch(e){ /* red caída momentáneamente, se reintenta solo */ }
}

function render(list){
  countEl.textContent = list.length ? list.length : '';
  if(!list.length){
    itemsEl.innerHTML = '<div class="empty">Nada por aquí todavía.</div>';
    return;
  }
  window._itemsCache = list;
  itemsEl.innerHTML = list.map((it) => {
    let body = '';
    if(it.type === 'image'){
      body = `<img src="${it.url}" alt="imagen">`;
    } else if(it.type === 'file'){
      body = `<div class="txt">📎 ${it.name}</div>`;
    } else {
      body = `<div class="txt">${(it.content || '').replace(/</g,'&lt;')}</div>`;
    }
    const dl = it.type !== 'text'
      ? `<button onclick="downloadItem('${it.url}','${(it.name||'archivo').replace(/'/g,'')}')">Descargar</button>`
      : `<button onclick="copyItem('${it.id}')">Copiar</button>`;
    return `<div class="item">
      <div class="meta"><span class="time">${fmtTime(it.ts)}</span><button class="kill" onclick="removeItem('${it.id}')">✕</button></div>
      ${body}
      <div class="actions">${dl}</div>
    </div>`;
  }).join('');
}

window.downloadItem = (url, name) => {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.target = '_blank';
  a.click();
};
window.copyItem = async (id) => {
  const it = (window._itemsCache || []).find(i => i.id === id);
  if(!it) return;
  try{ await navigator.clipboard.writeText(it.content); showBanner('Copiado.', 'ok'); }catch(e){}
};
window.removeItem = async (id) => {
  await fetch('/api/items/' + id, { method: 'DELETE' });
  loadItems();
};

document.getElementById('sendTextBtn').addEventListener('click', async () => {
  const val = textIn.value.trim();
  if(!val) return;
  const res = await fetch('/api/items', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ type:'text', content: val })
  });
  if(res.ok){ textIn.value = ''; loadItems(); }
  else showBanner('No se pudo enviar.', 'error');
});

document.getElementById('dropZone').addEventListener('paste', async (e) => {
  const items = e.clipboardData.items;
  for(const it of items){
    if(it.type.startsWith('image/')){
      e.preventDefault();
      const file = it.getAsFile();
      await sendFile(file);
      return;
    }
  }
});

function compressImage(dataUrl, maxDim = 1400, quality = 0.75){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if(width > maxDim || height > maxDim){
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale); height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function sendFile(file){
  const reader = new FileReader();
  reader.onload = async () => {
    let dataUrl = reader.result;
    let type = 'file';
    if(file.type.startsWith('image/')){
      showBanner('Procesando imagen…', 'ok');
      dataUrl = await compressImage(dataUrl);
      type = 'image';
    }
    // límite práctico de Vercel: ~4.5MB por request (el base64 pesa ~33% más que el archivo)
    if(dataUrl.length > 4 * 1024 * 1024){
      showBanner('El archivo es demasiado pesado (máx. ~3MB).', 'error');
      return;
    }
    const res = await fetch('/api/items', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type, content: dataUrl, name: file.name })
    });
    if(res.ok){ showBanner('Guardado.', 'ok'); loadItems(); }
    else showBanner('No se pudo guardar.', 'error');
  };
  reader.readAsDataURL(file);
}

document.getElementById('fileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(file) sendFile(file);
  e.target.value = '';
});

loadItems();
setInterval(loadItems, 3000);
