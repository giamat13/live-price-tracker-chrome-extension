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
    const initialColor = window.getComputedStyle(e.target).color;

    chrome.storage.local.get(['trackers'], (data) => {
      let trackers = data.trackers || {};
      trackers[cleanUrl] = { 
        selector: selector, 
        lastValue: e.target.innerText.trim(),
        lastColor: initialColor
      };
      chrome.storage.local.set({ trackers }, () => {
        alert("המעקב הופעל! התוסף יזהה שינויים אוטומטית בזמן אמת.");
        startObserving(selector, trackers[cleanUrl].lastValue, trackers[cleanUrl].lastColor, trackers);
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

function checkOnLoad(selector, lastValue, lastColor, trackers) {
  const cleanUrl = getCleanUrl(window.location.href);
  const target = document.querySelector(selector);
  if (!target) return;

  const currentValue = target.innerText.trim();
  const currentColor = window.getComputedStyle(target).color;
  
  if (currentValue && currentValue !== lastValue) {
    console.log(`Live Price Tracker [טעינה]: שינוי זוהה! "${lastValue}" -> "${currentValue}"`);
    chrome.runtime.sendMessage({ 
      type: "CHANGE_DETECTED", 
      oldValue: lastValue,
      newValue: currentValue 
    });
    trackers[cleanUrl].lastValue = currentValue;
    trackers[cleanUrl].lastColor = currentColor;
    chrome.storage.local.set({ trackers });
  } else if (currentColor !== lastColor) {
    console.log(`Live Price Tracker [טעינה]: שינוי צבע זוהה! "${lastColor}" -> "${currentColor}"`);
    chrome.runtime.sendMessage({ 
      type: "COLOR_CHANGE_DETECTED", 
      oldColor: lastColor,
      newColor: currentColor,
      value: currentValue
    });
    trackers[cleanUrl].lastColor = currentColor;
    chrome.storage.local.set({ trackers });
  }
  
  // בדיקת discount/sale בtitle (אם מופעל)
  chrome.storage.local.get(['discountAlerts'], (data) => {
    if (data.discountAlerts === true) {
      checkForDiscountInTitle();
    }
  });
}

function checkForDiscountInTitle() {
  const discountKeywords = ['save', 'discount', 'sale', 'deal', 'offer', 'promo', 'מבצע', 'הנחה', 'סייל', 'מחיר מיוחד'];
  const title = document.title.toLowerCase();
  
  for (const keyword of discountKeywords) {
    if (title.includes(keyword.toLowerCase())) {
      console.log(`Live Price Tracker: מילת הנחה זוהתה בכותרת! "${keyword}"`);
      chrome.runtime.sendMessage({ 
        type: "DISCOUNT_DETECTED", 
        keyword: keyword,
        title: document.title
      });
      break;
    }
  }
}

function startObserving(selector, lastKnownValue, lastKnownColor, allTrackers) {
  let currentLastValue = lastKnownValue;
  let currentLastColor = lastKnownColor;
  const cleanUrl = getCleanUrl(window.location.href);

  const observer = new MutationObserver(() => {
    const target = document.querySelector(selector);
    if (!target) return;

    const newValue = target.innerText.trim();
    const newColor = window.getComputedStyle(target).color;
    
    if (newValue && newValue !== currentLastValue) {
      console.log(`Live Price Tracker [observer]: שינוי זוהה! "${currentLastValue}" -> "${newValue}"`);
      chrome.runtime.sendMessage({ 
        type: "CHANGE_DETECTED", 
        oldValue: currentLastValue,
        newValue: newValue 
      });
      currentLastValue = newValue;
      allTrackers[cleanUrl].lastValue = newValue;
      allTrackers[cleanUrl].lastColor = newColor;
      chrome.storage.local.set({ trackers: allTrackers });
    } else if (newColor !== currentLastColor) {
      console.log(`Live Price Tracker [observer]: שינוי צבע זוהה! "${currentLastColor}" -> "${newColor}"`);
      chrome.runtime.sendMessage({ 
        type: "COLOR_CHANGE_DETECTED", 
        oldColor: currentLastColor,
        newColor: newColor,
        value: newValue
      });
      currentLastColor = newColor;
      allTrackers[cleanUrl].lastColor = newColor;
      chrome.storage.local.set({ trackers: allTrackers });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style', 'class']
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

        // אתחול הצבע אם לא קיים
        if (!tracker.lastColor) {
          tracker.lastColor = window.getComputedStyle(target).color;
          trackers[cleanUrl].lastColor = tracker.lastColor;
          chrome.storage.local.set({ trackers });
        }

        // 1. בדיקה מיידית — השוואה לערך השמור
        checkOnLoad(tracker.selector, tracker.lastValue, tracker.lastColor, trackers);

        // 2. האזנה לשינויים בזמן אמת
        startObserving(tracker.selector, trackers[cleanUrl].lastValue, trackers[cleanUrl].lastColor, trackers);
      }
    }, 500);
  }
});