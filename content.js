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
    
    const cleanUrl = getCleanUrl(window.location.href);
    let targetElement = e.target;
    
    // זיהוי אוטומטי: האם בחרו קונטיינר או אלמנט קטן?
    const isContainerMode = isContainerElement(targetElement);
    
    const selector = generateQuerySelector(targetElement);
    const initialColor = window.getComputedStyle(targetElement).color;
    const initialValue = targetElement.innerText.trim();

    chrome.storage.local.get(['trackers', 'priceHistory'], (data) => {
      let trackers = data.trackers || {};
      let priceHistory = data.priceHistory || {};
      
      trackers[cleanUrl] = { 
        selector: selector, 
        lastValue: initialValue,
        lastColor: initialColor,
        parentSelector: isContainerMode ? selector : generateParentSelector(targetElement),
        isContainerMode: isContainerMode
      };
      
      if (!priceHistory[cleanUrl]) {
        priceHistory[cleanUrl] = [];
      }
      priceHistory[cleanUrl].push({
        value: initialValue,
        timestamp: Date.now(),
        color: initialColor
      });
      
      chrome.storage.local.set({ trackers, priceHistory }, () => {
        const message = isContainerMode 
          ? "✅ קונטיינר נבחר!\n\n📦 התוסף יחפש מחירים בתוך כל האזור.\n💡 מצוין! זה מבטיח זיהוי מדויק של הנחות."
          : "✅ אלמנט נבחר!\n\n🎯 התוסף יעקוב אחרי האלמנט הזה.\n💡 טיפ: עדיף ללחוץ על קונטיינר שלם (div/section).";
        alert(message);
        startObserving(selector, trackers[cleanUrl].lastValue, trackers[cleanUrl].lastColor, trackers, priceHistory);
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

function generateParentSelector(el) {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    if (parent.id) return `#${CSS.escape(parent.id)}`;
    if (parent.className && typeof parent.className === 'string') {
      const classes = parent.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (classes) return `.${classes}`;
    }
    parent = parent.parentElement;
  }
  return 'body';
}

function isContainerElement(el) {
  // זיהוי אוטומטי: האם זה קונטיינר או אלמנט קטן?
  
  // 1. אם זה DIV/SECTION/ARTICLE עם class או id - סביר שזה קונטיינר
  if ((el.tagName === 'DIV' || el.tagName === 'SECTION' || el.tagName === 'ARTICLE') &&
      (el.id || (el.className && typeof el.className === 'string' && el.className.trim()))) {
    
    // 2. בדיקה: האם יש בתוכו יותר מאלמנט אחד? (אז זה קונטיינר)
    const childElements = el.querySelectorAll('*');
    if (childElements.length > 3) {
      return true; // יש לו הרבה ילדים - זה קונטיינר!
    }
  }
  
  // 3. אם זה SPAN/P/STRONG/EM - זה בטוח לא קונטיינר
  if (['SPAN', 'P', 'STRONG', 'EM', 'B', 'I', 'A', 'LABEL'].includes(el.tagName)) {
    return false;
  }
  
  return false; // ברירת מחדל: אלמנט רגיל
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

function findNearbyPrice(parentSelector, originalElement) {
  const parent = document.querySelector(parentSelector);
  if (!parent) return null;

  const pricePatterns = [
    /₪\s*[\d,]+\.?\d*/,
    /[\d,]+\.?\d*\s*₪/,
    /\$\s*[\d,]+\.?\d*/,
    /[\d,]+\.?\d*\s*\$/
  ];

  const allElements = parent.querySelectorAll('*');
  const possiblePrices = [];

  for (const el of allElements) {
    if (el === originalElement) continue;
    
    const text = el.innerText?.trim();
    if (!text) continue;

    const color = window.getComputedStyle(el).color;
    
    for (const pattern of pricePatterns) {
      if (pattern.test(text)) {
        possiblePrices.push({
          element: el,
          text: text,
          color: color,
          isHighlighted: color.includes('34') || color.includes('164') || color.includes('0, 128') || 
                         color.includes('255, 0') || color.includes('220, 0'),
          fontSize: parseFloat(window.getComputedStyle(el).fontSize)
        });
        break;
      }
    }
  }

  if (possiblePrices.length === 0) return null;

  possiblePrices.sort((a, b) => {
    if (a.isHighlighted !== b.isHighlighted) {
      return b.isHighlighted - a.isHighlighted;
    }
    return b.fontSize - a.fontSize;
  });

  return possiblePrices[0];
}

function saveToHistory(url, value, color) {
  chrome.storage.local.get(['priceHistory'], (data) => {
    let priceHistory = data.priceHistory || {};
    if (!priceHistory[url]) {
      priceHistory[url] = [];
    }
    
    priceHistory[url].push({
      value: value,
      timestamp: Date.now(),
      color: color
    });
    
    if (priceHistory[url].length > 100) {
      priceHistory[url] = priceHistory[url].slice(-100);
    }
    
    chrome.storage.local.set({ priceHistory }, () => {
      console.log(`Live Price Tracker: נשמר להיסטוריה - ${value}`);
    });
  });
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
    
    saveToHistory(cleanUrl, currentValue, currentColor);
  } else if (currentColor !== lastColor) {
    console.log(`Live Price Tracker [טעינה]: שינוי צבע זוהה! "${lastColor}" -> "${currentColor}"`);
    
    const tracker = trackers[cleanUrl];
    const nearbyPrice = findNearbyPrice(tracker.parentSelector, target);
    
    if (nearbyPrice) {
      console.log(`Live Price Tracker: נמצא מחיר חדש בסביבה! "${nearbyPrice.text}"`);
      chrome.runtime.sendMessage({ 
        type: "DISCOUNT_PRICE_DETECTED", 
        oldValue: currentValue,
        oldColor: lastColor,
        newValue: nearbyPrice.text,
        newColor: nearbyPrice.color
      });
      
      trackers[cleanUrl].lastValue = nearbyPrice.text;
      trackers[cleanUrl].lastColor = nearbyPrice.color;
      trackers[cleanUrl].selector = generateQuerySelector(nearbyPrice.element);
      chrome.storage.local.set({ trackers });
      
      saveToHistory(cleanUrl, nearbyPrice.text, nearbyPrice.color);
    } else {
      chrome.runtime.sendMessage({ 
        type: "COLOR_CHANGE_DETECTED", 
        oldColor: lastColor,
        newColor: currentColor,
        value: currentValue
      });
      trackers[cleanUrl].lastColor = currentColor;
      chrome.storage.local.set({ trackers });
      
      saveToHistory(cleanUrl, currentValue, currentColor);
    }
  }
  
  chrome.storage.local.get(['discountAlerts'], (data) => {
    if (data.discountAlerts === true) {
      checkForDiscountInTitle();
    }
  });
}

function checkForDiscountInTitle() {
  const discountKeywords = ['save', 'discount', 'sale', 'deal', 'offer', 'promo', 'מבצע', 'הנחה', 'סייל', 'מחיר מיוחד'];
  const title = document.title.toLowerCase();
  const cleanUrl = getCleanUrl(window.location.href);
  
  let foundKeyword = null;
  for (const keyword of discountKeywords) {
    if (title.includes(keyword.toLowerCase())) {
      foundKeyword = keyword;
      break;
    }
  }
  
  // בדיקת המצב הקודם
  chrome.storage.local.get(['discountStatus'], (data) => {
    const discountStatus = data.discountStatus || {};
    const previousStatus = discountStatus[cleanUrl];
    
    // אם נמצאה מילת הנחה עכשיו
    if (foundKeyword) {
      // שולח התראה רק אם זה חדש (לא היה קודם)
      if (!previousStatus || previousStatus.hasDiscount === false) {
        console.log(`Live Price Tracker: מילת הנחה זוהתה בכותרת! "${foundKeyword}"`);
        chrome.runtime.sendMessage({ 
          type: "DISCOUNT_DETECTED", 
          keyword: foundKeyword,
          title: document.title
        });
      }
      
      // עדכון המצב
      discountStatus[cleanUrl] = {
        hasDiscount: true,
        keyword: foundKeyword,
        lastChecked: Date.now()
      };
      chrome.storage.local.set({ discountStatus });
    } 
    // אם אין מילת הנחה עכשיו
    else {
      // שולח התראה רק אם היה קודם והוסר
      if (previousStatus && previousStatus.hasDiscount === true) {
        console.log(`Live Price Tracker: מילת הנחה הוסרה מהכותרת!`);
        chrome.runtime.sendMessage({ 
          type: "DISCOUNT_REMOVED", 
          keyword: previousStatus.keyword,
          title: document.title
        });
      }
      
      // עדכון המצב
      discountStatus[cleanUrl] = {
        hasDiscount: false,
        keyword: null,
        lastChecked: Date.now()
      };
      chrome.storage.local.set({ discountStatus });
    }
  });
}

function startObserving(selector, lastKnownValue, lastKnownColor, allTrackers, priceHistory) {
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
      
      saveToHistory(cleanUrl, newValue, newColor);
    } else if (newColor !== currentLastColor) {
      console.log(`Live Price Tracker [observer]: שינוי צבע זוהה! "${currentLastColor}" -> "${newColor}"`);
      
      const tracker = allTrackers[cleanUrl];
      const nearbyPrice = findNearbyPrice(tracker.parentSelector, target);
      
      if (nearbyPrice) {
        console.log(`Live Price Tracker: נמצא מחיר חדש בסביבה! "${nearbyPrice.text}"`);
        chrome.runtime.sendMessage({ 
          type: "DISCOUNT_PRICE_DETECTED", 
          oldValue: newValue,
          oldColor: currentLastColor,
          newValue: nearbyPrice.text,
          newColor: nearbyPrice.color
        });
        
        currentLastValue = nearbyPrice.text;
        currentLastColor = nearbyPrice.color;
        allTrackers[cleanUrl].lastValue = nearbyPrice.text;
        allTrackers[cleanUrl].lastColor = nearbyPrice.color;
        allTrackers[cleanUrl].selector = generateQuerySelector(nearbyPrice.element);
        chrome.storage.local.set({ trackers: allTrackers });
        
        saveToHistory(cleanUrl, nearbyPrice.text, nearbyPrice.color);
      } else {
        chrome.runtime.sendMessage({ 
          type: "COLOR_CHANGE_DETECTED", 
          oldColor: currentLastColor,
          newColor: newColor,
          value: newValue
        });
        currentLastColor = newColor;
        allTrackers[cleanUrl].lastColor = newColor;
        chrome.storage.local.set({ trackers: allTrackers });
        
        saveToHistory(cleanUrl, newValue, newColor);
      }
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

chrome.storage.local.get(['trackers', 'priceHistory'], (data) => {
  const cleanUrl = getCleanUrl(window.location.href);
  const trackers = data.trackers || {};
  const priceHistory = data.priceHistory || {};
  const tracker = trackers[cleanUrl];

  if (tracker && tracker.selector) {
    const checkExist = setInterval(() => {
      const target = document.querySelector(tracker.selector);
      if (target) {
        clearInterval(checkExist);

        if (!tracker.lastColor) {
          tracker.lastColor = window.getComputedStyle(target).color;
          trackers[cleanUrl].lastColor = tracker.lastColor;
        }
        
        if (!tracker.parentSelector) {
          tracker.parentSelector = generateParentSelector(target);
          trackers[cleanUrl].parentSelector = tracker.parentSelector;
          chrome.storage.local.set({ trackers });
        }

        checkOnLoad(tracker.selector, tracker.lastValue, tracker.lastColor, trackers);
        startObserving(tracker.selector, trackers[cleanUrl].lastValue, trackers[cleanUrl].lastColor, trackers, priceHistory);
      }
    }, 500);
  }
});