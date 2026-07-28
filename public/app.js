/**
 * ClauseGuard — Frontend Application
 * Handles: file upload, text paste, API calls, result rendering, accept/edit/discard, export
 */

'use strict';

// ============================================================
// State
// ============================================================
const state = {
  currentResults: null,
  acceptedRevisions: new Map(), // clauseId → revision object
  currentFilter: 'flagged',
  contractName: '',
};

// ============================================================
// DOM References
// ============================================================
const $ = id => document.getElementById(id);

const sections = {
  upload: $('upload-section'),
  processing: $('processing-section'),
  error: $('error-section'),
  results: $('results-section'),
  export: $('export-section'),
};

const els = {
  dropZone: $('drop-zone'),
  fileInput: $('file-input'),
  browseBtn: $('browse-btn'),
  contractText: $('contract-text'),
  textareaMeta: $('textarea-meta'),
  contractName: $('contract-name'),
  analyzeBtn: $('analyze-btn'),
  processingStep: $('processing-step'),
  progressBar: $('progress-bar'),
  progressBarContainer: $('progress-bar-container'),
  errorMessage: $('error-message'),
  errorRetryBtn: $('error-retry-btn'),
  statTotal: $('stat-total'),
  statFlagged: $('stat-flagged'),
  statCritical: $('stat-critical'),
  statTime: $('stat-time'),
  tabFlagged: $('tab-flagged'),
  tabAll: $('tab-all'),
  tabCountFlagged: $('tab-count-flagged'),
  tabCountAll: $('tab-count-all'),
  clausesContainer: $('clauses-container'),
  acceptedBar: $('accepted-bar'),
  acceptedCountText: $('accepted-count-text'),
  exportBtn: $('export-btn'),
  emailSubject: $('email-subject'),
  emailBody: $('email-body'),
  copyEmailBtn: $('copy-email-btn'),
  backToResultsBtn: $('back-to-results-btn'),
  newAnalysisBtn: $('new-analysis-btn'),
  resultsSectionEl: $('results-section'),
  toast: $('toast'),
  // Signature check
  sigBanner: $('sig-banner'),
  sigBannerIcon: $('sig-banner-icon'),
  sigBannerMsg: $('sig-banner-msg'),
  // Key Dates panel
  keyDatesPanel: $('key-dates-panel'),
  keyDatesToggle: $('key-dates-toggle'),
  keyDatesList: $('key-dates-list'),
  keyDatesCount: $('key-dates-count'),
};

