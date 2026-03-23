// ========================
// Popup JS - Live Price Tracker
// ========================

let chartInstance = null;

const LINE_COLORS = [
  '#4285f4', '#ea4335', '#34a853', '#fbbc04',
  '#9c27b0', '#ff6d00', '#00bcd4', '#795548'
];

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function getCleanUrl(url) {
  try { const u = new URL(url); return u.origin + u.pathname; }
  catch { return url; }
}

// ========================
// אתחול
// ========================
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) return;

  const cleanUrl = getCleanUrl(tab.url);

  // טעינת שערי מטבע ברקע
  ensureRates().catch(() => {});

  // toggle הנחות
  chrome.storage.local.get(['discountAlerts'], (data) => {
    document.getElementById('discountToggle').checked = data.discountAlerts === true;
  });
  document.getElementById('discountToggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ discountAlerts: e.target.checked });
  });

  // בדיקת מעקב קיים
  chrome.storage.local.get(['trackers', 'priceHistory', 'productGroups'], (data) => {
    const trackers = data.trackers || {};
    const history = data.priceHistory || {};

    if (trackers[cleanUrl]) {
      document.getElementById('deleteTrack').style.display = 'block';
      document.getElementById('viewHistory').style.display = 'block';
      document.getElementById('manageGroups').style.display = 'block';

      const count = (history[cleanUrl] || []).length;
      const groupName = getUrlGroup(cleanUrl, data.productGroups || {});
      let status = `מעקב פעיל | ${count} רשומות`;
      if (groupName) status += ` | 📦 ${groupName}`;
      document.getElementById('statusText').innerText = status;
    }
  });

  // ── כפתורים ──

  document.getElementById('startSelection').addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: "ENABLE_SELECTION_MODE" }, () => {
      if (chrome.runtime.lastError) alert("יש לרענן את הדף (F5) לפני הבחירה הראשונה.");
      window.close();
    });
  });

  document.getElementById('deleteTrack').addEventListener('click', () => {
    chrome.storage.local.get(['trackers', 'priceHistory', 'productGroups'], (data) => {
      let trackers = data.trackers || {};
      let history = data.priceHistory || {};
      let groups = data.productGroups || {};

      delete trackers[cleanUrl];
      delete history[cleanUrl];

      for (const name in groups) {
        groups[name] = groups[name].filter(u => u !== cleanUrl);
        if (groups[name].length === 0) delete groups[name];
      }

      chrome.storage.local.set({ trackers, priceHistory: history, productGroups: groups }, () => {
        chrome.tabs.reload(tab.id);
        window.close();
      });
    });
  });

  document.getElementById('viewHistory').addEventListener('click', () => {
    const chartContainer = document.getElementById('chartContainer');
    const aiContainer = document.getElementById('aiAnalysisContainer');

    if (chartContainer.classList.contains('active')) {
      chartContainer.classList.remove('active');
      aiContainer.classList.remove('active');
      document.getElementById('viewHistory').innerText = '📊 הצג היסטורית מחיר';
    } else {
      chartContainer.classList.add('active');
      document.getElementById('viewHistory').innerText = '📊 הסתר גרף';

      chrome.storage.local.get(['priceHistory', 'productGroups'], (data) => {
        const groups = data.productGroups || {};
        const groupName = getUrlGroup(cleanUrl, groups);

        if (groupName) {
          loadGroupChart(groupName, groups[groupName], data.priceHistory || {});
        } else {
          loadPriceHistory(cleanUrl);
          loadAIAnalysis(cleanUrl);
        }
      });
    }
  });

  document.getElementById('manageGroups').addEventListener('click', () => {
    const panel = document.getElementById('groupPanel');
    if (panel.classList.contains('active')) {
      panel.classList.remove('active');
    } else {
      panel.classList.add('active');
      renderGroupPanel(cleanUrl);
    }
  });

  document.getElementById('aiSettings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'ai-settings.html' });
  });

  document.getElementById('refreshAI').addEventListener('click', () => {
    loadAIAnalysis(cleanUrl);
  });

  document.getElementById('clearHistory').addEventListener('click', () => {
    if (confirm('האם למחוק את כל ההיסטוריה של דף זה?')) {
      chrome.storage.local.get(['priceHistory'], (data) => {
        let history = data.priceHistory || {};
        delete history[cleanUrl];
        chrome.storage.local.set({ priceHistory: history }, () => {
          alert('ההיסטוריה נמחקה');
          document.getElementById('chartContainer').classList.remove('active');
          document.getElementById('viewHistory').innerText = '📊 הצג היסטורית מחיר';
        });
      });
    }
  });

  // יצירת קבוצה חדשה
  document.getElementById('createGroupBtn').addEventListener('click', () => {
    const name = document.getElementById('newGroupInput').value.trim();
    if (!name) { alert('הכנס שם למוצר'); return; }

    chrome.storage.local.get(['productGroups'], (data) => {
      const groups = data.productGroups || {};
      if (!groups[name]) groups[name] = [];
      if (!groups[name].includes(cleanUrl)) groups[name].push(cleanUrl);

      chrome.storage.local.set({ productGroups: groups }, () => {
        document.getElementById('newGroupInput').value = '';
        renderGroupPanel(cleanUrl);
        const s = document.getElementById('statusText').innerText;
        document.getElementById('statusText').innerText =
          s.split(' | 📦')[0] + ` | 📦 ${name}`;
      });
    });
  });
});

