/**
 * Meta Ad Library Scraper using Playwright
 * Extracts 10 exact fields from ad cards:
 * 1. Advertiser Name
 * 2. Start Date ("Started running on [Date]")
 * 3. Platforms (Facebook, Instagram, Messenger, Audience Network)
 * 4. Primary Text (main body text/caption)
 * 5. Headline (bold text near CTA button / link preview)
 * 6. Description (secondary text underneath headline)
 * 7. CTA (Call to Action button text)
 * 8. Destination URL (decoded direct landing page link)
 * 9. Image URL (static creative source)
 * 10. Video URL (video source URL or poster/thumbnail)
 */

const { chromium } = require('playwright');

/**
 * Helper to normalize search input into a valid Meta Ad Library URL
 * @param {string} input - URL, search query, or page ID
 * @param {object} options - country, active_status, etc.
 * @returns {string} valid Meta Ad Library URL
 */
function normalizeTargetUrl(input, options = {}) {
  const trimmed = (input || '').trim();
  const country = options.country || 'US';
  const activeStatus = options.active_status || 'all';

  if (!trimmed) {
    return `https://www.facebook.com/ads/library/?active_status=${activeStatus}&ad_type=all&country=${country}&q=nike&search_type=keyword_unordered&media_type=all&locale=en_US`;
  }

  // If already a full facebook ads library URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      if (url.hostname.includes('facebook.com') && url.pathname.includes('/ads/library')) {
        if (!url.searchParams.has('locale')) {
          url.searchParams.set('locale', 'en_US');
        }
        return url.toString();
      }
    } catch {}
  }

  // If numeric page ID (e.g. 123456789)
  if (/^\d{8,20}$/.test(trimmed)) {
    return `https://www.facebook.com/ads/library/?active_status=${activeStatus}&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(
      trimmed
    )}&search_type=page&media_type=all&locale=en_US`;
  }

  // Otherwise treat as a search query keyword
  return `https://www.facebook.com/ads/library/?active_status=${activeStatus}&ad_type=all&country=${country}&q=${encodeURIComponent(
    trimmed
  )}&search_type=keyword_unordered&media_type=all&locale=en_US`;
}

/**
 * Scrapes ads from the Meta Ad Library
 * @param {object} params
 * @param {string} params.target - URL or search keyword
 * @param {number} params.limit - Maximum number of ads to scrape
 * @param {boolean} params.headless - Run browser headless (default true)
 * @param {function} params.onProgress - Progress callback function
 * @param {function} params.shouldStop - Cancellation check function
 * @returns {Promise<Array>} Array of scraped ad objects
 */
