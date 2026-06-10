const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// OG preview cache (in-memory, reset on restart)
const ogCache = new Map();
const OG_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

const ogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '너무 많은 미리보기 요청입니다.' },
});

/**
 * GET /api/og-preview?url=https://...
 * Fetches Open Graph metadata for link previews
 */
router.get('/og-preview', ogLimiter, async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url 파라미터가 필요합니다.' });

    // Validate URL
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: '유효하지 않은 URL입니다.' }); }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'HTTP(S) URL만 지원합니다.' });
    }

    // Check cache
    const cached = ogCache.get(url);
    if (cached && Date.now() - cached.timestamp < OG_CACHE_TTL) {
      return res.json(cached.data);
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FamilyChatBot/1.0 (link preview)',
        'Accept': 'text/html',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return res.json({});

    const html = await response.text();
    const meta = parseOgTags(html, parsedUrl.origin);

    // Cache result
    ogCache.set(url, { data: meta, timestamp: Date.now() });
    if (ogCache.size > 500) {
      // Prune oldest entries
      const oldest = [...ogCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 100);
      oldest.forEach(([k]) => ogCache.delete(k));
    }

    res.json(meta);
  } catch (err) {
    if (err.name === 'AbortError') return res.json({});
    next(err);
  }
});

function parseOgTags(html, baseUrl) {
  const meta = {};

  const getTag = (prop) => {
    const match = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
    return match?.[1];
  };

  meta.title = getTag('og:title') || getTag('twitter:title')
    || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

  meta.description = getTag('og:description') || getTag('twitter:description')
    || getTag('description');

  let image = getTag('og:image') || getTag('twitter:image');
  if (image && !image.startsWith('http')) {
    image = image.startsWith('/') ? `${baseUrl}${image}` : `${baseUrl}/${image}`;
  }
  meta.image = image;

  meta.siteName = getTag('og:site_name');

  // Truncate
  if (meta.title) meta.title = meta.title.substring(0, 100);
  if (meta.description) meta.description = meta.description.substring(0, 200);

  return meta;
}

module.exports = router;