// ========================
// ניהול קבוצות
// ========================

function getUrlGroup(url, groups) {
  for (const name in groups) {
    if (groups[name].includes(url)) return name;
  }
  return null;
}

function renderGroupPanel(currentUrl) {
  chrome.storage.local.get(['productGroups'], (data) => {
    const groups = data.productGroups || {};
    const container = document.getElementById('existingGroups');
    container.innerHTML = '';

    const names = Object.keys(groups);
    if (names.length === 0) {
      container.innerHTML = '<div class="no-groups-msg">אין קבוצות עדיין — צור קבוצה חדשה למעלה</div>';
      return;
    }

    names.forEach((name, i) => {
      const urls = groups[name];
      const inThisGroup = urls.includes(currentUrl);
      const color = LINE_COLORS[i % LINE_COLORS.length];
      const domains = urls.map(getDomain).join(', ');

      const item = document.createElement('div');
      item.className = `group-item ${inThisGroup ? 'in-this-group' : ''}`;
      item.innerHTML = `
        <div class="group-left">
          <div class="group-dot" style="background:${color}"></div>
          <div class="group-info">
            <div class="group-name">${name} ${inThisGroup ? '✓' : ''}</div>
            <div class="group-urls">${urls.length} אתרים: ${domains}</div>
          </div>
        </div>
        <div class="group-actions">
          ${!inThisGroup
            ? `<button class="btn-sm btn-join" data-group="${name}">+ הוסף</button>`
            : `<button class="btn-sm btn-leave" data-group="${name}">הסר</button>`
          }
          <button class="btn-sm btn-view-group" data-group="${name}">📊</button>
          <button class="btn-sm btn-delete-group" data-group="${name}">🗑</button>
        </div>
      `;
      container.appendChild(item);
    });

    container.querySelectorAll('.btn-join').forEach(btn =>
      btn.addEventListener('click', () => addToGroup(btn.dataset.group, currentUrl)));
    container.querySelectorAll('.btn-leave').forEach(btn =>
      btn.addEventListener('click', () => removeFromGroup(btn.dataset.group, currentUrl)));
    container.querySelectorAll('.btn-view-group').forEach(btn =>
      btn.addEventListener('click', () => viewGroupChart(btn.dataset.group)));
    container.querySelectorAll('.btn-delete-group').forEach(btn =>
      btn.addEventListener('click', () => deleteGroup(btn.dataset.group, currentUrl)));
  });
}

function addToGroup(groupName, url) {
  chrome.storage.local.get(['productGroups'], (data) => {
    const groups = data.productGroups || {};
    if (!groups[groupName]) groups[groupName] = [];
    if (!groups[groupName].includes(url)) groups[groupName].push(url);
    chrome.storage.local.set({ productGroups: groups }, () => renderGroupPanel(url));
  });
}

function removeFromGroup(groupName, url) {
  chrome.storage.local.get(['productGroups'], (data) => {
    const groups = data.productGroups || {};
    groups[groupName] = (groups[groupName] || []).filter(u => u !== url);
    if (groups[groupName].length === 0) delete groups[groupName];
    chrome.storage.local.set({ productGroups: groups }, () => renderGroupPanel(url));
  });
}

function deleteGroup(groupName, currentUrl) {
  if (!confirm(`למחוק את הקבוצה "${groupName}"?`)) return;
  chrome.storage.local.get(['productGroups'], (data) => {
    const groups = data.productGroups || {};
    delete groups[groupName];
    chrome.storage.local.set({ productGroups: groups }, () => renderGroupPanel(currentUrl));
  });
}

