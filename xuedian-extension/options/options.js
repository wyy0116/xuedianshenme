const input = document.getElementById('apiBase');
const statusEl = document.getElementById('status');
const DEFAULT_API_BASE = 'http://47.99.56.179';

async function load() {
  const data = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  input.value = data.apiBase || DEFAULT_API_BASE;
}

async function save(value) {
  const apiBase = String(value || input.value || DEFAULT_API_BASE).trim().replace(/\/$/, '');
  await chrome.storage.sync.set({ apiBase });
  input.value = apiBase;
  statusEl.textContent = `已保存：${apiBase}`;
}

document.getElementById('save').addEventListener('click', () => save());
document.querySelectorAll('[data-base]').forEach((btn) => {
  btn.addEventListener('click', () => save(btn.dataset.base));
});

load();
