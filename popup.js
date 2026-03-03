document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) return;

  const cleanUrl = new URL(tab.url).origin + new URL(tab.url).pathname;

  // בדיקת מעקב קיים
  chrome.storage.local.get(['trackers'], (data) => {
    const trackers = data.trackers || {};
    if (trackers[cleanUrl]) {
      document.getElementById('deleteTrack').style.display = 'block';
      document.getElementById('statusText').innerText = "יש מעקב פעיל על דף זה";
    }
  });

  // כפתור בחירה
  document.getElementById('startSelection').addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: "ENABLE_SELECTION_MODE" }, (response) => {
      if (chrome.runtime.lastError) {
        alert("יש לרענן את הדף (F5) לפני הבחירה הראשונה.");
      }
      window.close();
    });
  });

  // כפתור מחיקה
  document.getElementById('deleteTrack').addEventListener('click', () => {
    chrome.storage.local.get(['trackers'], (data) => {
      let trackers = data.trackers || {};
      delete trackers[cleanUrl];
      chrome.storage.local.set({ trackers }, () => {
        chrome.tabs.reload(tab.id);
        window.close();
      });
    });
  });
});