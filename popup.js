document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) {
    document.getElementById('statusText').innerText = "לא ניתן להפעיל בדף זה";
    return;
  }

  const cleanUrl = new URL(tab.url).origin + new URL(tab.url).pathname;

  // בדיקת מעקב קיים
  chrome.storage.local.get(['trackers'], (data) => {
    const trackers = data.trackers || {};
    if (trackers[cleanUrl]) {
      document.getElementById('deleteTrack').style.display = 'block';
      document.getElementById('statusText').innerText = "יש מעקב פעיל בדף זה";
    }
  });

  // כפתור בחירה
  document.getElementById('startSelection').addEventListener('click', () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        window.postMessage({ type: "START_ELEMENT_SELECTION" }, "*");
      }
    });
    window.close();
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