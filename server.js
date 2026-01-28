import express from "express";
import cors from "cors";
import axios from "axios";
import Parser from "rss-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 5000;
const FEED_URL = process.env.FEED_URL || "https://venturesoft.ai/feed/";
// Configure RSS parser with custom headers and a sensible timeout
const parser = new Parser({
  requestOptions: {
    headers: {
      "User-Agent": "VentureSoftRSS/1.0 (+https://venturesoft.ai)",
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
    // node-fetch compatible timeout (ms)
    timeout: 10000,
  },
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());


// Simple in-memory cache for RSS results
let rssCache = {
  items: [],
  fetchedAt: 0,
};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: Date.now(), feedUrl: FEED_URL, cacheItems: rssCache.items.length, cacheAgeMs: rssCache.fetchedAt ? Date.now() - rssCache.fetchedAt : null });
});

// Helper to build an ETag string for current cache state
function buildRssETag() {
  if (!rssCache.fetchedAt) return '';
  return `W/"rss-${rssCache.fetchedAt}-${rssCache.items.length}"`;
}

// Fetch & parse VentureSoft RSS
app.get(["/api/rss", "/api/blogs"], async (req, res) => {
  try {
    const now = Date.now();
    const forceRefresh = String(req.query.refresh || "0") === "1";
    if (!forceRefresh && rssCache.items.length && now - rssCache.fetchedAt < CACHE_TTL_MS) {
      // If client sent If-None-Match and it matches our current ETag, return 304
      const currentETag = buildRssETag();
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && currentETag && ifNoneMatch === currentETag) {
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        res.setHeader('ETag', currentETag);
        res.setHeader('Last-Modified', new Date(rssCache.fetchedAt).toUTCString());
        return res.status(304).end();
      }
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      res.setHeader('ETag', currentETag);
      res.setHeader('Last-Modified', new Date(rssCache.fetchedAt).toUTCString());
      return res.json(rssCache.items);
    }

    const feedUrl = FEED_URL;
    const feed = await parser.parseURL(feedUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    console.log(`[RSS] Fetched ${items.length} items from ${feedUrl}`);
    // Only cache if we actually have items
    if (items.length > 0) {
      rssCache = { items, fetchedAt: now };
    } else {
      // Keep old cache if available, and respond with fresh (empty) items now
      // so the client sees the truth, but future requests can retry soon
      rssCache.fetchedAt = 0;
    }
    const freshETag = buildRssETag();
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.setHeader('ETag', freshETag);
    res.setHeader('Last-Modified', new Date(rssCache.fetchedAt).toUTCString());
    res.json(items); // send blog posts as JSON
  } catch (err) {
    // Log details on the server for debugging
    console.error("[RSS] Failed to fetch RSS feed:", {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      cause: err?.cause?.message || undefined,
      stack: err?.stack,
    });
    res.status(500).json({ error: "Failed to fetch RSS feed" });
  }
});

// Diagnostic endpoint to test outbound connectivity and SSL to the RSS source
app.get("/api/rss/debug", async (req, res) => {
  const feedUrl = (req.query.url && String(req.query.url)) || FEED_URL;
  try {
    const started = Date.now();
    const headResp = await axios.get(feedUrl, {
      timeout: 10000,
      headers: {
        "User-Agent": "VentureSoftRSS/1.0 (+https://venturesoft.ai)",
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
      validateStatus: () => true,
    });
    const ms = Date.now() - started;
    res.json({
      ok: headResp.status >= 200 && headResp.status < 400,
      status: headResp.status,
      statusText: headResp.statusText,
      timeMs: ms,
      contentType: headResp.headers['content-type'],
      length: headResp.headers['content-length'] || null,
      url: feedUrl,
    });
  } catch (e) {
    console.error("[RSS DEBUG] Connectivity test failed:", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || String(e), url: feedUrl });
  }
});

// Serve frontend static assets from dist
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// SPA fallback: send index.html for any non-API route (never catch /api/*)
app.get(/^\/(?!api\b).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});

