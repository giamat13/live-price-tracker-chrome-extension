chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CHANGE_DETECTED") {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'מחיר השתנה!',
      message: `הערך החדש: ${message.newValue}`,
      priority: 2
    });
  }
}); 