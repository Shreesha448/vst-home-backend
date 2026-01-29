import express from "express";
import cors from "cors";
import axios from "axios";
import Parser from "rss-parser";
import authRoutes from "./auth-routes.js";
import { authenticateToken, generateSessionToken, storeSession, removeSession } from "./middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 5000;
const FEED_URL = process.env.FEED_URL || "https://venturesoft.ai/feed/";

// RSS parser config
const parser = new Parser({
  requestOptions: {
    headers: {
      "User-Agent": "VentureSoftRSS/1.0 (+https://venturesoft.ai)",
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
    timeout: 10000,
  },
});

app.use(cors());
app.use(express.json());

// Authentication routes
app.use('/api/auth', authRoutes);

// Protected routes middleware
app.use('/api/protected', authenticateToken);

// In-memory cache
let rssCache = {
  items: [],
  fetchedAt: 0,
};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Login endpoint - creates session after Microsoft auth
app.post('/api/login', async (req, res) => {
  try {
    const { user, tokens } = req.body;
    
    if (!user || !user.email) {
      return res.status(400).json({ error: 'Invalid user data' });
    }
    
    // Generate session token
    const sessionToken = generateSessionToken(user);
    
    // Store session with tokens
    storeSession(user.id, {
      user,
      tokens,
      sessionToken,
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        displayName: user.displayName,
      },
      token: sessionToken,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
app.post('/api/logout', authenticateToken, (req, res) => {
  try {
    removeSession(req.user.userId);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user info
app.get('/api/user', authenticateToken, (req, res) => {
  try {
    const session = getSession(req.user.userId);
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }
    
    res.json({
      user: session.user,
      lastAccessed: session.lastAccessed,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    time: Date.now(),
    feedUrl: FEED_URL,
    cacheItems: rssCache.items.length,
    cacheAgeMs: rssCache.fetchedAt
      ? Date.now() - rssCache.fetchedAt
      : null,
  });
});

// Build weak ETag
function buildRssETag() {
  if (!rssCache.fetchedAt) return "";
  return `W/"rss-${rssCache.fetchedAt}-${rssCache.items.length}"`;
}

// RSS endpoint
app.get(["/api/rss", "/api/blogs"], async (req, res) => {
  try {
    const now = Date.now();
    const forceRefresh = String(req.query.refresh || "0") === "1";

    if (
      !forceRefresh &&
      rssCache.items.length &&
      now - rssCache.fetchedAt < CACHE_TTL_MS
    ) {
      const currentETag = buildRssETag();
      const ifNoneMatch = req.headers["if-none-match"];

      if (ifNoneMatch && currentETag === ifNoneMatch) {
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("ETag", currentETag);
        return res.status(304).end();
      }

      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("ETag", currentETag);
      return res.json(rssCache.items);
    }

    const feed = await parser.parseURL(FEED_URL);
    const items = Array.isArray(feed.items) ? feed.items : [];

    if (items.length) {
      rssCache = { items, fetchedAt: now };
    }

    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("ETag", buildRssETag());
    res.json(items);
  } catch (err) {
    console.error("[RSS ERROR]", err?.message || err);
    res.status(500).json({ error: "Failed to fetch RSS feed" });
  }
});

// Debug endpoint
app.get("/api/rss/debug", async (req, res) => {
  const url = req.query.url || FEED_URL;
  try {
    const start = Date.now();
    const resp = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
    });

    res.json({
      ok: resp.status >= 200 && resp.status < 400,
      status: resp.status,
      timeMs: Date.now() - start,
      contentType: resp.headers["content-type"],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
