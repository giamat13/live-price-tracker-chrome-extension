chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CHANGE_DETECTED") {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'שינוי זוהה!',
      message: `הערך החדש הוא: ${message.newValue}`,
      priority: 2
    });
  }
});