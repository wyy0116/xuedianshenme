const DEFAULT_API_BASE = 'http://47.99.56.179';

document.getElementById('open').addEventListener('click', async () => {
  let apiBase = DEFAULT_API_BASE;
  try {
    const data = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
    apiBase = String(data.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  } catch {
    // keep default
  }
  chrome.tabs.create({ url: `${apiBase}/` });
});
