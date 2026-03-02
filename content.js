console.log("Tracker content script loaded");

function getCleanUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch(e) { return url; }
}

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
        alert("המעקב הופעל!");
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

function generateQuerySelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/)[0];
      if (cls) selector += "." + CSS.escape(cls);
    }
    let sib = el, nth = 1;
    while (sib = sib.previousElementSibling) { if (sib.nodeName === el.nodeName) nth++; }
    selector += `:nth-of-type(${nth})`;
    path.unshift(selector);
    el = el.parentNode;
    if (el.nodeName.toLowerCase() === 'body') break;
  }
  return path.join(" > ");
}

// לוגיקת מעקב ברקע
chrome.storage.local.get(['trackers'], (data) => {
  const cleanUrl = getCleanUrl(window.location.href);
  const tracker = data.trackers ? data.trackers[cleanUrl] : null;

  if (tracker && tracker.selector) {
    const checkInterval = setInterval(() => {
      const target = document.querySelector(tracker.selector);
      if (target) {
        clearInterval(checkInterval);
        
        // סינכרון ערך ראשוני
        const currentVal = target.innerText.trim();
        if (tracker.lastValue !== currentVal) {
          tracker.lastValue = currentVal;
          chrome.storage.local.set({ trackers: data.trackers });
        }

        const observer = new MutationObserver(() => {
          const newVal = target.innerText.trim();
          if (newVal !== tracker.lastValue) {
            chrome.runtime.sendMessage({ type: "CHANGE_DETECTED", newValue: newVal });
            tracker.lastValue = newVal;
            chrome.storage.local.set({ trackers: data.trackers });
          }
        });
        observer.observe(target, { childList: true, characterData: true, subtree: true });
      }
    }, 1000);
  }
});