// ============================================================
// Section Visibility
// ============================================================
function showSection(name) {
  Object.entries(sections).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// Toast Notifications
// ============================================================
let toastTimer = null;
function showToast(message, type = 'default') {
  els.toast.textContent = message;
  els.toast.className = `toast toast-${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 3500);
}

// ============================================================
// Progress Simulation
// ============================================================
let progressInterval = null;
function startProgress(targetPct, stepText) {
  if (progressInterval) clearInterval(progressInterval);
  els.processingStep.textContent = stepText;
  let current = parseFloat(els.progressBar.style.width) || 0;

  progressInterval = setInterval(() => {
    current = Math.min(current + (Math.random() * 3), targetPct);
    els.progressBar.style.width = current + '%';
    els.progressBarContainer.setAttribute('aria-valuenow', Math.round(current));
    if (current >= targetPct) clearInterval(progressInterval);
  }, 120);
}

function finishProgress() {
  if (progressInterval) clearInterval(progressInterval);
  els.progressBar.style.width = '100%';
  els.progressBarContainer.setAttribute('aria-valuenow', 100);
}

function resetProgress() {
  if (progressInterval) clearInterval(progressInterval);
  els.progressBar.style.width = '0%';
  els.progressBarContainer.setAttribute('aria-valuenow', 0);
}

// ============================================================
// File Drop / Browse
// ============================================================
els.dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  els.dropZone.classList.add('drag-over');
});
els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
els.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  els.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});
els.dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
});

els.browseBtn.addEventListener('click', e => {
  e.stopPropagation();
  els.fileInput.click();
});

els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files[0]) handleFileSelected(els.fileInput.files[0]);
});

function handleFileSelected(file) {
  // Show file name in drop zone
  const inner = els.dropZone.querySelector('.drop-primary');
  if (inner) inner.textContent = `📄 ${file.name}`;
  const secondary = els.dropZone.querySelector('.drop-secondary');
  if (secondary) secondary.textContent = `${(file.size / 1024).toFixed(0)} KB`;
  // Clear text area
  els.contractText.value = '';
  els.textareaMeta.textContent = '';
  showToast(`File selected: ${file.name}`, 'success');
}

// Character count for textarea
els.contractText.addEventListener('input', () => {
  const len = els.contractText.value.length;
  if (len > 0) {
    els.textareaMeta.textContent = `${len.toLocaleString()} characters`;
  } else {
    els.textareaMeta.textContent = '';
  }
  // Clear file selection visual if user types
  if (len > 0 && els.fileInput.files.length > 0) {
    const inner = els.dropZone.querySelector('.drop-primary');
    if (inner) inner.textContent = 'Drop your contract here';
    const secondary = els.dropZone.querySelector('.drop-secondary');
    if (secondary) secondary.textContent = 'PDF, DOCX, or TXT · Max 20MB';
  }
});

// ============================================================
// Analyze
// ============================================================
els.analyzeBtn.addEventListener('click', startAnalysis);

async function startAnalysis() {
  const file = els.fileInput.files[0];
  const text = els.contractText.value.trim();
  state.contractName = els.contractName.value.trim() || 'Contract';

  if (!file && !text) {
    showToast('Please upload a file or paste contract text.', 'error');
    return;
  }

  // Reset state
  state.acceptedRevisions.clear();
  state.currentResults = null;

  showSection('processing');
  resetProgress();

  try {
    startProgress(30, 'Parsing document…');

    let response;
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      startProgress(55, 'Splitting clauses…');
      response = await fetch('/api/analyze', { method: 'POST', body: formData });
    } else {
      startProgress(55, 'Splitting clauses…');
      response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    }

    startProgress(75, 'Running TF-IDF risk detection…');

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.message || `Server error: ${response.status}`);
    }

    startProgress(90, 'Generating AI explanations…');

    // Small delay so user sees progress hit 90
    await new Promise(r => setTimeout(r, 400));
    finishProgress();
    await new Promise(r => setTimeout(r, 300));

    state.currentResults = data;
    renderResults(data);
    showSection('results');

  } catch (err) {
    console.error('[ClauseGuard] Analysis error:', err);
    els.errorMessage.textContent = err.message || 'An unexpected error occurred. Please check your connection and try again.';
    showSection('error');
  }
}

els.errorRetryBtn.addEventListener('click', () => showSection('upload'));

// ============================================================
// Render Results
// ============================================================
function renderResults(data) {
  const { totalClauses, flaggedCount, allResults, flaggedResults, processingTime, signatureCheck, keyDates } = data;

  // Stats
  els.statTotal.textContent = totalClauses;
  els.statFlagged.textContent = flaggedCount;
  els.statCritical.textContent = flaggedResults.filter(r => r.riskLevel === 'critical').length;
  els.statTime.textContent = processingTime < 1000
    ? `${processingTime}ms`
    : `${(processingTime / 1000).toFixed(1)}s`;

  // Tab counts
  els.tabCountFlagged.textContent = flaggedCount;
  els.tabCountAll.textContent = totalClauses;

  const subtitle = flaggedCount === 0
    ? `No risky clauses detected across ${totalClauses} clauses.`
    : `${flaggedCount} clause${flaggedCount > 1 ? 's' : ''} flagged across ${totalClauses} analyzed. Accept suggestions to include in negotiation email.`;
  document.getElementById('results-subtitle').textContent = subtitle;

  // Filter tabs
  state.currentFilter = flaggedCount > 0 ? 'flagged' : 'all';
  els.tabFlagged.classList.toggle('active', state.currentFilter === 'flagged');
  els.tabFlagged.setAttribute('aria-selected', state.currentFilter === 'flagged');
  els.tabAll.classList.toggle('active', state.currentFilter === 'all');
  els.tabAll.setAttribute('aria-selected', state.currentFilter === 'all');

  // Signature banner
  if (signatureCheck) renderSignatureBanner(signatureCheck);

  // Key Dates panel
  renderKeyDates(keyDates || []);

  renderClauses();
}

// ============================================================
// Signature Banner
// ============================================================
function renderSignatureBanner(signatureCheck) {
  const { hasSigBlock, signed, message } = signatureCheck;
  const banner = els.sigBanner;

  // Remove all state classes
  banner.classList.remove('sig-ok', 'sig-unsigned', 'sig-missing', 'hidden');

  if (!hasSigBlock) {
    banner.classList.add('sig-missing');
    els.sigBannerIcon.textContent = '⚠️';
    els.sigBannerMsg.textContent = message;
  } else if (signed) {
    banner.classList.add('sig-ok');
    els.sigBannerIcon.textContent = '✅';
    els.sigBannerMsg.textContent = message;
  } else {
    banner.classList.add('sig-unsigned');
    els.sigBannerIcon.textContent = '📝';
    els.sigBannerMsg.textContent = message;
  }
}

// ============================================================
// Key Dates Panel
// ============================================================
const DATE_TYPE_ICONS = {
  'auto-renewal':   '🔄',
  'notice-period':  '⏰',
  'expiration':     '📋',
  'deadline':       '⌛',
  'cure-period':    '🩹',
  'review-window':  '🔍',
};

function renderKeyDates(keyDates) {
  if (!keyDates || keyDates.length === 0) {
    els.keyDatesPanel.classList.add('hidden');
    return;
  }

  els.keyDatesPanel.classList.remove('hidden');
  els.keyDatesCount.textContent = keyDates.length;
  els.keyDatesList.innerHTML = '';

  keyDates.forEach(entry => {
    const icon = DATE_TYPE_ICONS[entry.type] || '📅';
    const li = document.createElement('li');
    li.className = 'key-date-item';
    li.innerHTML = `
      <span class="key-date-type-icon" aria-hidden="true">${icon}</span>
      <div class="key-date-body">
        <div class="key-date-category">${escapeHtml(entry.category)}</div>
        <div class="key-date-detail">${escapeHtml(entry.detail)}</div>
        <button class="key-date-link" data-clause-id="${entry.clauseId}" type="button"
          aria-label="Jump to clause ${entry.clauseId}">
          View clause #${String(entry.clauseId).padStart(2, '0')} ↗
        </button>
      </div>`;
    els.keyDatesList.appendChild(li);
  });

  // Wire up "View clause" links — switch to All tab and scroll to clause card
  els.keyDatesList.querySelectorAll('.key-date-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.clauseId;
      // Switch to all-clauses view so the card is present
      setFilter('all');
      // Scroll clause card into view
      setTimeout(() => {
        const card = els.clausesContainer.querySelector(`[data-clause-id="${id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('expanded');
          const header = card.querySelector('.clause-header');
          if (header) header.setAttribute('aria-expanded', 'true');
        }
      }, 100);
    });
  });
}

