const SOURCE = 'https://www.district.in/movies/varadharaja-cinemas-4k-dolby-atmos-in-chennai-CD1037507';
const FALLBACK_SOURCE = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const LANGS = ['Tamil','Telugu','Malayalam','English','Hindi','Kannada','Bengali','Marathi','Odia','Punjabi'];

function clean(s) {
  return String(s || '')
    .replace(/\\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\\s\\S]*?<\\/script>/gi, '\\n')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, '\\n')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, '\\n')
    .replace(/<br\\s*\\/?>/gi, '\\n')
    .replace(/<\\/(p|div|li|h[1-6]|section|article)>/gi, '\\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parseSchedule(text) {
  const lines = String(text).split(/\\r?\\n/).map(clean).filter(Boolean);
  const movies = [];
  let current = null;
  const movieLine = /^(?:[*-]\\s*)?(.+?)\\s+((?:UA\\d+\\+)|(?:U\\/A)|(?:A)|(?:U)|(?:UA))\\s*\\|\\s*(.+)$/i;
  const timeLine = /^(?:[*-]\\s*)?(\\d{1,2}:\\d{2}\\s*(?:AM|PM))$/i;
  const audiLine = /^(?:[*-]\\s*)?(AUDI\\s+\\d+|4K LASER[^\\n]*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(movieLine);
    if (m) {
      const details = m[3];
      const lang = LANGS.find(x => new RegExp(`\\b${x}\\b`, 'i').test(details)) || '';
      current = { title: clean(m[1]), rating: m[2].toUpperCase(), language: lang, format: /3D/i.test(details) ? '3D' : '2D', showtimes: [] };
      movies.push(current);
      continue;
    }
    if (!current) continue;
    const lang = LANGS.find(x => new RegExp(`^${x}$`, 'i').test(line));
    if (lang) { current.language = lang; continue; }
    if (/^3D$/i.test(line)) { current.format = '3D'; continue; }
    const tm = line.match(timeLine);
    if (tm) {
      let audi = '';
      for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
        const am = lines[j].match(audiLine);
        if (am) { audi = clean(am[1]).toUpperCase(); break; }
        if (timeLine.test(lines[j]) || movieLine.test(lines[j])) break;
      }
      current.showtimes.push({ time: tm[1].toUpperCase(), audi });
    }
  }

  const grouped = new Map();
  for (const movie of movies) {
    if (!movie.title || !movie.language || !movie.showtimes.length) continue;
    const key = `${movie.title}|${movie.language}|${movie.format}`;
    if (!grouped.has(key)) grouped.set(key, { ...movie, showtimes: [] });
    grouped.get(key).showtimes.push(...movie.showtimes);
  }
  return [...grouped.values()];
}

async function fetchText(url, headers = {}) {
  const r = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      ...headers
    }
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}

async function getSchedule() {
  const bust = Date.now();
  try {
    const html = await fetchText(`${SOURCE}?vr_refresh=${bust}`);
    const movies = parseSchedule(htmlToText(html));
    if (movies.length) return { movies, method: 'district' };
  } catch (e) {}

  try {
    const jinaUrl = `https://r.jina.ai/http://www.district.in/movies/varadharaja-cinemas-4k-dolby-atmos-in-chennai-CD1037507?vr_refresh=${bust}`;
    const text = await fetchText(jinaUrl, { 'X-No-Cache': 'true', 'X-Return-Format': 'markdown' });
    const movies = parseSchedule(text);
    if (movies.length) return { movies, method: 'jina-district' };
  } catch (e) {}

  try {
    const html = await fetchText(FALLBACK_SOURCE);
    const movies = parseSchedule(htmlToText(html));
    if (movies.length) return { movies, method: 'ticketnew' };
  } catch (e) {}

  throw new Error('Live cinema source unavailable');
}

export default async function handler(req, res) {
  try {
    const result = await getSchedule();
    res.setHeader('Cache-Control', 'public, s-maxage=28800, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      source: FALLBACK_SOURCE,
      liveSource: SOURCE,
      theatre: 'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai',
      address: '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India',
      fetchedAt: new Date().toISOString(),
      refreshIntervalHours: 8,
      method: result.method,
      movies: result.movies
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Live cinema schedule unavailable' });
  }
}
