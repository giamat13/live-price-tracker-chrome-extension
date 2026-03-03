// פונקציית עזר לניקוי ה-URL כדי לשמור על עקביות בזיכרון
function getCleanUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch(e) { return url; }
}

// מאזין להודעות מהפופאפ להפעלת מצב בחירה
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ENABLE_SELECTION_MODE") {
    enableSelectionMode();
    sendResponse({ status: "ok" });
  }
  return true;
});

// פונקציה להפעלת מצב בחירת אלמנט ויזואלי על המסך
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
        alert("המעקב הופעל! הדף יתרענן אוטומטית בכל 2 דקות לבדיקת עדכונים.");
        location.reload();
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

// יצירת סלקטור ייחודי לאלמנט שנבחר
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

// לוגיקת המעקב: בדיקה בטעינה ורענון אוטומטי
chrome.storage.local.get(['trackers'], (data) => {
  const cleanUrl = getCleanUrl(window.location.href);
  const tracker = data.trackers ? data.trackers[cleanUrl] : null;

  if (tracker && tracker.selector) {
    // 1. בדיקה מיידית עם עליית הדף (מטפל במקרה של רענון)
    const checkExist = setInterval(() => {
      const target = document.querySelector(tracker.selector);
      if (target) {
        clearInterval(checkExist);
        const currentVal = target.innerText.trim();
        
        // אם המחיר הנוכחי שונה ממה ששמרנו פעם אחרונה
        if (currentVal !== tracker.lastValue) {
          chrome.runtime.sendMessage({ 
            type: "CHANGE_DETECTED", 
            newValue: currentVal 
          });
          
          // עדכון הערך החדש בזיכרון
          tracker.lastValue = currentVal;
          chrome.storage.local.set({ trackers: data.trackers });
        }

        // 2. תזמון רענון אוטומטי של הדף בעוד 2 דקות
        setTimeout(() => {
          console.log("מבצע רענון אוטומטי לבדיקת מחיר...");
          location.reload();
        }, 120000); // 120,000 מילישניות = 2 דקות
      }
    }, 1000);
  }
});