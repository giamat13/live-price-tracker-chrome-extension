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
    // ID ייחודי בכל התראה כדי שלא תחליף את הקודמת
    const notifId = "price_change_" + Date.now();
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      title: 'מחיר השתנה!',
      message: `הערך החדש הוא: ${message.newValue}`,
      priority: 2
    });
  }
});

async function checkAllTrackers() {
  const data = await chrome.storage.local.get(['trackers']);
  const trackers = data.trackers || {};
  console.log("מבצע בדיקה תקופתית...");
}