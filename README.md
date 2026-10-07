# Meta Ad Library Scraper

A Node.js + Playwright application for collecting publicly available Meta Ad Library ad data through a browser-based scraper and exploring the results in a real-time web UI.

> **Status:** Early-stage open-source project. The scraper depends on the current structure and behavior of Meta Ad Library pages, which may change without notice.

## What it does

- Search by Meta Ad Library URL, advertiser/brand query, or Page ID
- Scrape ad records with live progress updates
- Extract advertiser, start date, status, platforms, primary text, headline, description, CTA, destination URL, image URL, and video URL
- View results as a visual card gallery or data table
- Filter results by advertiser, keyword, platform, or CTA
- Export results as CSV or JSON
- Use headless Playwright Chromium for automated collection
- Stream scraper events to the browser using Server-Sent Events (SSE)

## Screenshots & demo

The project includes a browser-based GUI with a configuration panel, live scraping terminal, metrics dashboard, card gallery, and data table.

**Live demo:** Not currently hosted.

**Screenshots:** Screenshots will be added after the first public release/deployment. Until then, run the project locally to see the current interface.

## Extracted fields

| Field | Description |
|---|---|
| Advertiser | Advertiser/page name |
| Start date | Date the ad started running |
| Status | Active or inactive when detectable |
| Platforms | Facebook, Instagram, Messenger, Audience Network |
| Primary text | Main ad copy |
| Headline | Ad headline |
| Description | Secondary description |
| CTA | Call-to-action text |
| Destination URL | Decoded landing-page URL when available |
| Image URL | Creative image URL when available |
| Video URL | Video source/poster URL when available |

## Requirements

- Node.js 18+
- npm
- Chromium-compatible environment
- Internet access

## Local development

```bash
git clone https://github.com/mohsinkhan27-ai/meta-ad-scraper.git
cd meta-ad-scraper
npm install
npx playwright install chromium
npm start
```

Open:

```
http://localhost:3000
```

### Development mode

```bash
npm run dev
```

The current application uses Node.js, Express, Playwright, Tailwind CSS via CDN, and JSON/CSV export tooling.

## Docker

The repository includes a Playwright-based Dockerfile.

```bash
docker build -t meta-ad-scraper .
docker run --rm -p 3000:3000 meta-ad-scraper
```

Then open `http://localhost:3000`.

## Deployment

### Render

For a Docker deployment on Render:

1. Create a new **Web Service**.
2. Connect this repository.
3. Select **Docker** as the runtime.
4. Deploy using the repository's `Dockerfile`.
5. Expose port `3000`.
6. Verify the generated service URL.

The application reads the `PORT` environment variable, so hosted environments can provide their own port.

### Other Docker hosts

The same image can be deployed to any platform that supports Docker and permits Chromium/Playwright browser execution.

## Project structure

```text
.
├── public/
│   ├── index.html     # Web UI
│   └── app.js         # Client-side UI and SSE handling
├── scraper.js         # Playwright scraper and extraction logic
├── server.js          # Express API, SSE streaming and exports
├── Dockerfile
├── package.json
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
└── ROADMAP.md
```

## Responsible use

This project is intended for legitimate research, development, competitive intelligence, and analysis of information made publicly available through Meta Ad Library.

Users are responsible for complying with Meta's terms, applicable laws, website access rules, intellectual-property requirements, privacy requirements, and any other applicable policies. Do not use the project to access private data, bypass authentication, or collect information you are not authorized to access.

The project is not affiliated with, sponsored by, or endorsed by Meta.

## Contributing

Issues, bug reports, documentation improvements, and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

This project is released under the MIT License. See [LICENSE](LICENSE).

## Disclaimer

Meta Ad Library's HTML, APIs, behavior, and availability may change at any time. Extraction accuracy is therefore not guaranteed.