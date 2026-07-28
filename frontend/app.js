// ClauseGuard Frontend Application

// Use relative URLs when behind nginx proxy, or direct backend URL for development
const API_BASE = window.location.port === '80' || window.location.port === ''
  ? ''  // Relative - nginx forwards /api/* to backend
  : 'http://localhost:3001';  // Direct backend for development

// State
let apiKey = '';
let currentContractId = null;
let allClauses = [];
let currentFilter = 'all';

// DOM Elements
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const loadingState = document.getElementById('loadingState');
const loadingText = document.getElementById('loadingText');
const progressFill = document.getElementById('progressFill');
const resultsSection = document.getElementById('resultsSection');
const fileName = document.getElementById('fileName');
const highCount = document.getElementById('highCount');
const mediumCount = document.getElementById('mediumCount');
const lowCount = document.getElementById('lowCount');
const clausesContainer = document.getElementById('clausesContainer');
const filterTabs = document.querySelectorAll('.filter-tab');
const truncationBanner = document.getElementById('truncationBanner');
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const generateEmailBtn = document.getElementById('generateEmailBtn');
const emailLoading = document.getElementById('emailLoading');
const emailResult = document.getElementById('emailResult');
const emailContent = document.getElementById('emailContent');
const copyEmailBtn = document.getElementById('copyEmailBtn');
const newAnalysisBtn = document.getElementById('newAnalysisBtn');

// API Key Management
saveApiKeyBtn.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    showError('API key saved', 'success');
    apiKeyInput.type = 'password';
  }
});

apiKeyInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveApiKeyBtn.click();
  }
});

// File Upload Handlers
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFileUpload(files[0]);
  }
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileUpload(e.target.files[0]);
  }
});

// Filter Tabs
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderClauses();
  });
});

// Generate Email Button
generateEmailBtn.addEventListener('click', async () => {
  if (!currentContractId) return;

  generateEmailBtn.classList.add('hidden');
  emailLoading.classList.remove('hidden');
  emailResult.classList.add('hidden');

  try {
    const response = await fetch(`${API_BASE}/api/contracts/${currentContractId}/negotiation-email`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate email');
    }

    const data = await response.json();
    emailContent.textContent = data.email;
    emailResult.classList.remove('hidden');
  } catch (err) {
    showError(err.message);
    generateEmailBtn.classList.remove('hidden');
  } finally {
    emailLoading.classList.add('hidden');
  }
});

// Copy Email Button
copyEmailBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(emailContent.textContent);
    copyEmailBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyEmailBtn.textContent = 'Copy to Clipboard';
    }, 2000);
  } catch {
    showError('Failed to copy to clipboard');
  }
});

// New Analysis Button
newAnalysisBtn.addEventListener('click', () => {
  resetUI();
});

// File Upload Logic
async function handleFileUpload(file) {
  // Validate file type
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'pdf' && ext !== 'txt') {
    showError('Please upload a PDF or TXT file');
    return;
  }

  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showError('File exceeds 5MB limit');
    return;
  }

  // Check API key
  if (!apiKey) {
    showError('Please enter your API key first');
    return;
  }

  // Show loading state
  uploadSection.classList.add('hidden');
  loadingState.classList.remove('hidden');
  hideError();

  // Start progress animation
  simulateProgress();

  try {
    const formData = new FormData();
    formData.append('contract', file);

    const response = await fetch(`${API_BASE}/api/contracts/analyze`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Analysis failed');
    }

    // Store results
    currentContractId = data.contractId;
    allClauses = data.clauses;

    // Update UI
    fileName.textContent = data.fileName;
    highCount.textContent = data.highRiskCount;
    mediumCount.textContent = data.mediumRiskCount;
    lowCount.textContent = data.lowRiskCount;

    // Show truncation banner if needed
    if (data.truncated) {
      truncationBanner.classList.remove('hidden');
    }

    // Render clauses
    renderClauses();

    // Show results
    loadingState.classList.add('hidden');
    resultsSection.classList.remove('hidden');

  } catch (err) {
    loadingState.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    progressFill.style.width = '0%';

    // Check for specific error codes
    if (err.message.includes('Too many requests')) {
      showError('Rate limit exceeded. Please wait a minute and try again.');
    } else if (err.message.includes('Invalid or missing API key') || err.message.includes('UNAUTHORIZED')) {
      showError('Invalid API key. Please check your key and try again.');
    } else if (err.message.includes('AI service')) {
      showError('AI service is temporarily unavailable. Please try again later.');
    } else {
      showError(err.message);
    }
  }
}

function simulateProgress() {
  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 5;
      progressFill.style.width = Math.min(progress, 90) + '%';
    }
  }, 500);

  // Store interval to clear later
  window.progressInterval = interval;
}

function clearIntervalAndComplete() {
  clearInterval(window.progressInterval);
  progressFill.style.width = '100%';
}

function renderClauses() {
  clearIntervalAndComplete();

  const filtered = currentFilter === 'all'
    ? allClauses
    : allClauses.filter(c => c.riskLevel === currentFilter);

  clausesContainer.innerHTML = filtered.map((clause, index) => {
    const riskClass = clause.riskLevel.toLowerCase();
    const riskLabel = clause.riskLevel;
    const similarityText = clause.similarityScore
      ? `Similarity: ${Math.round(clause.similarityScore * 100)}%`
      : '';

    return `
      <div class="clause-card ${riskClass}-risk">
        <div class="clause-header">
          <span class="risk-badge ${riskClass}">${riskLabel}</span>
          ${similarityText ? `<span class="similarity-score">${similarityText}</span>` : ''}
        </div>
        <div class="clause-text">${escapeHtml(clause.clauseText)}</div>
        <div class="clause-explanation">
          <div class="explanation-label">Analysis</div>
          <div class="explanation-text">${escapeHtml(clause.explanation)}</div>
        </div>
        ${clause.suggestedEdit ? `
          <div class="suggested-edit">
            <div class="suggested-edit-label">Suggested Edit</div>
            <div class="suggested-edit-text">${escapeHtml(clause.suggestedEdit)}</div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (filtered.length === 0) {
    clausesContainer.innerHTML = `
      <div class="no-results">
        <p style="color: var(--text-muted); text-align: center; padding: 48px;">
          No clauses found for this filter.
        </p>
      </div>
    `;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  errorMessage.textContent = message;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

function resetUI() {
  currentContractId = null;
  allClauses = [];
  currentFilter = 'all';
  fileInput.value = '';
  progressFill.style.width = '0%';

  // Reset filter tabs
  filterTabs.forEach(t => t.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');

  // Hide all sections
  resultsSection.classList.add('hidden');
  truncationBanner.classList.add('hidden');
  emailResult.classList.add('hidden');
  emailLoading.classList.add('hidden');

  // Show email button again
  generateEmailBtn.classList.remove('hidden');

  // Show upload section
  uploadSection.classList.remove('hidden');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Focus on API key input if empty
  if (!apiKey) {
    apiKeyInput.focus();
  }
});