// Key Dates panel collapse toggle
els.keyDatesToggle.addEventListener('click', () => {
  const panel = els.keyDatesPanel;
  const isCollapsed = panel.classList.toggle('collapsed');
  els.keyDatesToggle.setAttribute('aria-expanded', !isCollapsed);
});
els.keyDatesToggle.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.keyDatesToggle.click(); }
});

// ============================================================
// Render Clauses
// ============================================================
function renderClauses() {
  const data = state.currentResults;
  if (!data) return;

  const toShow = state.currentFilter === 'flagged'
    ? data.allResults.filter(r => r.isFlagged)
    : data.allResults;

  els.clausesContainer.innerHTML = '';

  if (toShow.length === 0) {
    els.clausesContainer.innerHTML = `
      <div class="no-clauses">
        <div class="no-clauses-icon">✅</div>
        <p>${state.currentFilter === 'flagged' ? 'No risky clauses detected. This contract looks clean!' : 'No clauses found.'}</p>
      </div>`;
    return;
  }

  toShow.forEach((item, index) => {
    const card = buildClauseCard(item, index);
    els.clausesContainer.appendChild(card);
    // Stagger animation
    card.style.animationDelay = `${index * 40}ms`;
  });
}

// ============================================================
// Build Clause Card
// ============================================================
function buildClauseCard(item, index) {
  const { clause, matchedPattern, score, riskLevel, isFlagged, explanation, suggestedReplacement, negotiationPoint, llmSuccess } = item;

  const card = document.createElement('div');
  card.className = `clause-card ${isFlagged ? `risk-${riskLevel}` : 'risk-safe'}`;
  card.dataset.clauseId = clause.id;

  // Auto-expand flagged clauses with critical/high risk
  if (isFlagged && (riskLevel === 'critical' || riskLevel === 'high') && index < 3) {
    card.classList.add('expanded');
  }

  const previewText = clause.text.length > 200
    ? clause.text.substring(0, 200) + '…'
    : clause.text;

  const badgeClass = riskLevel ? `badge-${riskLevel}` : '';
  const badgeLabel = riskLevel ? riskLevel.toUpperCase() : '';

  const headerHTML = `
    <div class="clause-header" role="button" tabindex="0" aria-expanded="${card.classList.contains('expanded')}" aria-controls="clause-body-${clause.id}">
      <span class="clause-num">#${String(clause.id).padStart(2, '0')}</span>
      <div class="clause-header-content">
        <div class="clause-preview">${escapeHtml(previewText)}</div>
        <div class="clause-meta">
          ${isFlagged ? `<span class="risk-badge ${badgeClass}">${badgeLabel}</span>` : ''}
          ${matchedPattern ? `<span class="clause-category">${escapeHtml(matchedPattern.category)}</span>` : ''}
          ${isFlagged ? `<span class="clause-score">${(score * 100).toFixed(1)}% match</span>` : ''}
        </div>
      </div>
      <span class="clause-toggle" aria-hidden="true">▾</span>
    </div>`;

  let bodyHTML = '';
  if (isFlagged) {
    const explanationContent = explanation
      ? `<div class="explanation-box"><p class="explanation-text">${escapeHtml(explanation)}</p></div>`
      : llmSuccess === false
        ? `<div class="llm-fail-notice">⚠️ AI explanation unavailable — ${matchedPattern ? matchedPattern.description : 'risk detected by pattern matching.'}</div>`
        : '';

    const replacementContent = suggestedReplacement
      ? `<div class="panel-box replacement">
          <div class="panel-label"><span class="panel-label-icon">✏️</span> Suggested Replacement</div>
          <textarea class="replacement-edit" id="replacement-${clause.id}" aria-label="Editable suggested replacement">${escapeHtml(suggestedReplacement)}</textarea>
        </div>`
      : `<div class="panel-box replacement">
          <div class="panel-label"><span class="panel-label-icon">✏️</span> Suggested Replacement</div>
          <p class="panel-text" style="color: var(--text-muted); font-style: italic;">AI replacement not available. You may add your own counter-term.</p>
          <textarea class="replacement-edit" id="replacement-${clause.id}" aria-label="Custom replacement text" placeholder="Enter your counter-term here…"></textarea>
        </div>`;

    bodyHTML = `
      <div class="clause-body" id="clause-body-${clause.id}">
        <div class="clause-body-inner">
          ${explanationContent}
          <div class="clause-panel">
            <div class="panel-box original">
              <div class="panel-label"><span class="panel-label-icon">📄</span> Original Clause</div>
              <p class="panel-text">${escapeHtml(clause.text)}</p>
            </div>
            ${replacementContent}
          </div>
          <div class="clause-actions">
            <button class="action-btn btn-accept" data-action="accept" data-clause-id="${clause.id}" type="button">
              ✓ Accept Suggestion
            </button>
            <button class="action-btn btn-discard" data-action="discard" data-clause-id="${clause.id}" type="button">
              ✕ Discard
            </button>
          </div>
        </div>
      </div>`;
  }

  card.innerHTML = headerHTML + bodyHTML;

  // Toggle expand/collapse
  const header = card.querySelector('.clause-header');
  header.addEventListener('click', () => toggleCard(card));
  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(card); }
  });

  // Action buttons
  card.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleClauseAction(btn.dataset.action, btn.dataset.clauseId, item, card);
    });
  });

  return card;
}

