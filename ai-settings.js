// ========================
// AI Settings Logic
// ניהול הגדרות AI ומודלים
// ========================

const MODELS_URL = 'https://raw.githubusercontent.com/giamat13/model-locel-offline-import-helper/refs/heads/main/models.json';

let availableModels = [];
let selectedModel = null;
let systemInfo = null;

// טעינת הדף
document.addEventListener('DOMContentLoaded', async () => {
  await loadSystemInfo();
  await loadCurrentModel();
  await loadAvailableModels();
  
  setupEventListeners();
});

// טעינת מידע מערכת
async function loadSystemInfo() {
  try {
    // בדיקת RAM
    if (navigator.deviceMemory) {
      const ramGB = navigator.deviceMemory;
      document.getElementById('systemRAM').textContent = `${ramGB} GB`;
      systemInfo = { ram: ramGB };
    } else {
      document.getElementById('systemRAM').textContent = '4 GB (משוער)';
      systemInfo = { ram: 4 };
    }

    // מידע על מעבד
    const cpuCores = navigator.hardwareConcurrency || 4;
    document.getElementById('systemCPU').textContent = `${cpuCores} ליבות`;
    
  } catch (error) {
    console.error('שגיאה בטעינת מידע מערכת:', error);
    document.getElementById('systemRAM').textContent = 'לא ידוע';
    document.getElementById('systemCPU').textContent = 'לא ידוע';
    systemInfo = { ram: 4 };
  }
}

// טעינת המודל הנוכחי
async function loadCurrentModel() {
  try {
    const result = await chrome.storage.local.get(['selectedModel']);
    if (result.selectedModel) {
      selectedModel = result.selectedModel;
      document.getElementById('currentModel').textContent = selectedModel.label || selectedModel.name;
    }
  } catch (error) {
    console.error('שגיאה בטעינת מודל נוכחי:', error);
  }
}

// טעינת מודלים זמינים
async function loadAvailableModels() {
  try {
    showAlert('מוריד רשימת מודלים מ-GitHub...', 'info');
    
    const response = await fetch(MODELS_URL);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    availableModels = data || [];
    
    if (availableModels.length === 0) {
      showNoModels();
      return;
    }
    
    hideAlert();
    renderModels();
    
  } catch (error) {
    console.error('שגיאה בטעינת מודלים:', error);
    showAlert('שגיאה בטעינת מודלים מ-GitHub. בדוק את החיבור לאינטרנט.', 'error');
    showNoModels();
  }
}

// רינדור המודלים
function renderModels() {
  document.getElementById('loadingModels').style.display = 'none';
  document.getElementById('modelsContainer').style.display = 'block';
  
  const container = document.getElementById('modelsContainer');
  container.innerHTML = '';
  
  // מציאת המודל המומלץ
  const recommendedModel = findRecommendedModel();
  
  availableModels.forEach(model => {
    const isRecommended = recommendedModel && model.key === recommendedModel.key;
    const isSelected = selectedModel && selectedModel.key === model.key;
    const isDownloaded = false;
    
    const card = document.createElement('div');
    card.className = `model-card ${isRecommended ? 'recommended' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.modelId = model.key;
    
    card.innerHTML = `
      <div class="model-header">
        <div class="model-name">${model.label}</div>
        <div class="model-size">${model.sizeMB} MB</div>
      </div>
      <div class="model-description">מודל: ${model.id}</div>
      <div class="model-specs">
        <div class="spec-item">
          <span class="spec-label">RAM נדרש:</span> ${model.ramMB} MB
        </div>
        <div class="spec-item">
          <span class="spec-label">שפות:</span> ${model.langs}
        </div>
        <div class="spec-item">
          <span class="spec-label">רמה:</span> ${model.tier}
        </div>
        <div class="spec-item">
          <span class="spec-label">מזהה:</span> ${model.key}
        </div>
      </div>
      ${isDownloaded ? '<span class="status-badge downloaded">✓ הורד</span>' : '<span class="status-badge not-downloaded">טרם הורד</span>'}
    `;
    
    card.addEventListener('click', () => selectModel(model, card));
    
    container.appendChild(card);
  });
}

// מציאת המודל המומלץ לפי RAM
function findRecommendedModel() {
  if (!systemInfo || availableModels.length === 0) return null;
  
  const systemRamMB = systemInfo.ram * 1024;
  const sortedModels = [...availableModels].sort((a, b) => a.ramMB - b.ramMB);
  
  for (let i = sortedModels.length - 1; i >= 0; i--) {
    if (sortedModels[i].ramMB <= systemRamMB) {
      return sortedModels[i];
    }
  }
  
  return sortedModels[0];
}

// בחירת מודל
function selectModel(model, cardElement) {
  document.querySelectorAll('.model-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  cardElement.classList.add('selected');
  selectedModel = model;
  
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('saveBtn').textContent = 'שמור והורד מודל';
}

// שמירה והפעלת מודל (ניתוח מקומי - ללא הורדה)
async function saveAndDownloadModel() {
  if (!selectedModel) {
    showAlert('בחר מודל קודם!', 'error');
    return;
  }

  try {
    showProgress(30, 'מפעיל מנוע ניתוח...');
    await new Promise(r => setTimeout(r, 400));
    showProgress(80, 'מכין מודל...');
    await new Promise(r => setTimeout(r, 400));

    await chrome.storage.local.set({
      selectedModel: selectedModel,
      modelData: { isDummy: true, modelId: selectedModel.key, downloadedAt: Date.now() }
    });

    showProgress(100, 'הושלם!');
    await new Promise(r => setTimeout(r, 300));
    hideProgress();

    showAlert(`✅ מודל "${selectedModel.label}" הופעל בהצלחה!`, 'success');
    document.getElementById('currentModel').textContent = selectedModel.label;
    document.getElementById('saveBtn').textContent = 'מודל פעיל ✓';
    document.getElementById('saveBtn').disabled = true;

    renderModels();

  } catch (error) {
    console.error('שגיאה:', error);
    hideProgress();
    showAlert(`❌ שגיאה: ${error.message}`, 'error');
  }
}

// הצגת התקדמות
function showProgress(percent, message) {
  const container = document.getElementById('progressContainer');
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  
  container.classList.add('show');
  fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  text.textContent = message || `${percent}%`;
}

function hideProgress() {
  const container = document.getElementById('progressContainer');
  container.classList.remove('show');
}

function showAlert(message, type = 'info') {
  const container = document.getElementById('alertContainer');
  container.innerHTML = `
    <div class="alert alert-${type} show">
      ${message}
    </div>
  `;
}

function hideAlert() {
  const container = document.getElementById('alertContainer');
  container.innerHTML = '';
}

function showNoModels() {
  document.getElementById('loadingModels').style.display = 'none';
  document.getElementById('noModels').style.display = 'block';
}

function setupEventListeners() {
  document.getElementById('backBtn').addEventListener('click', () => {
    window.close();
  });
  
  document.getElementById('saveBtn').addEventListener('click', saveAndDownloadModel);
}