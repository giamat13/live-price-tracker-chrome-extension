function getCleanUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch(e) { return url; }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ENABLE_SELECTION_MODE") {
    enableSelectionMode();
    sendResponse({ status: "ok" });
  }
  return true;
});

function enableSelectionMode() {
  document.body.style.cursor = "crosshair";
  
  const onMouseOver = (e) => { 
    e.target.style.outline = "3px solid #4285f4";
    e.target.style.outlineOffset = "-3px";
  };
  const onMouseOut = (e) => { e.target.style.outline = ""; };

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const selector = generateQuerySelector(e.target);
    const cleanUrl = getCleanUrl(window.location.href);

    chrome.storage.local.get(['trackers'], (data) => {
      let trackers = data.trackers || {};
      trackers[cleanUrl] = { 
        selector: selector, 
        lastValue: e.target.innerText.trim() 
      };
      chrome.storage.local.set({ trackers }, () => {
        alert("המעקב הופעל! התוסף יזהה שינויים אוטומטית בזמן אמת.");
        startObserving(selector, trackers[cleanUrl].lastValue, trackers);
      });
    });
    cleanUp();
  };

  const cleanUp = () => {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.body.style.cursor = "default";
  };

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
}

function generateQuerySelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    let sib = el, nth = 1;
    while (sib = sib.previousElementSibling) { if (sib.nodeName === el.nodeName) nth++; }
    selector += `:nth-of-type(${nth})`;
    path.unshift(selector);
    el = el.parentNode;
    if (!el || el.nodeName.toLowerCase() === 'body') break;
  }
  return path.join(" > ");
}

function checkOnLoad(selector, lastValue, trackers) {
  const cleanUrl = getCleanUrl(window.location.href);
  const target = document.querySelector(selector);
  if (!target) return;

  const currentValue = target.innerText.trim();
  if (currentValue && currentValue !== lastValue) {
    console.log(`Live Price Tracker [טעינה]: שינוי זוהה! "${lastValue}" -> "${currentValue}"`);
    chrome.runtime.sendMessage({ 
      type: "CHANGE_DETECTED", 
      oldValue: lastValue,
      newValue: currentValue 
    });
    trackers[cleanUrl].lastValue = currentValue;
    chrome.storage.local.set({ trackers });
  }
}

function startObserving(selector, lastKnownValue, allTrackers) {
  let currentLastValue = lastKnownValue;
  const cleanUrl = getCleanUrl(window.location.href);

  const observer = new MutationObserver(() => {
    const target = document.querySelector(selector);
    if (!target) return;

    const newValue = target.innerText.trim();
    if (newValue && newValue !== currentLastValue) {
      console.log(`Live Price Tracker [observer]: שינוי זוהה! "${currentLastValue}" -> "${newValue}"`);
      chrome.runtime.sendMessage({ 
        type: "CHANGE_DETECTED", 
        oldValue: currentLastValue,
        newValue: newValue 
      });
      currentLastValue = newValue;
      allTrackers[cleanUrl].lastValue = newValue;
      chrome.storage.local.set({ trackers: allTrackers });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  console.log("Live Price Tracker: מעקב פעיל על ->", selector);
}

// בטעינת הדף: בדיקה מיידית + הפעלת observer
chrome.storage.local.get(['trackers'], (data) => {
  const cleanUrl = getCleanUrl(window.location.href);
  const trackers = data.trackers || {};
  const tracker = trackers[cleanUrl];

  if (tracker && tracker.selector) {
    const checkExist = setInterval(() => {
      const target = document.querySelector(tracker.selector);
      if (target) {
        clearInterval(checkExist);

        // 1. בדיקה מיידית — השוואה לערך השמור
        checkOnLoad(tracker.selector, tracker.lastValue, trackers);

        // 2. האזנה לשינויים בזמן אמת
        startObserving(tracker.selector, trackers[cleanUrl].lastValue, trackers);
      }
    }, 500);
  }
});