function toggleCard(card) {
  const expanded = card.classList.toggle('expanded');
  const header = card.querySelector('.clause-header');
  if (header) header.setAttribute('aria-expanded', expanded);
}

// ============================================================
// Clause Actions
// ============================================================
function handleClauseAction(action, clauseId, item, card) {
  const id = parseInt(clauseId);

  if (action === 'accept') {
    // Read current text from the editable textarea
    const textarea = card.querySelector(`#replacement-${clauseId}`);
    const currentReplacement = textarea ? textarea.value.trim() : item.suggestedReplacement;

    if (!currentReplacement) {
      showToast('Please add a counter-term before accepting.', 'error');
      return;
    }

    if (state.acceptedRevisions.has(id)) {
      // Toggle off
      state.acceptedRevisions.delete(id);
      card.classList.remove('accepted', 'discarded');
      const acceptBtn = card.querySelector('[data-action="accept"]');
      if (acceptBtn) { acceptBtn.textContent = '✓ Accept Suggestion'; acceptBtn.classList.remove('active'); }
    } else {
      // Accept
      state.acceptedRevisions.set(id, {
        clauseId: id,
        originalText: item.clause.text,
        category: item.matchedPattern?.category || 'Risk Clause',
        riskLevel: item.riskLevel,
        negotiationPoint: item.negotiationPoint,
        suggestedReplacement: currentReplacement,
      });
      card.classList.add('accepted');
      card.classList.remove('discarded');
      const acceptBtn = card.querySelector('[data-action="accept"]');
      if (acceptBtn) { acceptBtn.textContent = '✓ Accepted'; acceptBtn.classList.add('active'); }
    }

  } else if (action === 'discard') {
    state.acceptedRevisions.delete(id);
    card.classList.add('discarded');
    card.classList.remove('accepted');
    const acceptBtn = card.querySelector('[data-action="accept"]');
    if (acceptBtn) { acceptBtn.textContent = '✓ Accept Suggestion'; acceptBtn.classList.remove('active'); }
  }

  updateAcceptedBar();
}

