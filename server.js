import express from "express";
import cors from "cors";
import axios from "axios";
import Parser from "rss-parser";
import path from "path";
import { fileURLToPath } from "url";
import poshRoutes from "./routes/posh-routes.js";

import authRoutes from "./auth-routes.js";
import {

  authenticateToken,
  generateSessionToken,
  storeSession,
  removeSession,
} from "./middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 5000;
const FEED_URL = process.env.FEED_URL || "https://venturesoft.ai/feed/";

/* ------------------------------------------------------------------ */
/* 🔧 REQUIRED FOR STATIC FILES (ES MODULE FIX)                         */
/* ------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------------------------ */
/* 🔧 MIDDLEWARE                                                       */
/* ------------------------------------------------------------------ */
app.use(cors());
app.use(express.json());

/* ✅ SERVE STATIC FILES FROM /public */
app.use(express.static(path.join(__dirname, "public")));

/* ------------------------------------------------------------------ */
/* 🔐 AUTH ROUTES                                                      */
/* ------------------------------------------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/protected", authenticateToken);

/* ------------------------------------------------------------------ */
/* 🧠 IN-MEMORY RSS CACHE                                              */
/* ------------------------------------------------------------------ */
let rssCache = {
  items: [],
  fetchedAt: 0,
};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/* ------------------------------------------------------------------ */
/* 🔑 LOGIN / LOGOUT                                                   */
/* ------------------------------------------------------------------ */
app.post("/api/login", async (req, res) => {
  try {
    const { user, tokens } = req.body;

    if (!user || !user.email) {
      return res.status(400).json({ error: "Invalid user data" });
    }

    const sessionToken = generateSessionToken(user);

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
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});
app.post("/api/logout", authenticateToken, (req, res) => {
  try {
    removeSession(req.user.userId);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

/* ------------------------------------------------------------------ */
/* 🏥 HEALTH CHECK                                                     */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* 📰 RSS FEED                                                         */
/* ------------------------------------------------------------------ */
function buildRssETag() {
  if (!rssCache.fetchedAt) return "";
  return `W/"rss-${rssCache.fetchedAt}-${rssCache.items.length}"`;
}

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

app.use("/api/posh", poshRoutes);


/* ------------------------------------------------------------------ */
/* 🚀 START SERVER                                                     */
/* ------------------------------------------------------------------ */
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
