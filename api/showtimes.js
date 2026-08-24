const DISTRICT_URL = 'https://www.district.in/movies/varadharaja-cinemas-4k-dolby-atmos-in-chennai-CD1037507';
const TICKETNEW_URL = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const LANGS = ['Tamil', 'Telugu', 'Malayalam', 'English', 'Hindi', 'Kannada', 'Bengali', 'Marathi', 'Odia', 'Punjabi'];

function clean(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function isTime(line) {
  return /^(\d{1,2}:\d{2})\s*(AM|PM)$/i.test(line.trim());
}

function parseSchedule(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => clean(line))
    .filter(Boolean);

  const moviePattern = /^(.*?)\s+((?:UA\d+\+)|(?:U\/A)|(?:UA)|(?:U)|(?:A))\s*\|\s*(.+)$/i;
  const movies = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(moviePattern);

    if (match) {
      const details = match[3];
      const language = LANGS.find(lang => new RegExp('\\b' + lang + '\\b', 'i').test(details)) || '';
      current = {
        title: clean(match[1]),
        rating: match[2].toUpperCase(),
        language,
        format: /3D/i.test(details) ? '3D' : '2D',
        showtimes: []
      };
      movies.push(current);
      continue;
    }

    if (!current) continue;

    const language = LANGS.find(lang => new RegExp('^' + lang + '$', 'i').test(line));
    if (language) {
      current.language = language;
      continue;
    }

    if (/^3D$/i.test(line)) {
      current.format = '3D';
      continue;
    }

    if (isTime(line)) {
      let auditorium = '';
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        if (isTime(lines[j]) || moviePattern.test(lines[j])) break;
        if (/^(EGA|ANU|VARADARAJA|SCREEN|AUDI|AUDITORIUM)/i.test(lines[j])) {
          auditorium = clean(lines[j]);
          break;
        }
      }
      current.showtimes.push({ time: line.toUpperCase(), audi: auditorium });
    }
  }

  const grouped = new Map();
  for (const movie of movies) {
    if (!movie.title || !movie.language || movie.showtimes.length === 0) continue;
    const key = movie.title + '|' + movie.language + '|' + movie.format;
    if (!grouped.has(key)) grouped.set(key, { ...movie, showtimes: [] });
    grouped.get(key).showtimes.push(...movie.showtimes);
  }

  return Array.from(grouped.values());
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      ...headers
    }
  });
  if (!response.ok) throw new Error(response.status + ' ' + url);
  return response.text();
}

async function findPoster(title) {
  const candidates = [title + ' (2026 film)', title + ' film', title];
  for (const candidate of candidates) {
    try {
      const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(candidate), {
        cache: 'no-store',
        headers: { 'User-Agent': 'VaradarajaCinemas/1.0' }
      });
      if (!response.ok) continue;
      const data = await response.json();
      const poster = data && data.originalimage && data.originalimage.source
        ? data.originalimage.source
        : data && data.thumbnail && data.thumbnail.source;
      if (poster) return poster;
    } catch (_) {}
  }
  return null;
}

async function attachPosters(movies) {
  const cache = new Map();
  for (const movie of movies) {
    const key = movie.title.toLowerCase();
    if (!cache.has(key)) cache.set(key, await findPoster(movie.title));
    const poster = cache.get(key);
    if (poster) movie.poster = poster;
  }
  return movies;
}

async function getSchedule() {
  const cacheBust = Date.now();

  try {
    const text = await fetchText('https://r.jina.ai/http://www.district.in/movies/varadharaja-cinemas-4k-dolby-atmos-in-chennai-CD1037507?refresh=' + cacheBust, {
      'X-No-Cache': 'true',
      'X-Return-Format': 'markdown'
    });
    const movies = parseSchedule(text);
    if (movies.length) return { movies: await attachPosters(movies), method: 'district-jina' };
  } catch (_) {}

  try {
    const html = await fetchText(DISTRICT_URL + '?refresh=' + cacheBust);
    const movies = parseSchedule(htmlToText(html));
    if (movies.length) return { movies: await attachPosters(movies), method: 'district' };
  } catch (_) {}

  try {
    const html = await fetchText(TICKETNEW_URL);
    const movies = parseSchedule(htmlToText(html));
    if (movies.length) return { movies: await attachPosters(movies), method: 'ticketnew' };
  } catch (_) {}

  throw new Error('Live cinema schedule unavailable from District/Jina/TicketNew');
}

export default async function handler(req, res) {
  try {
    const result = await getSchedule();
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      theatre: 'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai',
      address: '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India',
      fetchedAt: new Date().toISOString(),
      refreshIntervalMinutes: 30,
      method: result.method,
      movies: result.movies
    });
  } catch (error) {
    console.error('showtimes API error:', error && error.message ? error.message : error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Live cinema schedule temporarily unavailable' });
  }
}
