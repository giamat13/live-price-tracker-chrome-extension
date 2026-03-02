function getCleanUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) { return url; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) return;

  const cleanUrl = getCleanUrl(tab.url);

  chrome.storage.local.get(['trackers'], (data) => {
    const trackers = data.trackers || {};
    if (trackers[cleanUrl]) {
      document.getElementById('deleteTrack').style.display = 'block';
      document.getElementById('statusText').innerText = "יש מעקב פעיל על דף זה";
    }
  });

  document.getElementById('startSelection').addEventListener('click', () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        // קריאה לפונקציה שנמצאת ב-content.js
        if (typeof enableSelectionMode === 'function') {
          enableSelectionMode();
        } else {
          alert("אנא רענן את הדף ונסה שוב.");
        }
      }
    });
    window.close();
  });

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