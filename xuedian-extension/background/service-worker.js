const DEFAULT_API_BASE = 'http://47.99.56.179';

async function getApiBase() {
  try {
    const data = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
    return String(data.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  } catch {
    try {
      const data = await chrome.storage.local.get({ apiBase: DEFAULT_API_BASE });
      return String(data.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    } catch {
      return DEFAULT_API_BASE;
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const current = await chrome.storage.sync.get({ apiBase: '' });
    if (!current.apiBase) await chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
  } catch {
    await chrome.storage.local.set({ apiBase: DEFAULT_API_BASE });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'xuedian-api') return false;

  (async () => {
    const apiBase = await getApiBase();
    const path = String(message.path || '');
    const url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
    const init = {
      method: message.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
    if (message.body != null) init.body = JSON.stringify(message.body);

    try {
      const response = await fetch(url, init);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        sendResponse({
          ok: false,
          error: data.error || `请求失败 ${response.status}`,
          status: response.status,
          apiBase,
        });
        return;
      }
      sendResponse({ ok: true, data, apiBase });
    } catch (error) {
      sendResponse({
        ok: false,
        error: `${error.message || '网络错误'}。请确认后端已启动：${apiBase}`,
        apiBase,
      });
    }
  })();

  return true;
});
