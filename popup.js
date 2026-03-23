let chartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) return;

  const cleanUrl = new URL(tab.url).origin + new URL(tab.url).pathname;

  // טעינת מצב ה-toggle
  chrome.storage.local.get(['discountAlerts'], (data) => {
    const discountToggle = document.getElementById('discountToggle');
    discountToggle.checked = data.discountAlerts === true;
  });

  // שמירת מצב ה-toggle
  document.getElementById('discountToggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ discountAlerts: e.target.checked }, () => {
      console.log('Discount alerts:', e.target.checked);
    });
  });

  // בדיקת מעקב קיים
  chrome.storage.local.get(['trackers', 'priceHistory'], (data) => {
    const trackers = data.trackers || {};
    if (trackers[cleanUrl]) {
      document.getElementById('deleteTrack').style.display = 'block';
      document.getElementById('viewHistory').style.display = 'block';
      document.getElementById('statusText').innerText = "יש מעקב פעיל על דף זה";
      
      // בדיקה אם יש היסטוריה
      const history = data.priceHistory || {};
      if (history[cleanUrl] && history[cleanUrl].length > 0) {
        document.getElementById('statusText').innerText = 
          `מעקב פעיל | ${history[cleanUrl].length} רשומות`;
      }
    }
  });

  // כפתור בחירה
  document.getElementById('startSelection').addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: "ENABLE_SELECTION_MODE" }, (response) => {
      if (chrome.runtime.lastError) {
        alert("יש לרענן את הדף (F5) לפני הבחירה הראשונה.");
      }
      window.close();
    });
  });

  // כפתור מחיקה
  document.getElementById('deleteTrack').addEventListener('click', () => {
    chrome.storage.local.get(['trackers', 'priceHistory'], (data) => {
      let trackers = data.trackers || {};
      let history = data.priceHistory || {};
      delete trackers[cleanUrl];
      delete history[cleanUrl];
      chrome.storage.local.set({ trackers, priceHistory: history }, () => {
        chrome.tabs.reload(tab.id);
        window.close();
      });
    });
  });

  // כפתור הצגת גרף
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
      loadPriceHistory(cleanUrl);
      loadAIAnalysis(cleanUrl);
    }
  });

  // כפתור הגדרות AI
  document.getElementById('aiSettings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'ai-settings.html' });
  });

  // כפתור רענון AI
  document.getElementById('refreshAI').addEventListener('click', () => {
    loadAIAnalysis(cleanUrl);
  });

  // כפתור ניקוי היסטוריה
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
});

function loadPriceHistory(url) {
  chrome.storage.local.get(['priceHistory'], (data) => {
    const history = data.priceHistory || {};
    const urlHistory = history[url] || [];

    if (urlHistory.length === 0) {
      document.getElementById('statsContainer').innerHTML = 
        '<div style="text-align: center; color: #999;">אין עדיין נתונים להצגה</div>';
      return;
    }

    // הכנת נתונים לגרף
    const labels = urlHistory.map(entry => {
      const date = new Date(entry.timestamp);
      return date.toLocaleString('he-IL', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    });

    const prices = urlHistory.map(entry => parsePrice(entry.value));

    // חישוב סטטיסטיקות
    const validPrices = prices.filter(p => p !== null);
    const stats = calculateStats(validPrices, urlHistory);
    displayStats(stats);

    // יצירת הגרף
    renderChart(labels, prices);
  });
}

function parsePrice(value) {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '');

  // 1. חפש מחיר עם סימן מטבע (₪ או $) - עדיפות ראשונה
  const withCurrency = [...cleaned.matchAll(/(?:₪|\$)\s*([\d.]+)|([\d.]+)\s*(?:₪|\$)/g)];
  if (withCurrency.length > 0) {
    const prices = withCurrency
      .map(m => parseFloat(m[1] || m[2]))
      .filter(p => !isNaN(p) && p > 0);
    // אם יש כמה מחירים (מקורי + מבצע), קח את הקטן
    if (prices.length > 0) return Math.min(...prices);
  }

  // 2. דלג על שורות עם אחוז, חפש מספר רגיל
  const lines = cleaned.split(/[\n\r]+/);
  for (const line of lines) {
    if (line.trim().endsWith('%') || line.trim().startsWith('-')) continue;
    const match = line.match(/[\d.]+/);
    if (match) return parseFloat(match[0]);
  }

  return null;
}

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
    min: min.toFixed(2),
    max: max.toFixed(2),
    avg: avg.toFixed(2),
    current: current.toFixed(2),
    change: change.toFixed(2),
    changePercent,
    totalRecords: history.length,
    firstSeen: new Date(history[0].timestamp).toLocaleString('he-IL'),
    lastSeen: new Date(history[history.length - 1].timestamp).toLocaleString('he-IL')
  };
}

