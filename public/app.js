/**
 * Meta Ad Library Scraper – Client-side Application
 * Handles: SSE stream, metrics, log console, card gallery, table view, CSV/JSON export
 */

(function () {
  'use strict';

  // ──────────────────── DOM Handles ────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    targetInput: $('#targetInput'),
    limitInput: $('#limitInput'),
    countrySelect: $('#countrySelect'),
    statusSelect: $('#statusSelect'),
    headlessToggle: $('#headlessToggle'),
    startBtn: $('#startBtn'),
    startBtnText: $('#startBtnText'),
    startIcon: $('#startIcon'),
    startSpinner: $('#startSpinner'),
    stopBtn: $('#stopBtn'),
    clearDataBtn: $('#clearDataBtn'),
    clearTargetBtn: $('#clearTargetBtn'),
    logConsole: $('#logConsole'),
    clearLogsBtn: $('#clearLogsBtn'),
    copyLogsBtn: $('#copyLogsBtn'),
    progressBar: $('#progressBar'),
    progressText: $('#progressText'),
    progressFraction: $('#progressFraction'),
    filterInput: $('#filterInput'),
    downloadCsvBtn: $('#downloadCsvBtn'),
    downloadJsonBtn: $('#downloadJsonBtn'),
    cardsContainer: $('#cardsContainer'),
    emptyState: $('#emptyState'),
    tableContainer: $('#tableContainer'),
    tableBody: $('#tableBody'),
    viewCardsBtn: $('#viewCardsBtn'),
    viewTableBtn: $('#viewTableBtn'),
    resultsCountBadge: $('#resultsCountBadge'),
    statScraped: $('#statScraped'),
    statMedia: $('#statMedia'),
    statPlatforms: $('#statPlatforms'),
    statPercent: $('#statPercent'),
    statSpeed: $('#statSpeed'),
    statLimitLabel: $('#statLimitLabel'),
    jobTimer: $('#jobTimer'),
    statusText: $('#statusText'),
    detailModal: $('#detailModal'),
    modalLibraryId: $('#modalLibraryId'),
    modalBody: $('#modalBody'),
    closeModalBtn: $('#closeModalBtn'),
    modalCloseBtn2: $('#modalCloseBtn2'),
    toastContainer: $('#toastContainer'),
  };

  // ──────────────────── State ────────────────────
  let scrapedAds = [];
  let isRunning = false;
  let eventSource = null;
  let timerInterval = null;
  let startTime = null;
  let viewMode = 'cards'; // 'cards' | 'table'

  // ──────────────────── Toast Notifications ────────────────────
  function showToast(text, type = 'info', duration = 4000) {
    const colors = {
      info: 'bg-blue-900/90 border-blue-700 text-blue-200',
      success: 'bg-emerald-900/90 border-emerald-700 text-emerald-200',
      warn: 'bg-amber-900/90 border-amber-700 text-amber-200',
      error: 'bg-rose-900/90 border-rose-700 text-rose-200',
    };
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-2.5 rounded-xl border text-xs font-medium shadow-lg ${
      colors[type] || colors.info
    } animate-in slide-in-from-right-5 fade-in duration-200`;
    toast.textContent = text;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-x-4', 'transition-all', 'duration-300');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ──────────────────── Timer ────────────────────
  function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      els.jobTimer.textContent = `Elapsed: ${m}:${s}`;
    }, 250);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ──────────────────── Log Console ────────────────────
  function appendLog(message, level = 'info') {
    const colors = {
      info: 'text-slate-400',
      warn: 'text-amber-400',
      error: 'text-rose-400',
      success: 'text-emerald-400',
      progress: 'text-blue-400',
    };
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div = document.createElement('div');
    div.className = `${colors[level] || colors.info}`;
    div.innerHTML = `<span class="text-slate-600">[${ts}]</span> ${escapeHtml(message)}`;
    els.logConsole.appendChild(div);
    els.logConsole.scrollTop = els.logConsole.scrollHeight;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return String(s).replace(/[&<>"]/g, (c) => map[c] || c);
  }

  // ──────────────────── Stats Panel ────────────────────
  function updateStats() {
    const limit = parseInt(els.limitInput.value, 10) || 20;
    const count = scrapedAds.length;

    els.statScraped.textContent = count;
    els.statLimitLabel.textContent = `Target: ${limit}`;

    const imgCount = scrapedAds.filter((a) => a.imageUrl).length;
    const vidCount = scrapedAds.filter((a) => a.videoUrl).length;
    els.statMedia.textContent = `${imgCount} / ${vidCount}`;

    // Unique platforms mentioned
    const platformSet = new Set();
    for (const ad of scrapedAds) {
      (ad.platforms || '').split(',').forEach((p) => {
        const t = p.trim();
        if (t) platformSet.add(t);
      });
    }
    els.statPlatforms.textContent = platformSet.size;

    const pct = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
    els.statPercent.textContent = `${pct}%`;

    if (startTime) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speed = elapsedSec > 0 ? (count / elapsedSec).toFixed(1) : '0';
      els.statSpeed.textContent = `${speed} ads/sec`;
    }

    els.progressBar.style.width = `${pct}%`;
    els.progressFraction.textContent = `${count} / ${limit}`;
    els.resultsCountBadge.textContent = `${count} ad${count !== 1 ? 's' : ''}`;

    // Enable / disable download buttons
    const hasData = count > 0;
    els.downloadCsvBtn.disabled = !hasData;
    els.downloadJsonBtn.disabled = !hasData;
  }

  // ──────────────────── Card Gallery ────────────────────
  function renderCardGallery(ads) {
    // Remove previous cards (keep empty state as placeholder)
    els.cardsContainer.querySelectorAll('.ad-card').forEach((c) => c.remove());

    if (ads.length === 0) {
      els.emptyState.classList.remove('hidden');
      return;
    }

    els.emptyState.classList.add('hidden');

    for (const ad of ads) {
      const card = document.createElement('div');
      card.className =
        'ad-card bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden hover:border-blue-600/40 hover:shadow-lg hover:shadow-blue-500/5 transition-all group cursor-pointer flex flex-col justify-between';

      const mediaBlock = ad.imageUrl
        ? `<div class="relative h-44 bg-black/20 flex items-center justify-center overflow-hidden">
             <img src="${escapeHtml(ad.imageUrl)}" alt="Ad Creative" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display='none';" />
             ${
               ad.videoUrl
                 ? '<span class="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full">▶ Video</span>'
                 : ''
             }
           </div>`
        : `<div class="h-24 bg-slate-900 flex items-center justify-center text-slate-600 text-xs">No Creative Preview</div>`;

      const statusColor = ad.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-500';
      const statusLabel = ad.status === 'Active' ? 'Active' : 'Inactive';

      card.innerHTML = `
        <div>
          ${mediaBlock}
          <div class="p-4 space-y-3">
            <!-- Header: Advertiser + Status -->
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h4 class="text-sm font-semibold text-white truncate">${escapeHtml(ad.advertiserName)}</h4>
                <p class="text-[11px] text-slate-500 font-mono">${escapeHtml(ad.startDate || '')}</p>
              </div>
              <span class="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                ad.status === 'Active'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-700/30 text-slate-400 border-slate-600/40'
              }">
                <span class="w-1.5 h-1.5 rounded-full ${statusColor}"></span>
                ${statusLabel}
              </span>
            </div>

            <!-- Primary Text (Caption) -->
            <p class="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">${escapeHtml(
              ad.primaryText || 'No primary text available.'
            )}</p>

            <!-- Link Preview Box (Display URL + Headline + Description + CTA) -->
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1">
              ${
                ad.displayUrl
                  ? `<div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">${escapeHtml(
                      ad.displayUrl
                    )}</div>`
                  : ''
              }
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold text-white truncate leading-tight">${escapeHtml(
                    ad.headline || ad.advertiserName
                  )}</div>
                  ${
                    ad.description
                      ? `<div class="text-[11px] text-slate-400 line-clamp-1 mt-0.5">${escapeHtml(
                          ad.description
                        )}</div>`
                      : ''
                  }
                </div>
                <span class="shrink-0 text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-md">
                  ${escapeHtml(ad.cta || 'Learn More')}
                </span>
              </div>
            </div>

            <!-- Platforms -->
            <div class="flex flex-wrap gap-1">
              ${(ad.platforms || '')
                .split(',')
                .map(
                  (p) =>
                    `<span class="text-[10px] bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded">${escapeHtml(
                      p.trim()
                    )}</span>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- Footer / Destination Link -->
        <div class="px-4 py-2.5 bg-slate-900/50 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
          <span class="font-mono text-slate-500 truncate max-w-[70%]" title="${escapeHtml(ad.destinationUrl || '')}">${escapeHtml(
            ad.destinationUrl || '—'
          )}</span>
          <button class="view-detail-btn font-semibold text-blue-400 hover:text-white transition">Details →</button>
        </div>
      `;

      // Click handler: open detail modal
      card.querySelector('.view-detail-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailModal(ad);
      });

      card.addEventListener('click', () => openDetailModal(ad));

      els.cardsContainer.appendChild(card);
    }
  }

  // ──────────────────── Data Table ────────────────────
  function renderTable(ads) {
    els.tableBody.innerHTML = '';
    ads.forEach((ad, i) => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-800/40 transition cursor-pointer';
      row.innerHTML = `
        <td class="py-2.5 px-4 text-slate-500 font-mono">${i + 1}</td>
        <td class="py-2.5 px-4 font-semibold text-white">${escapeHtml(ad.advertiserName)}</td>
        <td class="py-2.5 px-4 text-slate-400">${escapeHtml(ad.startDate || '')}</td>
        <td class="py-2.5 px-4 text-slate-400">${escapeHtml(ad.platforms || '')}</td>
        <td class="py-2.5 px-4 text-slate-200 font-medium max-w-[160px] truncate" title="${escapeHtml(ad.headline || '')}">${escapeHtml(ad.headline || '')}</td>
        <td class="py-2.5 px-4 text-slate-400 max-w-[160px] truncate" title="${escapeHtml(ad.description || '')}">${escapeHtml(ad.description || '')}</td>
        <td class="py-2.5 px-4 text-slate-400 max-w-[180px] truncate" title="${escapeHtml(ad.primaryText || '')}">${escapeHtml(ad.primaryText || '')}</td>
        <td class="py-2.5 px-4 text-blue-400 font-semibold">${escapeHtml(ad.cta || '')}</td>
        <td class="py-2.5 px-4 text-slate-500 max-w-[140px] truncate" title="${escapeHtml(ad.destinationUrl || '')}">${escapeHtml(ad.destinationUrl || '—')}</td>
        <td class="py-2.5 px-4">
          ${ad.imageUrl ? '<span class="text-emerald-400" title="Image Creative">🖼</span>' : ''}
          ${ad.videoUrl ? '<span class="text-blue-400 ml-1" title="Video Creative">📹</span>' : ''}
        </td>
        <td class="py-2.5 px-4 text-right">
          <button class="text-blue-400 hover:text-blue-300 text-[11px] font-semibold view-detail-btn">View</button>
        </td>
      `;
      row.querySelector('.view-detail-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailModal(ad);
      });
      row.addEventListener('click', () => openDetailModal(ad));
      els.tableBody.appendChild(row);
    });
  }

  // ──────────────────── Detail Modal ────────────────────
  function openDetailModal(ad) {
    els.modalLibraryId.textContent = `Library ID: ${ad.libraryId || '—'}`;

    function detailRow(label, val, isUrl = false, isImgUrl = false) {
      const display = val || '—';
      let content = escapeHtml(display);
      if (isUrl && val) {
        content = `<a href="${escapeHtml(val)}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline break-all">${escapeHtml(val)}</a>`;
      }
      if (isImgUrl && val) {
        content = `<div class="mt-1"><img src="${escapeHtml(val)}" class="rounded-lg max-h-60 border border-slate-700" loading="lazy" onerror="this.style.display='none'" /><a href="${escapeHtml(val)}" target="_blank" class="text-blue-400 text-[10px] hover:underline break-all block mt-1">${escapeHtml(val)}</a></div>`;
      }
      return `
        <div>
          <div class="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">${label}</div>
          <div class="text-xs text-slate-200 leading-relaxed">${content}</div>
        </div>`;
    }

    els.modalBody.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${detailRow('Advertiser Name', ad.advertiserName)}
        ${detailRow('Start Date', ad.startDate)}
        ${detailRow('Status', ad.status)}
        ${detailRow('Platforms', ad.platforms)}
        ${detailRow('CTA (Call to Action)', ad.cta)}
        ${detailRow('Display URL', ad.displayUrl)}
      </div>
      <hr class="border-slate-800" />
      ${detailRow('Headline', ad.headline)}
      ${detailRow('Description', ad.description)}
      ${detailRow('Primary Text (Caption)', ad.primaryText)}
      ${detailRow('Destination URL', ad.destinationUrl, true)}
      <hr class="border-slate-800" />
      ${detailRow('Image URL', ad.imageUrl, false, true)}
      ${detailRow('Video URL', ad.videoUrl, true)}
    `;

    els.detailModal.classList.remove('hidden');
    els.detailModal.classList.add('flex');
  }

  function closeModal() {
    els.detailModal.classList.add('hidden');
    els.detailModal.classList.remove('flex');
  }

  els.closeModalBtn.addEventListener('click', closeModal);
  els.modalCloseBtn2.addEventListener('click', closeModal);
  els.detailModal.addEventListener('click', (e) => {
    if (e.target === els.detailModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ──────────────────── View Toggle ────────────────────
  els.viewCardsBtn.addEventListener('click', () => {
    viewMode = 'cards';
    els.viewCardsBtn.className =
      'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium flex items-center gap-1.5 transition';
    els.viewTableBtn.className =
      'px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1.5 transition';
    els.cardsContainer.classList.remove('hidden');
    els.tableContainer.classList.add('hidden');
    applyFilter();
  });

  els.viewTableBtn.addEventListener('click', () => {
    viewMode = 'table';
    els.viewTableBtn.className =
      'px-2.5 py-1 rounded-lg bg-blue-600 text-white font-medium flex items-center gap-1.5 transition';
    els.viewCardsBtn.className =
      'px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1.5 transition';
    els.cardsContainer.classList.add('hidden');
    els.tableContainer.classList.remove('hidden');
    applyFilter();
  });

  // ──────────────────── Filter ────────────────────
  function applyFilter() {
    const query = (els.filterInput.value || '').toLowerCase().trim();
    let filtered = scrapedAds;
    if (query) {
      filtered = scrapedAds.filter((ad) => {
        const blob = [
          ad.advertiserName,
          ad.startDate,
          ad.platforms,
          ad.primaryText,
          ad.headline,
          ad.description,
          ad.displayUrl,
          ad.cta,
          ad.destinationUrl,
          ad.libraryId,
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(query);
      });
    }

    if (viewMode === 'cards') {
      renderCardGallery(filtered);
    } else {
      renderTable(filtered);
    }
  }

  els.filterInput.addEventListener('input', applyFilter);

  // ──────────────────── Start Scraping (SSE) ────────────────────
  async function startScraping() {
    if (isRunning) return;
    isRunning = true;

    const target = els.targetInput.value.trim() || 'nike';
    const limit = parseInt(els.limitInput.value, 10) || 20;
    const country = els.countrySelect.value;
    const activeStatus = els.statusSelect.value;
    const headless = els.headlessToggle.checked ? 'true' : 'false';

    // Reset state
    scrapedAds = [];
    updateStats();
    applyFilter();

    // UI State: Running
    els.startBtn.disabled = true;
    els.startIcon.classList.add('hidden');
    els.startSpinner.classList.remove('hidden');
    els.startBtnText.textContent = 'Scraping...';
    els.stopBtn.disabled = false;
    els.progressText.textContent = 'Initializing...';
    els.statusText.textContent = 'Running';

    appendLog(`Starting scrape session: query="${target}" limit=${limit} country=${country}`, 'info');
    startTimer();

    // Build SSE URL
    const params = new URLSearchParams({
      url: target,
      limit: limit.toString(),
      headless,
      country,
      active_status: activeStatus,
    });

    eventSource = new EventSource(`/api/scrape-stream?${params.toString()}`);

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      appendLog(data.message, 'info');
    });

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      appendLog(data.message, data.level || 'info');
      if (data.level === 'progress') {
        els.progressText.textContent = data.message;
      }
    });

    eventSource.addEventListener('ad', (e) => {
      const data = JSON.parse(e.data);

      scrapedAds.push(data.ad);
      updateStats();
      applyFilter();

      els.progressText.textContent = data.message || `Scraped ${scrapedAds.length} ads...`;
      appendLog(data.message || `Scraped ad #${data.count}`, 'success');
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      appendLog(data.message, 'success');
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      finishScraping();
      showToast(`Scraping complete! Extracted ${data.total} ads.`, 'success');
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        appendLog(`Error: ${data.message}`, 'error');
        showToast(`Error: ${data.message}`, 'error');
      } catch {
        appendLog('SSE connection error or stream ended.', 'warn');
      }
      finishScraping();
    });

    eventSource.onerror = () => {
      // SSE connection closed (stream ended naturally or error)
      if (isRunning) {
        finishScraping();
      }
    };
  }

  function finishScraping() {
    isRunning = false;
    stopTimer();

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    // UI State: Idle
    els.startBtn.disabled = false;
    els.startIcon.classList.remove('hidden');
    els.startSpinner.classList.add('hidden');
    els.startBtnText.textContent = 'Start Scraping';
    els.stopBtn.disabled = true;
    els.statusText.textContent = 'Done';

    updateStats();
    applyFilter();

    if (scrapedAds.length > 0) {
      els.progressText.textContent = `Done — ${scrapedAds.length} ads extracted`;
      appendLog(`Session complete: ${scrapedAds.length} ads in dataset.`, 'success');
    } else {
      els.progressText.textContent = 'Idle';
    }
  }

  // ──────────────────── Stop Scraping ────────────────────
  async function stopScraping() {
    appendLog('Sending stop signal...', 'warn');
    try {
      await fetch('/api/stop', { method: 'POST' });
    } catch {}
  }

  // ──────────────────── Clear ────────────────────
  function clearData() {
    scrapedAds = [];
    updateStats();
    applyFilter();
    els.progressBar.style.width = '0%';
    els.progressText.textContent = 'Idle';
    els.progressFraction.textContent = '0 / ' + (els.limitInput.value || 20);
    els.jobTimer.textContent = 'Elapsed: 00:00';
    showToast('Results cleared.', 'info', 2000);
  }

  function clearLogs() {
    els.logConsole.innerHTML =
      '<div class="text-slate-500">[System] Logs cleared.</div>';
  }

  // ──────────────────── Export CSV ────────────────────
  function downloadCsv() {
    if (scrapedAds.length === 0) return;

    // Build CSV in-browser with proper escaping
    const BOM = '﻿';
    const headers = [
      'Advertiser Name',
      'Start Date',
      'Platforms',
      'Primary Text',
      'Headline',
      'Description',
      'Display URL',
      'CTA',
      'Destination URL',
      'Image URL',
      'Video URL',
      'Library ID',
      'Status',
    ];

    function csvEscape(val) {
      if (val === null || val === undefined) return '""';
      let s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    }

    const rows = scrapedAds.map((ad) =>
      [
        ad.advertiserName,
        ad.startDate,
        ad.platforms,
        ad.primaryText,
        ad.headline,
        ad.description,
        ad.displayUrl,
        ad.cta,
        ad.destinationUrl,
        ad.imageUrl,
        ad.videoUrl,
        ad.libraryId,
        ad.status,
      ]
        .map(csvEscape)
        .join(',')
    );

    const csvContent = BOM + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-ads-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${scrapedAds.length} ads to CSV.`, 'success');
  }

  // ──────────────────── Export JSON ────────────────────
  function downloadJson() {
    if (scrapedAds.length === 0) return;
    const blob = new Blob([JSON.stringify(scrapedAds, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-ads-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${scrapedAds.length} ads to JSON.`, 'success');
  }

  // ──────────────────── Copy Logs ────────────────────
  function copyLogs() {
    const text = els.logConsole.innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Logs copied to clipboard.', 'info', 2000);
    });
  }

  // ──────────────────── Preset Buttons ────────────────────
  $$('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.targetInput.value = btn.dataset.query || '';
      if (btn.dataset.country) els.countrySelect.value = btn.dataset.country;
    });
  });

  // ──────────────────── Event Bindings ────────────────────
  els.startBtn.addEventListener('click', startScraping);
  els.stopBtn.addEventListener('click', stopScraping);
  els.clearDataBtn.addEventListener('click', clearData);
  els.clearLogsBtn.addEventListener('click', clearLogs);
  els.copyLogsBtn.addEventListener('click', copyLogs);
  els.downloadCsvBtn.addEventListener('click', downloadCsv);
  els.downloadJsonBtn.addEventListener('click', downloadJson);
  els.clearTargetBtn.addEventListener('click', () => {
    els.targetInput.value = '';
    els.targetInput.focus();
  });

  // Enter key on target to start
  els.targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isRunning) startScraping();
  });

  // Update limit label reactively
  els.limitInput.addEventListener('input', () => {
    const v = parseInt(els.limitInput.value, 10) || 20;
    els.statLimitLabel.textContent = `Target: ${v}`;
    els.progressFraction.textContent = `${scrapedAds.length} / ${v}`;
  });

  // Initial render
  updateStats();
})();
