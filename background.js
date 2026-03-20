if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.create("checkPrices", { periodInMinutes: 10 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkPrices") {
      checkAllTrackers();
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CHANGE_DETECTED") {
    sendNotification(message.oldValue, message.newValue, "מחיר השתנה!");
  } else if (message.type === "COLOR_CHANGE_DETECTED") {
    sendColorChangeNotification(message.oldColor, message.newColor, message.value);
  } else if (message.type === "DISCOUNT_DETECTED") {
    sendDiscountNotification(message.keyword, message.title);
  }
});

function sendNotification(oldValue, newValue, title = "מחיר השתנה!") {
  const notifId = "price_change_" + Date.now();
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    title: title,
    message: `היה: ${oldValue}  ←  עכשיו: ${newValue}`,
    priority: 2
  });
}

function sendColorChangeNotification(oldColor, newColor, value) {
  const notifId = "color_change_" + Date.now();
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    title: 'צבע המחיר השתנה!',
    message: `מחיר: ${value}\nצבע: ${oldColor} → ${newColor}`,
    priority: 2
  });
}

function sendDiscountNotification(keyword, title) {
  const notifId = "discount_" + Date.now();
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    title: '🎉 מבצע/הנחה זוהתה!',
    message: `נמצא: "${keyword}"\nבדף: ${title}`,
    priority: 2
  });
}

async function tabExists(tabId) {
  try { await chrome.tabs.get(tabId); return true; } catch (_) { return false; }
}

async function safeCloseTab(tabId) {
  if (tabId === null) return;
  try { await chrome.tabs.remove(tabId); } catch (_) {}
}

async function checkAllTrackers() {
  const data = await chrome.storage.local.get(['trackers']);
  const trackers = data.trackers || {};
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  for (const [url, tracker] of Object.entries(trackers)) {
    if (!tracker.selector) continue;

    let tabId = null;
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;

      await waitForTabLoad(tabId);

      // בודק שהלשונית עדיין קיימת לפני executeScript
      if (!(await tabExists(tabId))) {
        console.warn("הלשונית נסגרה לפני הבדיקה:", url);
        tabId = null;
        continue;
      }

      let currentValue = null;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector) => {
            const el = document.querySelector(selector);
            return el ? el.innerText.trim() : null;
          },
          args: [tracker.selector]
        });
        currentValue = results?.[0]?.result;
      } catch (scriptErr) {
        console.warn("executeScript נכשל:", scriptErr.message);
      }

      if (currentValue && currentValue !== tracker.lastValue) {
        sendNotification(tracker.lastValue, currentValue);
        tracker.lastValue = currentValue;
        trackers[url] = tracker;
        await chrome.storage.local.set({ trackers });
      }

    } catch (err) {
      console.error("שגיאה בבדיקת", url, err.message);
    }

    await safeCloseTab(tabId);
    tabId = null;
  }

  if (activeTab) {
    try { await chrome.tabs.update(activeTab.id, { active: true }); } catch (_) {}
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 2000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}