function viewGroupChart(groupName) {
  chrome.storage.local.get(['productGroups', 'priceHistory'], (data) => {
    const groups = data.productGroups || {};
    const urls = groups[groupName] || [];
    if (urls.length === 0) { alert('אין URLs בקבוצה זו'); return; }
    document.getElementById('chartContainer').classList.add('active');
    document.getElementById('viewHistory').innerText = '📊 הסתר גרף';
    loadGroupChart(groupName, urls, data.priceHistory || {});
  });
}

// ========================
// גרף רב-קווי (קבוצה)
// ========================

async function loadGroupChart(groupName, urls, priceHistory) {
  await ensureRates();
  document.getElementById('chartTitle').textContent = `📦 ${groupName} — ${urls.length} אתרים`;

  const datasets = [];
  const statsHtml = [];
  let allTimestamps = new Set();

  urls.forEach(url => {
    (priceHistory[url] || []).forEach(e => allTimestamps.add(e.timestamp));
  });

  const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

  if (sortedTimestamps.length === 0) {
    document.getElementById('statsContainer').innerHTML =
      '<div style="text-align:center;color:#999">אין נתונים להצגה עדיין</div>';
    renderMultiChart([], []);
    return;
  }

  const labels = sortedTimestamps.map(ts => {
    const d = new Date(ts);
    return d.toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  });

  urls.forEach((url, i) => {
    const hist = priceHistory[url] || [];
    if (hist.length === 0) return;

    const color = LINE_COLORS[i % LINE_COLORS.length];
    const domain = getDomain(url);
    const priceMap = {};
    hist.forEach(e => { priceMap[e.timestamp] = parsePrice(e.value); });
    const dataPoints = sortedTimestamps.map(ts => priceMap[ts] ?? null);

    datasets.push({
      label: domain,
      data: dataPoints,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: color,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      spanGaps: true
    });

    const prices = hist.map(e => parsePrice(e.value)).filter(p => p !== null);
    if (prices.length > 0) {
      const current = prices[prices.length - 1];
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      statsHtml.push(`
        <div style="display:flex;align-items:center;gap:6px;margin:5px 0;padding:5px;background:#f9f9f9;border-radius:4px;border-right:3px solid ${color}">
          <div style="flex:1;text-align:right">
            <strong style="color:${color}">${domain}</strong><br>
            <span style="font-size:10px">עכשיו: <b>₪${current}</b> | מינ': ₪${min} | מקס': ₪${max}</span>
          </div>
        </div>`);
    }
  });

  renderMultiChart(labels, datasets);
  document.getElementById('statsContainer').innerHTML = statsHtml.join('') ||
    '<div style="text-align:center;color:#999">אין נתונים</div>';
}

// ========================
// גרף רגיל (URL בודד)
// ========================

async function loadPriceHistory(url) {
  await ensureRates();
  chrome.storage.local.get(['priceHistory'], (data) => {
    const urlHistory = (data.priceHistory || {})[url] || [];
    document.getElementById('chartTitle').textContent = getDomain(url);

    if (urlHistory.length === 0) {
      document.getElementById('statsContainer').innerHTML =
        '<div style="text-align:center;color:#999">אין עדיין נתונים להצגה</div>';
      return;
    }

    const labels = urlHistory.map(entry => {
      const d = new Date(entry.timestamp);
      return d.toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });

    const lastParsed = parsePriceWithRates(urlHistory[urlHistory.length - 1].value, _cachedRates || {});
    const detectedCurrency = lastParsed ? lastParsed.currency : 'ILS';

    const prices = urlHistory.map(e => parsePrice(e.value));
    const validPrices = prices.filter(p => p !== null);
    const stats = calculateStats(validPrices, urlHistory);

    if (stats && detectedCurrency !== 'ILS') {
      stats.currency = detectedCurrency;
      stats.rateUsed = (_cachedRates || {})[detectedCurrency] || 1;
    }

    // זיהוי נקודות שינוי אמיתי: השווה סכום מקורי (לפני המרה)
    const originalAmounts = urlHistory.map(e => {
      const parsed = parsePriceWithRates(e.value, _cachedRates || {});
      return parsed ? parsed.amount : null;
    });
    const changeMarkers = originalAmounts.map((amt, i) => {
      if (i === 0) return true; // נקודה ראשונה תמיד מסומנת
      return amt !== null && originalAmounts[i - 1] !== null && amt !== originalAmounts[i - 1];
    });

    displayStats(stats);
    renderChart(labels, prices, detectedCurrency !== 'ILS' ? detectedCurrency : null, changeMarkers);
  });
}

// ========================
// שערי מטבע
// ========================

let _cachedRates = null;
async function ensureRates() {
  if (!_cachedRates) _cachedRates = await getCurrencyRates();
}