function updateAcceptedBar() {
  const count = state.acceptedRevisions.size;
  if (count > 0) {
    els.acceptedBar.classList.remove('hidden');
    els.acceptedCountText.textContent = `${count} revision${count > 1 ? 's' : ''} accepted`;
  } else {
    els.acceptedBar.classList.add('hidden');
  }
}

// ============================================================
// Filter Tabs
// ============================================================
els.tabFlagged.addEventListener('click', () => setFilter('flagged'));
els.tabAll.addEventListener('click', () => setFilter('all'));

function setFilter(filter) {
  state.currentFilter = filter;
  els.tabFlagged.classList.toggle('active', filter === 'flagged');
  els.tabFlagged.setAttribute('aria-selected', filter === 'flagged');
  els.tabAll.classList.toggle('active', filter === 'all');
  els.tabAll.setAttribute('aria-selected', filter === 'all');
  renderClauses();
  // Restore accepted states visually
  state.acceptedRevisions.forEach((_, id) => {
    const card = els.clausesContainer.querySelector(`[data-clause-id="${id}"]`);
    if (card) card.classList.add('accepted');
  });
}

// ============================================================
// Export
// ============================================================
els.exportBtn.addEventListener('click', async () => {
  if (state.acceptedRevisions.size === 0) {
    showToast('Accept at least one clause revision first.', 'error');
    return;
  }

  els.exportBtn.disabled = true;
  els.exportBtn.textContent = 'Generating…';

  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractName: state.contractName,
        acceptedRevisions: Array.from(state.acceptedRevisions.values()),
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || 'Export failed');

    els.emailSubject.textContent = data.email.subject;
    els.emailBody.textContent = data.email.body;
    showSection('export');

  } catch (err) {
    showToast(err.message || 'Failed to generate email.', 'error');
  } finally {
    els.exportBtn.disabled = false;
    els.exportBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">
        <path d="M2 4l6 4 6-4M2 4h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      Export Negotiation Email`;
  }
});

els.copyEmailBtn.addEventListener('click', async () => {
  const subject = `Subject: ${els.emailSubject.textContent}\n\n`;
  const body = els.emailBody.textContent;
  try {
    await navigator.clipboard.writeText(subject + body);
    showToast('Email copied to clipboard!', 'success');
    els.copyEmailBtn.textContent = '✓ Copied!';
    setTimeout(() => { els.copyEmailBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M4 3V2.5A1.5 1.5 0 015.5 1H10a1.5 1.5 0 011.5 1.5V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      Copy Email`; }, 2000);
  } catch {
    showToast('Could not access clipboard. Please select and copy manually.', 'error');
  }
});

els.backToResultsBtn.addEventListener('click', () => showSection('results'));
els.newAnalysisBtn.addEventListener('click', () => {
  // Reset everything
  els.fileInput.value = '';
  els.contractText.value = '';
  els.contractName.value = '';
  els.textareaMeta.textContent = '';
  const inner = els.dropZone.querySelector('.drop-primary');
  if (inner) inner.textContent = 'Drop your contract here';
  const secondary = els.dropZone.querySelector('.drop-secondary');
  if (secondary) secondary.textContent = 'PDF, DOCX, or TXT · Max 20MB';
  state.acceptedRevisions.clear();
  state.currentResults = null;
  els.acceptedBar.classList.add('hidden');
  // Reset new panels
  els.sigBanner.classList.add('hidden');
  els.sigBanner.classList.remove('sig-ok', 'sig-unsigned', 'sig-missing');
  els.keyDatesPanel.classList.add('hidden');
  els.keyDatesPanel.classList.remove('collapsed');
  els.keyDatesList.innerHTML = '';
  showSection('upload');

});

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