async function scrapeMetaAds({
  target,
  limit = 20,
  headless = true,
  country = 'US',
  active_status = 'all',
  onProgress = () => {},
  shouldStop = () => false
}) {
  const targetUrl = normalizeTargetUrl(target, { country, active_status });
  const maxLimit = Math.max(1, parseInt(limit, 10) || 20);

  onProgress({
    type: 'log',
    level: 'info',
    message: `Initializing Playwright browser (Headless: ${headless})...`
  });

  // Launch Chromium with anti-bot detection evasion flags
  const browser = await chromium.launch({
    headless: headless !== false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1440,900'
    ]
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      deviceScaleFactor: 1
    });

    const page = await context.newPage();

    // Mask webdriver property
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    onProgress({
      type: 'log',
      level: 'info',
      message: `Navigating to Meta Ad Library: ${targetUrl}`
    });

    // Navigate to target URL
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    onProgress({
      type: 'log',
      level: 'info',
      message: 'Page loaded. Checking for cookie consent dialogs...'
    });

    // Short wait for dynamic hydration
    await page.waitForTimeout(3500);

    // Auto-dismiss cookie dialogs if present
    try {
      const cookieSelectors = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Accept all")',
        'button:has-text("Decline optional cookies")',
        'button:has-text("Only essential cookies")',
        '[aria-label="Allow all cookies"]',
        '[aria-label="Decline optional cookies"]',
        '[aria-label="Accept all"]'
      ];

      for (const sel of cookieSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1200 }).catch(() => false)) {
          onProgress({
            type: 'log',
            level: 'info',
            message: `Dismissing cookie banner via: ${sel}`
          });
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(1500);
          break;
        }
      }
    } catch {}

    onProgress({
      type: 'log',
      level: 'info',
      message: 'Searching for ad cards in DOM...'
    });

    // Wait for ad results or Library ID indicators to appear
    try {
      await page.waitForFunction(
        () => {
          return (
            document.body &&
            (document.body.innerText.includes('Library ID:') ||
              document.body.innerText.includes('Started running') ||
              document.body.innerText.includes('No ads match') ||
              document.body.innerText.includes('No results found'))
          );
        },
        { timeout: 25000 }
      );
    } catch (e) {
      onProgress({
        type: 'log',
        level: 'warn',
        message: 'Initial wait timeout reached, continuing to DOM parsing...'
      });
    }

    // Check if "No ads match your search criteria" exists
    const hasNoResults = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      return body.includes('No ads match your search criteria') || body.includes('No results found');
    });

    if (hasNoResults) {
      onProgress({
        type: 'log',
        level: 'warn',
        message: 'Meta Ad Library returned 0 results for this search query/filter.'
      });
      return [];
    }

    const adsMap = new Map();
    let scrollAttempts = 0;
    const maxConsecutiveIdleScrolls = 6;
    let consecutiveIdleScrolls = 0;
    let previousCount = 0;

    onProgress({
      type: 'log',
      level: 'info',
      message: `Starting infinite scroll extraction (Target Limit: ${maxLimit} ads)...`
    });

    while (adsMap.size < maxLimit && consecutiveIdleScrolls < maxConsecutiveIdleScrolls) {
      if (shouldStop()) {
        onProgress({
          type: 'log',
          level: 'warn',
          message: 'Scraping stopped by user.'
        });
        break;
      }

      // Execute in-browser DOM extraction using structural heuristics
      const extractedBatch = await page.evaluate(() => {
        function decodeFbUrl(rawUrl) {
          if (!rawUrl) return '';
          try {
            if (rawUrl.includes('l.facebook.com/l.php') || rawUrl.includes('lm.facebook.com/l.php')) {
              const parsed = new URL(rawUrl, 'https://www.facebook.com');
              const target = parsed.searchParams.get('u');
              if (target) return decodeURIComponent(target);
            }
            return rawUrl;
          } catch {
            return rawUrl;
          }
        }

        const ctaKeywords = [
          'Learn More', 'Shop Now', 'Sign Up', 'Apply Now', 'Book Now', 'Contact Us',
          'Download', 'Get Quote', 'Subscribe', 'Order Now', 'Watch More', 'Send Message',
          'Open Link', 'Play Game', 'Use App', 'Install now', 'Install Now', 'Get Offer',
          'See Menu', 'Listen Now', 'Get Directions', 'Call Now', 'Request Time',
          'Visit Instagram profile', 'Visit Facebook profile', 'Send WhatsApp Message',
          'Claim Offer', 'Get Access', 'Register Now', 'Join Now', 'Donate Now'
        ];

        const all = Array.from(document.querySelectorAll('*'));
        // Find leaf elements starting with "Library ID:"
        const libraryIdElements = all.filter(
          el => (el.textContent || '').trim().startsWith('Library ID:') && el.children.length === 0
        );

        const items = [];
        const visitedCards = new Set();

        for (const libEl of libraryIdElements) {
          // Traverse up to find the top-level individual ad card container
          let card = libEl;
          let depth = 0;
          while (card && card.parentElement && card.parentElement !== document.body && depth < 16) {
            const pText = card.parentElement.textContent || '';
            const cText = card.textContent || '';
            const pCount = (pText.match(/Library ID:/g) || []).length;
            const cCount = (cText.match(/Library ID:/g) || []).length;
            if (cCount === 1 && pCount > 1) {
              break; // card is the single ad card container
            }
            card = card.parentElement;
            depth++;
          }

          if (!card || visitedCards.has(card)) continue;
          visitedCards.add(card);

          const cardText = card.innerText || card.textContent || '';
          const lines = (card.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);

          // 1. Library ID
          const libMatch = cardText.match(/Library ID:\s*(\d+)/i);
          const libraryId = libMatch ? libMatch[1] : '';

          // 2. Start Date ("Started running on [Date]")
          let startDate = '';
          const startMatch = cardText.match(/Started running on\s*([^\n·]+)/i);
          if (startMatch) {
            startDate = `Started running on ${startMatch[1].trim()}`;
          } else {
            const rangeMatch = cardText.match(
              /(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s*-\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/
            );
            if (rangeMatch) {
              startDate = `Started running on ${rangeMatch[1].trim()}`;
            } else {
              const anyDate = cardText.match(
                /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b)/i
              );
              if (anyDate) startDate = `Started running on ${anyDate[1].trim()}`;
            }
          }

          // 3. Status (Active / Inactive)
          const status = /Active/i.test(cardText.slice(0, 100)) ? 'Active' : 'Inactive';

          // 4. Advertiser Name (Header text of ad card)
          let advertiserName = '';
          const sponsoredIdx = lines.findIndex(l => l.toLowerCase() === 'sponsored');
          if (sponsoredIdx > 0) {
            advertiserName = lines[sponsoredIdx - 1];
          }

          if (!advertiserName) {
            const links = Array.from(card.querySelectorAll('a'));
            for (const a of links) {
              const href = a.getAttribute('href') || '';
              const t = (a.innerText || '').trim();
              if (
                t &&
                (href.includes('facebook.com') || href.includes('/ads/library')) &&
                !t.includes('Library ID') &&
                !t.includes('See ad details') &&
                !t.includes('About the advertiser') &&
                !t.includes('Report ad')
              ) {
                advertiserName = t;
                break;
              }
            }
          }

          // 5. Platforms (Facebook, Instagram, Messenger, Audience Network)
          const platforms = new Set();
          const allDescendants = Array.from(card.querySelectorAll('*'));
          for (const el of allDescendants) {
            const aria =
              (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
            if (/facebook/i.test(aria)) platforms.add('Facebook');
            if (/instagram/i.test(aria)) platforms.add('Instagram');
            if (/messenger/i.test(aria)) platforms.add('Messenger');
            if (/audience network/i.test(aria)) platforms.add('Audience Network');

            const svgTitles = el.querySelectorAll('title');
            for (const st of svgTitles) {
              const stText = st.textContent || '';
              if (/facebook/i.test(stText)) platforms.add('Facebook');
              if (/instagram/i.test(stText)) platforms.add('Instagram');
              if (/messenger/i.test(stText)) platforms.add('Messenger');
              if (/audience network/i.test(stText)) platforms.add('Audience Network');
            }
          }
          const platformString = Array.from(platforms).join(', ') || 'Facebook, Instagram';

          // 6. Media URLs (Image / Video URL)
          let imageUrl = '';
          let videoUrl = '';

          const images = Array.from(card.querySelectorAll('img')).filter(img => {
            const src = img.getAttribute('src') || '';
            const width = img.naturalWidth || img.width || img.offsetWidth;
            const height = img.naturalHeight || img.height || img.offsetHeight;
            const isAvatar =
              (width > 0 && width <= 60) ||
              (height > 0 && height <= 60) ||
              src.includes('profile_pic') ||
              src.includes('rsrc.php');
            return src.startsWith('http') && !isAvatar;
          });
          if (images.length > 0) {
            imageUrl = images[0].getAttribute('src') || '';
          }

          const video = card.querySelector('video');
          if (video) {
            videoUrl = video.getAttribute('src') || '';
            if (!videoUrl) {
              const source = video.querySelector('source');
              if (source) videoUrl = source.getAttribute('src') || '';
            }
            if (!videoUrl && video.getAttribute('poster')) {
              videoUrl = video.getAttribute('poster') || '';
            }
            if (!imageUrl && video.getAttribute('poster')) {
              imageUrl = video.getAttribute('poster') || '';
            }
          }

          // 7. CTA Extraction
          let cta = '';
          let ctaEl = null;
          for (const kw of ctaKeywords) {
            const found = Array.from(card.querySelectorAll('button, a, [role="button"], div, span')).find(b => {
              return (b.innerText || '').trim().toLowerCase() === kw.toLowerCase() && b.children.length <= 1;
            });
            if (found) {
              cta = kw;
              ctaEl = found;
              break;
            }
          }

          // 8. Destination URL (Prioritize true landing pages, ignore advertiser profile links)
          let destinationUrl = '';
          const allAnchors = Array.from(card.querySelectorAll('a')).map(a => ({
            el: a,
            href: a.getAttribute('href') || '',
            decoded: decodeFbUrl(a.getAttribute('href') || '')
          }));

          const landingAnchors = allAnchors.filter(a => {
            const h = a.href;
            return (
              h.includes('l.facebook.com') ||
              (h.startsWith('http') &&
                !h.includes('/ads/library') &&
                !h.includes('facebook.com/policies') &&
                !h.includes('facebook.com/' + (advertiserName || '').toLowerCase()) &&
                !h.includes('instagram.com/'))
            );
          });

          if (landingAnchors.length > 0) {
            destinationUrl = landingAnchors[landingAnchors.length - 1].decoded;
          } else {
            const anyValid = allAnchors.filter(a => a.decoded && !a.href.includes('/ads/library'));
            if (anyValid.length > 0) destinationUrl = anyValid[anyValid.length - 1].decoded;
          }

          // 9. Detailed Headline, Description, and Display URL Extraction
          let displayUrl = '';
          let headline = '';
          let description = '';

          // Method A: Anchored via CTA button container tree
          let bottomCardBox = null;
          if (ctaEl) {
            let parent = ctaEl.parentElement;
            while (parent && parent !== card) {
              const pText = (parent.innerText || '').trim();
              if (pText.length > (cta || '').length && pText.length < 400 && !pText.includes('Sponsored')) {
                bottomCardBox = parent;
                break;
              }
              parent = parent.parentElement;
            }
          }

          if (bottomCardBox) {
            const boxLeaves = Array.from(bottomCardBox.querySelectorAll('*'))
              .filter(el => el.children.length === 0 && (el.innerText || el.textContent || '').trim())
              .map(el => {
                const s = window.getComputedStyle(el);
                return {
                  text: (el.innerText || el.textContent || '').trim(),
                  fontSize: parseFloat(s.fontSize) || 12,
                  fontWeight: parseInt(s.fontWeight, 10) || 400,
                  color: s.color
                };
              });

            const uniqueItems = [];
            const seenTexts = new Set();
            for (const item of boxLeaves) {
              if (
                !seenTexts.has(item.text) &&
                item.text.toLowerCase() !== (cta || '').toLowerCase() &&
                item.text !== advertiserName &&
                !item.text.includes('Library ID:') &&
                item.text !== 'Sponsored'
              ) {
                seenTexts.add(item.text);
                uniqueItems.push(item);
              }
            }

            const domainItem = uniqueItems.find(
              u =>
                /^[A-Z0-9-]+\.[A-Z]{2,}/i.test(u.text) &&
                !u.text.includes(' ') &&
                u.text.length < 50
            );

            if (domainItem) displayUrl = domainItem.text;

            const remaining = uniqueItems.filter(u => u !== domainItem);

            if (remaining.length >= 2) {
              headline = remaining[0].text;
              description = remaining[1].text;
            } else if (remaining.length === 1) {
              headline = remaining[0].text;
            }
          }

          // Method B: Fallback using line segmentation
          if (!headline || !description) {
            if (sponsoredIdx >= 0 && sponsoredIdx + 1 < lines.length) {
              const bodyLines = lines.slice(sponsoredIdx + 1);
              const lastCtaIdx = bodyLines.findIndex(
                l => cta && l.toLowerCase() === cta.toLowerCase()
              );

              if (lastCtaIdx > 0) {
                const bottomLines = bodyLines.slice(Math.max(0, lastCtaIdx - 3), lastCtaIdx);
                for (const bLine of bottomLines) {
                  if (
                    /^[A-Z0-9-]+\.[A-Z]{2,}/i.test(bLine) &&
                    !bLine.includes(' ') &&
                    bLine.length < 50
                  ) {
                    if (!displayUrl) displayUrl = bLine;
                  } else if (!headline && bLine !== displayUrl && bLine !== advertiserName) {
                    headline = bLine;
                  } else if (!description && bLine !== headline && bLine !== displayUrl && bLine !== advertiserName) {
                    description = bLine;
                  }
                }
              }
            }
          }

          // Method C: Fallback to link box elements
          if (!headline) {
            const linkBoxes = Array.from(card.querySelectorAll('a, [role="button"]')).filter(a => {
              const t = (a.innerText || '').trim();
              return t && t !== cta && !t.includes('Library ID') && !t.includes('Sponsored');
            });
            if (linkBoxes.length > 0) {
              headline = (linkBoxes[linkBoxes.length - 1].innerText || '').trim().split('\n')[0];
            }
          }

          // 10. Primary Text Extraction (Main caption / body text)
          const primaryTextLines = [];
          if (sponsoredIdx >= 0) {
            const candidateLines = lines.slice(sponsoredIdx + 1);
            for (const line of candidateLines) {
              if (
                line === displayUrl ||
                line === headline ||
                line === description ||
                (cta && line.toLowerCase() === cta.toLowerCase()) ||
                line.includes('0:00 /') ||
                line === '0:00' ||
                /^\d+:\d+$/.test(line) ||
                line.includes('Open Dropdown') ||
                line.includes('See summary details') ||
                line.includes('See ad details') ||
                line.includes('EU transparency') ||
                line.includes('This ad has multiple versions') ||
                line.includes('ads use this creative and text') ||
                line === advertiserName ||
                line === 'Sponsored'
              ) {
                if (line === displayUrl || line === headline || (cta && line.toLowerCase() === cta.toLowerCase())) {
                  break;
                }
                continue;
              }
              primaryTextLines.push(line);
            }
          }

          let primaryText = primaryTextLines.join('\n').trim();

          // Fallback for primary text
          if (!primaryText) {
            const textBlocks = Array.from(card.querySelectorAll('div, span, p')).filter(el => {
              const text = (el.innerText || '').trim();
              return (
                text.length > 15 &&
                !text.includes('Library ID:') &&
                !text.includes('Started running') &&
                !text.includes('See ad details') &&
                !text.includes('Sponsored') &&
                text !== headline &&
                text !== description &&
                el.children.length <= 1
              );
            });
            if (textBlocks.length > 0) {
              primaryText = (textBlocks[0].innerText || '').trim();
            }
          }

          items.push({
            libraryId,
            advertiserName: advertiserName || 'Advertiser',
            startDate: startDate || 'Started running on Recently',
            status,
            platforms: platformString,
            primaryText,
            headline: headline || advertiserName || 'Ad Creative',
            description: description || '',
            displayUrl: displayUrl || '',
            cta: cta || 'Learn More',
            destinationUrl,
            imageUrl,
            videoUrl,
            scrapedAt: new Date().toISOString()
          });
        }

        return items;
      });

      let newlyAdded = 0;
      for (const ad of extractedBatch) {
        const key = ad.libraryId || `${ad.advertiserName}::${ad.primaryText.slice(0, 30)}`;
        if (!adsMap.has(key)) {
          adsMap.set(key, ad);
          newlyAdded++;

          onProgress({
            type: 'ad',
            ad,
            count: adsMap.size,
            limit: maxLimit,
            percent: Math.min(100, Math.round((adsMap.size / maxLimit) * 100)),
            message: `Scraped ad #${adsMap.size}: "${ad.advertiserName}" [${ad.cta}]`
          });

          if (adsMap.size >= maxLimit) break;
        }
      }

      if (adsMap.size >= maxLimit) {
        onProgress({
          type: 'log',
          level: 'success',
          message: `Reached target limit of ${maxLimit} ads!`
        });
        break;
      }

      // Check if new ads were discovered in this scroll
      if (adsMap.size === previousCount) {
        consecutiveIdleScrolls++;
      } else {
        consecutiveIdleScrolls = 0;
      }
      previousCount = adsMap.size;

      scrollAttempts++;
      onProgress({
        type: 'log',
        level: 'progress',
        count: adsMap.size,
        limit: maxLimit,
        percent: Math.min(100, Math.round((adsMap.size / maxLimit) * 100)),
        message: `Scrolling down (Batch ${scrollAttempts} | Scraped: ${adsMap.size}/${maxLimit})...`
      });

      // Smooth scroll down to trigger next batch loading
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2.8);
      });

      // Wait for content to render
      await page.waitForTimeout(2200);
    }

    const finalResults = Array.from(adsMap.values());

    onProgress({
      type: 'complete',
      count: finalResults.length,
      limit: maxLimit,
      message: `Finished! Successfully scraped ${finalResults.length} ads.`
    });

    return finalResults;
  } catch (error) {
    onProgress({
      type: 'log',
      level: 'error',
      message: `Scraping error: ${error.message}`
    });
    throw error;
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}

module.exports = {
  scrapeMetaAds,
  normalizeTargetUrl
};