function parsePrice(value) {
  if (!value) return null;
  const result = parsePriceWithRates(value, _cachedRates || {});
  return result ? result.amountILS : null;
}

// ========================
// סטטיסטיקות
// ========================

function calculateStats(prices, history) {
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const current = prices[prices.length - 1];
  const first = prices[0];
  const change = current - first;
  const changePercent = ((change / first) * 100).toFixed(2);
  return {
    min: min.toFixed(2), max: max.toFixed(2), avg: avg.toFixed(2),
    current: current.toFixed(2), change: change.toFixed(2),
    changePercent, totalRecords: history.length,
    firstSeen: new Date(history[0].timestamp).toLocaleString('he-IL'),
    lastSeen: new Date(history[history.length - 1].timestamp).toLocaleString('he-IL')
  };
}

function displayStats(stats) {
  if (!stats) {
    document.getElementById('statsContainer').innerHTML =
      '<div style="text-align:center;color:#999">לא ניתן לחשב סטטיסטיקות</div>';
    return;
  }

  const changeColor = parseFloat(stats.change) >= 0 ? '#ea4335' : '#34a853';
  const changeIcon  = parseFloat(stats.change) >= 0 ? '📈' : '📉';

  let conversionRow = '';
  if (stats.currency && stats.currency !== 'ILS') {
    const name = typeof getCurrencyName === 'function' ? getCurrencyName(stats.currency) : stats.currency;
    conversionRow = `
      <div style="background:#e3f2fd;border-radius:4px;padding:5px 6px;margin:4px 0;font-size:10px;color:#1565c0">
        💱 מחירים הומרו מ-<b>${stats.currency}</b> (${name}) לשקל
        | שער: 1 ${stats.currency} = ₪${(stats.rateUsed||1).toFixed(3)}
      </div>`;
  }

  document.getElementById('statsContainer').innerHTML = `
    ${conversionRow}
    <div><span class="stat-label">מחיר נוכחי:</span> ₪${stats.current}</div>
    <div><span class="stat-label">שינוי כולל:</span>
      <span style="color:${changeColor};font-weight:bold">
        ${changeIcon} ₪${stats.change} (${stats.changePercent}%)
      </span>
    </div>
    <div><span class="stat-label">מינימלי:</span> ₪${stats.min}</div>
    <div><span class="stat-label">מקסימלי:</span> ₪${stats.max}</div>
    <div><span class="stat-label">ממוצע:</span> ₪${stats.avg}</div>
    <div style="margin-top:6px;padding-top:6px;border-top:1px solid #ddd;font-size:10px;color:#777">
      <div>רשומות: ${stats.totalRecords}</div>
      <div>ראשון: ${stats.firstSeen} | אחרון: ${stats.lastSeen}</div>
    </div>
  `;
}

// ========================
// Chart rendering
// ========================

function renderChart(labels, prices, originalCurrency, changeMarkers) {
  const ctx = document.getElementById('priceChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const label = originalCurrency ? `מחיר (₪, המר מ-${originalCurrency})` : 'מחיר (₪)';

  // נקודה גדולה + אדומה/ירוקה = שינוי מחיר אמיתי
  // נקודה קטנה + אפורה = רק עדכון שער
  const pointRadii = prices.map((_, i) =>
    !changeMarkers || changeMarkers[i] ? 7 : 2
  );
  const pointColors = prices.map((p, i) => {
    if (!changeMarkers || !changeMarkers[i]) return 'rgba(150,150,150,0.4)';
    if (i === 0) return '#4285f4';
    // עלה = אדום, ירד = ירוק
    const prev = prices.slice(0, i).reverse().find(v => v !== null);
    if (prev === undefined || prev === null) return '#4285f4';
    return p > prev ? '#ea4335' : p < prev ? '#34a853' : '#4285f4';
  });
  const pointBorders = prices.map((_, i) =>
    !changeMarkers || changeMarkers[i] ? 2 : 0
  );

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data: prices,
        borderColor: '#4285f4',
        backgroundColor: 'rgba(66,133,244,0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: pointRadii,
        pointHoverRadius: 9,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#fff',
        pointBorderWidth: pointBorders,
        spanGaps: true,
        // קטע ירידה = קו ירוק ועבה (הנחה), קטע עלייה = קו אדום דק
        segment: {
          borderColor: ctx => {
            const i = ctx.p1DataIndex;
            const prev = prices.slice(0, i).reverse().find(v => v !== null);
            if (prev === undefined || prev === null) return '#4285f4';
            if (!changeMarkers || !changeMarkers[i]) return '#4285f4';
            return prices[i] < prev ? '#34a853' : prices[i] > prev ? '#ea4335' : '#4285f4';
          },
          borderWidth: ctx => {
            const i = ctx.p1DataIndex;
            const prev = prices.slice(0, i).reverse().find(v => v !== null);
            if (prev === undefined || prev === null) return 2;
            if (!changeMarkers || !changeMarkers[i]) return 2;
            return prices[i] < prev ? 4 : 2; // עבה רק בירידה (הנחה)
          }
        }
      }]
    },
    options: chartOptions(false)
  });
}

