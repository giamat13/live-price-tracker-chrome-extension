// מאזין להודעה מהפופאפ דרך החלון
window.addEventListener("message", (event) => {
  if (event.data.type === "START_ELEMENT_SELECTION") {
    enableSelectionMode();
  }
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
    const cleanUrl = window.location.origin + window.location.pathname;

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
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    document.removeEventListener('click', onClick, true);
    document.body.style.cursor = "default";
  };

  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('click', onClick, true); // true חשוב כדי לעצור לחיצות של האתר
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

// הרצת המעקב
chrome.storage.local.get(['trackers'], (data) => {
  const cleanUrl = window.location.origin + window.location.pathname;
  const tracker = data.trackers ? data.trackers[cleanUrl] : null;

  if (tracker && tracker.selector) {
    const target = document.querySelector(tracker.selector);
    if (target) {
      const observer = new MutationObserver(() => {
        const newValue = target.innerText.trim();
        if (newValue !== tracker.lastValue) {
          chrome.runtime.sendMessage({ type: "CHANGE_DETECTED", newValue });
          tracker.lastValue = newValue;
          chrome.storage.local.set({ trackers: data.trackers });
        }
      });
      observer.observe(target, { childList: true, characterData: true, subtree: true });
    }
  }
});