function displayStats(stats) {
  if (!stats) {
    document.getElementById('statsContainer').innerHTML = 
      '<div style="text-align: center; color: #999;">לא ניתן לחשב סטטיסטיקות</div>';
    return;
  }

  const changeColor = parseFloat(stats.change) >= 0 ? '#ea4335' : '#34a853';
  const changeIcon = parseFloat(stats.change) >= 0 ? '📈' : '📉';

  document.getElementById('statsContainer').innerHTML = `
    <div><span class="stat-label">מחיר נוכחי:</span> ${stats.current} ₪</div>
    <div><span class="stat-label">שינוי כולל:</span> 
      <span style="color: ${changeColor}; font-weight: bold;">
        ${changeIcon} ${stats.change} ₪ (${stats.changePercent}%)
      </span>
    </div>
    <div><span class="stat-label">מחיר מינימלי:</span> ${stats.min} ₪</div>
    <div><span class="stat-label">מחיר מקסימלי:</span> ${stats.max} ₪</div>
    <div><span class="stat-label">ממוצע:</span> ${stats.avg} ₪</div>
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 10px; color: #777;">
      <div>רשומות: ${stats.totalRecords}</div>
      <div>נצפה לראשונה: ${stats.firstSeen}</div>
      <div>עדכון אחרון: ${stats.lastSeen}</div>
    </div>
  `;
}

function renderChart(labels, prices) {
  const ctx = document.getElementById('priceChart').getContext('2d');

  // הרס גרף קודם אם קיים
  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'מחיר (₪)',
        data: prices,
        borderColor: '#4285f4',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#4285f4',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          rtl: true,
          callbacks: {
            label: function(context) {
              return 'מחיר: ' + context.parsed.y + ' ₪';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return value + ' ₪';
            },
            font: { size: 11 }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 10 }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

async function loadAIAnalysis(url) {
  const aiContainer = document.getElementById('aiAnalysisContainer');
  const aiContent = document.getElementById('aiAnalysisContent');
  
  aiContainer.classList.add('active');
  aiContent.innerHTML = '<div class="ai-loading">🤖 מנתח נתונים...</div>';
  
  chrome.storage.local.get(['priceHistory', 'selectedModel'], async (data) => {
    const history = data.priceHistory || {};
    const urlHistory = history[url] || [];
    
    // בדיקה אם יש מודל מותקן
    if (!data.selectedModel) {
      aiContent.innerHTML = `
        <div class="ai-section" style="text-align: center;">
          <p>❌ לא הותקן מודל AI</p>
          <p style="font-size: 11px; margin-top: 8px; opacity: 0.9;">
            לחץ על "🤖 הגדרות AI" כדי להתקין מודל
          </p>
        </div>
      `;
      return;
    }
    
    if (urlHistory.length === 0) {
      aiContent.innerHTML = `
        <div class="ai-section" style="text-align: center;">
          <p>📊 אין עדיין נתונים לניתוח</p>
          <p style="font-size: 11px; margin-top: 8px; opacity: 0.9;">
            צריך לפחות 3 רשומות מחיר
          </p>
        </div>
      `;
      return;
    }
    
    // ניתוח עם AI
    try {
      // טוען את ai-analyzer.js אם לא נטען
      if (typeof priceAI === 'undefined') {
        await loadScript('ai-analyzer.js');
      }
      
      // מריץ ניתוח
      const analysis = await priceAI.analyzePriceHistory(urlHistory);
      
      if (!analysis.hasEnoughData) {
        aiContent.innerHTML = `
          <div class="ai-section" style="text-align: center;">
            <p>${analysis.error}</p>
          </div>
        `;
        return;
      }
      
      // הצגת תוצאות
      displayAIAnalysis(analysis);
      
    } catch (error) {
      console.error('AI Analysis error:', error);
      aiContent.innerHTML = `
        <div class="ai-section" style="text-align: center;">
          <p>❌ שגיאה בניתוח</p>
          <p style="font-size: 11px;">${error.message}</p>
        </div>
      `;
    }
  });
}

function displayAIAnalysis(analysis) {
  const aiContent = document.getElementById('aiAnalysisContent');
  
  const trendIcon = analysis.trend === 'increasing' ? '📈' : analysis.trend === 'decreasing' ? '📉' : '➡️';
  const scoreColor = analysis.buyScore >= 8 ? '#4caf50' : analysis.buyScore >= 6 ? '#ff9800' : '#f44336';
  
  aiContent.innerHTML = `
    <div class="ai-score" style="color: ${scoreColor};">
      ${analysis.buyScore}/10
    </div>
    
    <div class="ai-recommendation">
      ${priceAI.getRecommendationText(analysis.recommendation)}
    </div>
    
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
        <p style="font-size: 10px; margin-top: 5px; opacity: 0.8;">
          רמת ביטחון: ${(analysis.prediction.confidence * 100).toFixed(0)}%
        </p>
      </div>
    ` : ''}
    
    <div class="ai-section">
      <span class="ai-label">מיקום במתחם:</span>
      <span class="ai-value">
        ${((analysis.currentPrice - analysis.minPrice) / (analysis.maxPrice - analysis.minPrice) * 100).toFixed(0)}%
      </span>
      <p style="font-size: 10px; margin-top: 5px; opacity: 0.8;">
        (0% = נמוך ביותר, 100% = גבוה ביותר)
      </p>
    </div>
  `;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}