const bannerEl = document.getElementById('banner');
const itemsEl = document.getElementById('items');
const countEl = document.getElementById('count');
const whoamiEl = document.getElementById('whoami');
const textIn = document.getElementById('textIn');

let myIp = null;
let otherIps = [];
let shareTargetId = null;

function showBanner(msg, type){
  bannerEl.textContent = msg;
  bannerEl.className = 'banner ' + type;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { bannerEl.className = 'banner'; }, 4500);
}

function fmtTime(ts){
  return new Date(ts).toLocaleString('es-PE', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
}

async function loadMe(){
  const res = await fetch('/api/me');
  const data = await res.json();
  myIp = data.ip;
  otherIps = data.others;
  whoamiEl.textContent = 'tu IP: ' + myIp;
}

async function loadItems(){
  try{
    const res = await fetch('/api/items');
    const data = await res.json();
    render(data.items);
  }catch(e){ /* red caída momentáneamente */ }
}

function render(list){
  countEl.textContent = list.length ? list.length : '';
  if(!list.length){
    itemsEl.innerHTML = '<div class="empty">Nada por aquí todavía.</div>';
    return;
  }
  itemsEl.innerHTML = list.map((it) => {
    let body = '';
    if(it.type === 'image'){
      body = `<img src="${it.url}" alt="imagen">`;
    } else if(it.type === 'file'){
      body = `<div class="txt">📎 ${it.name}</div>`;
    } else {
      body = `<div class="txt">${(it.content || '').replace(/</g,'&lt;')}</div>`;
    }
    const tag = it.isMine
      ? '<span class="tag mine">tuyo</span>'
      : `<span class="tag other">de ${it.ownerIp}</span>`;
    const dl = it.type !== 'text' ? `<button onclick="downloadItem('${it.url}','${(it.name||'archivo').replace(/'/g,'')}')">Descargar</button>` : `<button onclick="copyItem('${it.id}')">Copiar</button>`;
    const ownerActions = it.isMine
      ? `<button onclick="openShare('${it.id}')">Compartir</button><button onclick="removeItem('${it.id}')">Borrar</button>`
      : '';
    const sharedNote = it.isMine && it.sharedWith && it.sharedWith.length
      ? `<div class="shared-note">Compartido con: ${it.sharedWith.join(', ')}</div>` : '';
    return `<div class="item ${it.isMine ? '' : 'shared-in'}">
      <div class="meta">
        <div class="who">${tag}<span>${fmtTime(it.ts)}</span></div>
      </div>
      ${body}
      <div class="actions">${dl}${ownerActions}</div>
      ${sharedNote}
    </div>`;
  }).join('');
  window._itemsCache = list;
}

window.downloadItem = (url, name) => {
  const a = document.createElement('a');
  a.href = url; a.download = name;
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
window.openShare = (id) => {
  shareTargetId = id;
  const it = (window._itemsCache || []).find(i => i.id === id);
  const currentShared = new Set(it && it.sharedWith ? it.sharedWith : []);
  const ipListEl = document.getElementById('ipList');
  if(!otherIps.length){
    ipListEl.innerHTML = '<div class="none">Todavía no hay otras IP registradas. Pide que alguien más abra esta página primero.</div>';
  } else {
    ipListEl.innerHTML = otherIps.map(ip => `
      <label><input type="checkbox" value="${ip}" ${currentShared.has(ip) ? 'checked' : ''}> ${ip}</label>
    `).join('');
  }
  document.getElementById('shareBackdrop').classList.add('open');
};

document.getElementById('shareCancel').addEventListener('click', () => {
  document.getElementById('shareBackdrop').classList.remove('open');
});
document.getElementById('shareConfirm').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('#ipList input:checked')).map(i => i.value);
  await fetch('/api/items/' + shareTargetId + '/share', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ ips: checked })
  });
  document.getElementById('shareBackdrop').classList.remove('open');
  showBanner('Compartido.', 'ok');
  loadItems();
});

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

function compressImage(dataUrl, maxDim = 1600, quality = 0.82){
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
      dataUrl = await compressImage(dataUrl);
      type = 'image';
    }
    const res = await fetch('/api/items', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type, content: dataUrl, name: file.name })
    });
    if(res.ok){ showBanner('Guardado.', 'ok'); loadItems(); }
    else showBanner('No se pudo guardar (archivo muy grande?).', 'error');
  };
  reader.readAsDataURL(file);
}

document.getElementById('fileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(file) sendFile(file);
  e.target.value = '';
});

(async () => {
  await loadMe();
  await loadItems();
  setInterval(loadItems, 3000);
  setInterval(loadMe, 10000); // refresca lista de IPs conocidas
})();
