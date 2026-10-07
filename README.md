# 🚀 Meta Ad Library Scraper & GUI

A full-featured Node.js application built with **Playwright** and **Express** that scrapes the **Meta Ad Library** and offers a modern, real-time GUI with Tailwind CSS.

---

## 📸 Key Features

- **🎯 Direct Search & URL Support**: Enter a full Meta Ad Library URL, brand name (e.g. `Nike`, `Shopify`), or Page ID.
- **⚡ Live Streaming (SSE)**: Watch logs and newly scraped ads appear in real-time as the scraper scrolls through results.
- **📊 Metric Counters**: Tracks total scraped ads, media assets (images vs. videos), platforms, and scraping rate.
- **🎴 Visual Card Gallery & Data Table Views**: Toggle between rich visual ad cards and sortable data tables.
- **🔍 Instant Filtering**: Search by advertiser, keyword, platform, or CTA in real-time.
- **📥 Clean CSV & JSON Export**: One-click download with UTF-8 BOM encoding for Excel compatibility.
- **🛡️ Anti-Bot Evasion**: Configured with automated cookie banner dismissal and stealth headers.

---

## 📋 Extracted Ad Fields (10 Required Fields)

Each ad record extracts:
1. **Advertiser Name** (`advertiserName`): Header text of the ad card.
2. **Start Date** (`startDate`): Extracted date formatted as `"Started running on [Date]"`.
3. **Platforms** (`platforms`): Facebook, Instagram, Messenger, Audience Network.
4. **Primary Text** (`primaryText`): Main body caption text.
5. **Headline** (`headline`): Bold title text near the CTA button.
6. **Description** (`description`): Secondary text underneath the headline.
7. **CTA (Call to Action)** (`cta`): Text inside the main interactive button (e.g., `"Learn More"`, `"Shop Now"`).
8. **Destination URL** (`destinationUrl`): Target URL decoded directly from Meta link wrappers.
9. **Image URL** (`imageUrl`): High-resolution creative image URL.
10. **Video URL** (`videoUrl`): Video source URL or video thumbnail/poster URL.

---

## 🛠️ Installation & Setup

### 1. Install Node.js Dependencies
```bash
npm install
```

### 2. Install Playwright Chromium Browser
```bash
npx playwright install chromium
```

---

## 🏃‍♂️ How to Run

### Start the Express Server & GUI:
```bash
node server.js
```
*or via npm script:*
```bash
npm run scraper
```

Open your browser at:
```
👉 http://localhost:3000
```

---

## 📂 Project Architecture

```
├── scraper.js          # Core Playwright scraper engine with infinite scroll & DOM parser
├── server.js           # Express backend server with SSE streaming & CSV export endpoints
├── public/
│   ├── index.html      # Tailwind CSS GUI with live terminal, metrics, and cards
│   └── app.js          # Client-side SSE listener, filters, modal, and CSV downloader
├── package.json        # Dependencies & scripts
└── README.md           # Documentation
```
