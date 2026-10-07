/**
 * Express Server for Meta Ad Library Scraper GUI
 */

// Ensure Playwright stores and looks for browsers in node_modules rather than ephemeral ~/.cache
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeMetaAds, normalizeTargetUrl } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active job states
let currentJob = {
  isRunning: false,
  shouldStop: false,
  results: []
};

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    isRunning: currentJob.isRunning,
    timestamp: new Date().toISOString()
  });
});

// Stop scraping endpoint
app.post('/api/stop', (req, res) => {
  if (currentJob.isRunning) {
    currentJob.shouldStop = true;
    return res.json({ success: true, message: 'Stop signal sent to scraper.' });
  }
  return res.json({ success: false, message: 'No scraper is currently active.' });
});

// SSE Streaming Endpoint for Real-time Progress & Logs
app.get('/api/scrape-stream', async (req, res) => {
  const { url, query, limit = 20, headless = 'true', country = 'US', active_status = 'all' } = req.query;
  const target = url || query || 'nike';
  const maxLimit = parseInt(limit, 10) || 20;
  const isHeadless = headless !== 'false';

  if (currentJob.isRunning) {
    return res.status(409).json({ error: 'A scraping job is already in progress. Please wait or stop the current job.' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sendEvent(eventType, data) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  currentJob = {
    isRunning: true,
    shouldStop: false,
    results: []
  };

  sendEvent('status', {
    message: 'Starting Meta Ad Library scraper session...',
    target,
    limit: maxLimit
  });

  try {
    const results = await scrapeMetaAds({
      target,
      limit: maxLimit,
      headless: isHeadless,
      country,
      active_status,
      onProgress: (payload) => {
        if (payload.type === 'ad') {
          currentJob.results.push(payload.ad);
          sendEvent('ad', payload);
        } else if (payload.type === 'log') {
          sendEvent('log', payload);
        } else if (payload.type === 'complete') {
          sendEvent('complete', payload);
        }
      },
      shouldStop: () => currentJob.shouldStop
    });

    currentJob.results = results;
    sendEvent('done', {
      total: results.length,
      ads: results
    });
  } catch (err) {
    sendEvent('error', {
      message: err.message || 'An unknown error occurred during scraping.'
    });
  } finally {
    currentJob.isRunning = false;
    currentJob.shouldStop = false;
    res.end();
  }
});

// Standard JSON Scrape Endpoint
app.post('/api/scrape', async (req, res) => {
  const { url, query, limit = 20, headless = true, country = 'US', active_status = 'all' } = req.body;
  const target = url || query || 'nike';

  if (currentJob.isRunning) {
    return res.status(409).json({ error: 'A scraping task is already running.' });
  }

  currentJob = {
    isRunning: true,
    shouldStop: false,
    results: []
  };

  try {
    const results = await scrapeMetaAds({
      target,
      limit: parseInt(limit, 10) || 20,
      headless: headless !== false,
      country,
      active_status,
      onProgress: () => {},
      shouldStop: () => currentJob.shouldStop
    });

    currentJob.results = results;
    return res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    currentJob.isRunning = false;
    currentJob.shouldStop = false;
  }
});

/**
 * Format string safely for CSV
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Replace double quotes with escaped double quotes
  str = str.replace(/"/g, '""');
  // Enclose in quotes
  return `"${str}"`;
}

// Export CSV Endpoint
app.post('/api/export-csv', (req, res) => {
  const ads = req.body.ads || currentJob.results || [];

  if (!ads || ads.length === 0) {
    return res.status(400).json({ error: 'No ad records provided for export.' });
  }

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
    'Status'
  ];

  const rows = ads.map(ad => [
    escapeCsvValue(ad.advertiserName),
    escapeCsvValue(ad.startDate),
    escapeCsvValue(ad.platforms),
    escapeCsvValue(ad.primaryText),
    escapeCsvValue(ad.headline),
    escapeCsvValue(ad.description),
    escapeCsvValue(ad.displayUrl),
    escapeCsvValue(ad.cta),
    escapeCsvValue(ad.destinationUrl),
    escapeCsvValue(ad.imageUrl),
    escapeCsvValue(ad.videoUrl),
    escapeCsvValue(ad.libraryId),
    escapeCsvValue(ad.status)
  ]);

  // Include UTF-8 Byte Order Mark (BOM) so Excel renders special characters properly
  const bom = '﻿';
  const csvContent = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="meta-ads-export-${Date.now()}.csv"`);
  return res.send(csvContent);
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Meta Ad Library Scraper GUI running at:`);
  console.log(`   👉 http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