function renderMultiChart(labels, datasets) {
  const ctx = document.getElementById('priceChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: chartOptions(true)
  });
}

function chartOptions(showLegend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: { font: { size: 10 }, boxWidth: 12, padding: 8 }
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 10,
        rtl: true,
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ₪${ctx.parsed.y}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: { callback: v => '₪' + v, font: { size: 10 } },
        grid: { color: 'rgba(0,0,0,0.05)' }
      },
      x: {
        ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } },
        grid: { display: false }
      }
    }
  };
}

// ========================
// ניתוח AI
// ========================

async function loadAIAnalysis(url) {
  const aiContainer = document.getElementById('aiAnalysisContainer');
  const aiContent = document.getElementById('aiAnalysisContent');
  aiContainer.classList.add('active');
  aiContent.innerHTML = '<div class="ai-loading">🤖 מנתח נתונים...</div>';

  chrome.storage.local.get(['priceHistory', 'selectedModel'], async (data) => {
    const urlHistory = (data.priceHistory || {})[url] || [];

    if (!data.selectedModel) {
      aiContent.innerHTML = `
        <div class="ai-section" style="text-align:center">
          <p>❌ לא הותקן מודל AI</p>
          <p style="font-size:11px;margin-top:8px;opacity:.9">לחץ על "🤖 הגדרות AI" כדי להתקין מודל</p>
        </div>`;
      return;
    }
    if (urlHistory.length === 0) {
      aiContent.innerHTML = `
        <div class="ai-section" style="text-align:center">
          <p>📊 אין עדיין נתונים לניתוח</p>
          <p style="font-size:11px;margin-top:8px;opacity:.9">צריך לפחות 3 רשומות מחיר</p>
        </div>`;
      return;
    }

    try {
      const analysis = await priceAI.analyzePriceHistory(urlHistory);
      if (!analysis.hasEnoughData) {
        aiContent.innerHTML = `<div class="ai-section" style="text-align:center"><p>${analysis.error}</p></div>`;
        return;
      }
      displayAIAnalysis(analysis);
    } catch (error) {
      aiContent.innerHTML = `
        <div class="ai-section" style="text-align:center">
          <p>❌ שגיאה בניתוח</p><p style="font-size:11px">${error.message}</p>
        </div>`;
    }
  });
}

function displayAIAnalysis(analysis) {
  const aiContent = document.getElementById('aiAnalysisContent');
  const trendIcon = analysis.trend === 'increasing' ? '📈' : analysis.trend === 'decreasing' ? '📉' : '➡️';
  const scoreColor = analysis.buyScore >= 8 ? '#4caf50' : analysis.buyScore >= 6 ? '#ff9800' : '#f44336';

  aiContent.innerHTML = `
    <div class="ai-score" style="color:${scoreColor}">${analysis.buyScore}/10</div>
    <div class="ai-recommendation">${priceAI.getRecommendationText(analysis.recommendation)}</div>
    <div class="ai-section">
      <span class="ai-label">מגמת מחיר:</span>
      <span class="ai-value">${trendIcon} ${priceAI.getTrendText(analysis.trend)}</span>
    </div>
    <div class="ai-section">
      <span class="ai-label">תנודתיות:</span>
      <span class="ai-value">${priceAI.getVolatilityText(analysis.volatility)}</span>
    </div>
    ${analysis.prediction ? `
      <div class="ai-section">
        <span class="ai-label">חיזוי לשבוע הבא:</span>
        <span class="ai-value">₪${analysis.prediction.nextWeek}</span>
        <p style="font-size:10px;margin-top:5px;opacity:.8">
          רמת ביטחון: ${(analysis.prediction.confidence * 100).toFixed(0)}%
        </p>
      </div>` : ''}
    <div class="ai-section">
      <span class="ai-label">מיקום במתחם:</span>
      <span class="ai-value">
        ${((analysis.currentPrice - analysis.minPrice) / (analysis.maxPrice - analysis.minPrice) * 100).toFixed(0)}%
      </span>
      <p style="font-size:10px;margin-top:5px;opacity:.8">(0% = נמוך ביותר, 100% = גבוה ביותר)</p>
    </div>
  `;
}