// ========================
// AI Price Analyzer
// מערכת ניתוח וחיזוי מחירים
// ========================

class PriceAIAnalyzer {
  constructor() {
    this.model = null;
    this.modelInfo = null;
    this.isReady = false;
  }

  // טעינת המודל - משתמש בחיזוי סטטיסטי (ללא TensorFlow)
  async loadModel() {
    try {
      const settings = await chrome.storage.local.get(['selectedModel']);
      this.modelInfo = settings.selectedModel || null;
      this.model = null; // תמיד simplePrediction
      this.isReady = true;
      console.log('AI Analyzer: מוכן (חיזוי סטטיסטי)');
      return true;
    } catch (error) {
      console.error('AI Analyzer: שגיאה:', error);
      this.isReady = true;
      return true;
    }
  }

  // TensorFlow.js לא נתמך ב-MV3 - משתמשים בחיזוי פשוט בלבד
  async createDummyModel() {
    return null;
  }

  // ניתוח היסטורית מחירים
  async analyzePriceHistory(priceHistory) {
    if (!priceHistory || priceHistory.length < 3) {
      return {
        error: 'לא מספיק נתונים לניתוח (צריך לפחות 3 רשומות)',
        hasEnoughData: false
      };
    }

    const prices = this.extractPrices(priceHistory);
    
    if (prices.length < 3) {
      return {
        error: 'לא ניתן לחלץ מספיק מחירים מההיסטוריה',
        hasEnoughData: false
      };
    }

    const analysis = {
      hasEnoughData: true,
      currentPrice: prices[prices.length - 1],
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      trend: this.detectTrend(prices),
      volatility: this.calculateVolatility(prices),
      priceChange: this.calculatePriceChange(prices),
      prediction: null,
      buyScore: 0,
      recommendation: ''
    };

    // חיזוי מחיר עתידי (חיזוי סטטיסטי)
    analysis.prediction = this.simplePrediction(prices);

    // חישוב ציון קנייה
    analysis.buyScore = this.calculateBuyScore(analysis);
    analysis.recommendation = this.getRecommendation(analysis);

    return analysis;
  }

  // חילוץ מחירים מספריים מההיסטוריה
  extractPrices(priceHistory) {
    return priceHistory
      .map(entry => this.parsePrice(entry.value))
      .filter(price => price !== null);
  }

  // חילוץ מספר מטקסט מחיר
  parsePrice(value) {
    if (!value) return null;
    const match = value.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  }

  // זיהוי מגמה (עולה/יורד/יציב)
  detectTrend(prices) {
    if (prices.length < 3) return 'stable';
    
    const recentPrices = prices.slice(-5); // 5 אחרונים
    const first = recentPrices[0];
    const last = recentPrices[recentPrices.length - 1];
    const change = ((last - first) / first) * 100;

    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  // חישוב תנודתיות
  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs(((prices[i] - prices[i - 1]) / prices[i - 1]) * 100);
      changes.push(change);
    }
    
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    
    if (avgChange < 3) return 'low';
    if (avgChange < 8) return 'medium';
    return 'high';
  }

  // חישוב שינוי מחיר
  calculatePriceChange(prices) {
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = last - first;
    const changePercent = ((change / first) * 100).toFixed(2);
    
    return {
      absolute: change.toFixed(2),
      percent: changePercent,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
    };
  }

  // חיזוי פשוט (ללא מודל ML)
  simplePrediction(prices) {
    const recentPrices = prices.slice(-5);
    const trend = this.detectTrend(prices);
    const lastPrice = prices[prices.length - 1];
    
    // חישוב קצב שינוי ממוצע
    let totalChange = 0;
    for (let i = 1; i < recentPrices.length; i++) {
      totalChange += (recentPrices[i] - recentPrices[i - 1]);
    }
    const avgChange = totalChange / (recentPrices.length - 1);
    
    // חיזוי לשבוע הבא (7 ימים)
    const predictedPrice = lastPrice + (avgChange * 7);
    
    return {
      nextWeek: Math.max(0, predictedPrice.toFixed(2)),
      confidence: this.calculateConfidence(recentPrices),
      method: 'simple_average',
      trend: trend
    };
  }

  // חיזוי מחיר - חיזוי סטטיסטי חכם
  async predictNextPrice(prices) {
    return this.simplePrediction(prices);
  }

  // נרמול מחירים
  normalizePrices(prices) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    return prices.map(p => (p - min) / range);
  }

  // דה-נרמול מחיר
  denormalizePrice(normalized, originalPrices) {
    const min = Math.min(...originalPrices);
    const max = Math.max(...originalPrices);
    const range = max - min || 1;
    return (normalized * range) + min;
  }

  // חישוב רמת ביטחון
  calculateConfidence(prices) {
    if (prices.length < 3) return 0.3;
    if (prices.length < 5) return 0.5;
    if (prices.length < 10) return 0.7;
    return 0.85;
  }

  // חישוב ציון קנייה (1-10)
  calculateBuyScore(analysis) {
    let score = 5; // בסיס

    // המחיר הנוכחי לעומת הטווח
    const priceRange = analysis.maxPrice - analysis.minPrice;
    const currentPosition = (analysis.currentPrice - analysis.minPrice) / priceRange;
    
    // מחיר נמוך = ציון גבוה
    if (currentPosition < 0.2) score += 3;
    else if (currentPosition < 0.4) score += 2;
    else if (currentPosition < 0.6) score += 1;
    else if (currentPosition > 0.8) score -= 2;

    // מגמה
    if (analysis.trend === 'decreasing') score += 1.5;
    else if (analysis.trend === 'increasing') score -= 1;

    // תנודתיות
    if (analysis.volatility === 'high') score -= 0.5;
    else if (analysis.volatility === 'low') score += 0.5;

    // חיזוי
    if (analysis.prediction) {
      const predictedChange = ((parseFloat(analysis.prediction.nextWeek) - analysis.currentPrice) / analysis.currentPrice) * 100;
      if (predictedChange > 5) score -= 1.5; // צפוי לעלות
      else if (predictedChange < -5) score += 1; // צפוי לרדת עוד
    }

    return Math.max(1, Math.min(10, score)).toFixed(1);
  }

  // קבלת המלצה
  getRecommendation(analysis) {
    const score = parseFloat(analysis.buyScore);
    
    if (score >= 8.5) return 'buy_now';
    if (score >= 7) return 'good_price';
    if (score >= 5.5) return 'fair_price';
    if (score >= 4) return 'wait_better';
    return 'wait';
  }

  // תרגום להמלצה בעברית
  getRecommendationText(recommendation) {
    const texts = {
      'buy_now': '🎯 קנה עכשיו! מחיר מצוין',
      'good_price': '✅ מחיר טוב, כדאי לקנות',
      'fair_price': '💰 מחיר סביר',
      'wait_better': '⏳ אפשר לחכות למחיר טוב יותר',
      'wait': '⏸️ מומלץ לחכות'
    };
    return texts[recommendation] || texts['fair_price'];
  }

  // תרגום מגמה לעברית
  getTrendText(trend) {
    const texts = {
      'increasing': '📈 עולה',
      'decreasing': '📉 יורד',
      'stable': '➡️ יציב'
    };
    return texts[trend] || texts['stable'];
  }

  // תרגום תנודתיות לעברית
  getVolatilityText(volatility) {
    const texts = {
      'low': 'נמוכה',
      'medium': 'בינונית',
      'high': 'גבוהה'
    };
    return texts[volatility] || texts['medium'];
  }
}

// יצירת instance גלובלי
const priceAI = new PriceAIAnalyzer();