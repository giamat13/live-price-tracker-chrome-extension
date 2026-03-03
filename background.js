// הגדרת בדיקה כל 10 דקות (מתוקן)
if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.create("checkPrices", { periodInMinutes: 10 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkPrices") {
      checkAllTrackers();
    }
  });
}

// מאזין להתראות מהדף (מתוקן ללא אייקון חובה)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CHANGE_DETECTED") {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // אייקון שקוף זמני
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