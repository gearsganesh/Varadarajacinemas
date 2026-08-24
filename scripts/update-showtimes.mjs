import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const THEATRE = 'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai';
const ADDRESS = '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India';
const POSTER_DIR = path.join('assets', 'posters');
const TEMP_JSON = 'showtimes.json.tmp';
const LANGUAGES = ['Tamil', 'Telugu', 'Malayalam', 'English', 'Hindi', 'Kannada', 'Bengali', 'Marathi', 'Odia', 'Punjabi'];

// Existing known-good poster sources are kept only as fallbacks. New posters
// are first taken from TicketNew movie metadata and then cached locally.
const POSTER_FALLBACKS = {
  'jana nayagan': 'https://assets.thehansindia.com/h-upload/2025/11/06/1599461-untitled-design161.jpg',
  'dc': 'https://poster.gsc.com.my/2026/260805_DC_big.jpg',
  'spider-man: brand new day': 'https://image.tmdb.org/t/p/w500/yyB2VJEW3an2xCdcYCPQhn9QERR.jpg',
  'g.d.n': 'https://assets.voxcinemas.com/posters/P_HO00013355_1782144969910.jpg',
  'anbe diana': 'https://www.chennaipatrika.com/entertainment/uploads/images/image_750x_6a35376c48794.jpg'
};

const PLACEHOLDER = '/assets/posters/placeholder.svg';

function clean(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'movie';
}

function decodeUrl(value) {
  return String(value)
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u002f/g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function indiaDateParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type)?.value;
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    day: String(Number(get('day'))),
    weekday: get('weekday')
  };
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function isTime(value) {
  return /^(?:\d{1,2}):(?:[0-5]\d)\s*(?:AM|PM)$/i.test(clean(value));
}

function normalizeTime(value) {
  const m = clean(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  return `${hour}:${m[2]} ${m[3].toUpperCase()}`;
}

function normalizeRating(value) {
  return clean(value).replace(/\s+/g, '').toUpperCase();
}

function movieHeader(line) {
  const match = clean(line).match(/^(.*?)\s+((?:UA\s*\d+\+)|(?:UA\d+\+)|(?:U\/A)|(?:UA)|(?:U)|(?:A))\s*\|\s*(.+)$/i);
  if (!match) return null;
  const title = clean(match[1]);
  const rating = normalizeRating(match[2]);
  if (!title || !rating) return null;
  return { title, rating };
}

function languageLine(line) {
  const value = clean(line);
  return LANGUAGES.find(language => language.toLowerCase() === value.toLowerCase()) || null;
}

function normalizeMovieKey(movie) {
  return `${clean(movie.title).toLowerCase()}|${clean(movie.language).toLowerCase()}|${clean(movie.format || '2D').toUpperCase()}`;
}

function parseShowtimes(input) {
  const lines = String(input)
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

  const variants = [];
  let base = null;
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = movieHeader(line);

    if (header) {
      base = header;
      current = null;
      continue;
    }

    if (!base) continue;

    const language = languageLine(line);
    if (language) {
      current = {
        title: base.title,
        rating: base.rating,
        language,
        format: '2D',
        showtimes: []
      };
      variants.push(current);
      continue;
    }

    if (/^3D$/i.test(line)) {
      if (!current) continue;
      current.format = '3D';
      continue;
    }

    const time = normalizeTime(line);
    if (!time || !current) continue;

    let audi = '';
    for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
      if (isTime(lines[j]) || movieHeader(lines[j]) || languageLine(lines[j])) break;
      const match = clean(lines[j]).match(/^AUDI\s*\d+$/i);
      if (match) {
        audi = clean(match[0]).toUpperCase();
        break;
      }
    }

    current.showtimes.push({ time, audi });
  }

  const merged = new Map();
  for (const movie of variants) {
    if (!movie.title || !movie.language || !movie.showtimes.length) continue;
    const key = normalizeMovieKey(movie);
    if (!merged.has(key)) {
      merged.set(key, {
        ...movie,
        showtimes: []
      });
    }
    merged.get(key).showtimes.push(...movie.showtimes);
  }

  for (const movie of merged.values()) {
    const unique = new Map();
    for (const show of movie.showtimes) unique.set(`${show.time}|${show.audi}`, show);
    movie.showtimes = [...unique.values()];
  }

  return [...merged.values()];
}

function extractDateMarker(text) {
  const value = String(text).replace(/\s+/g, ' ');
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return { day: String(Number(iso[3])), iso: iso[0] };

  const marker = value.match(/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)?\s*(\d{1,2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);
  if (!marker) return null;
  return { day: String(Number(marker[1])), weekday: marker[2] };
}

function validateDate(text, requested) {
  const marker = extractDateMarker(text);
  if (!marker) throw new Error(`TicketNew response did not expose a date selector for ${requested.iso}. Refusing to publish unverified data.`);
  if (marker.day !== requested.day) throw new Error(`TicketNew returned day ${marker.day}, expected ${requested.day}. Refusing to publish stale schedule.`);
  if (marker.weekday && marker.weekday.toLowerCase() !== requested.weekday.toLowerCase()) {
    throw new Error(`TicketNew returned weekday ${marker.weekday}, expected ${requested.weekday}. Refusing to publish stale schedule.`);
  }
  if (marker.iso && marker.iso !== requested.iso) throw new Error(`TicketNew returned ${marker.iso}, expected ${requested.iso}.`);
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
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function extractMovieLinks(text) {
  const links = [];
  const markdown = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = markdown.exec(String(text))) !== null) {
    links.push({ label: clean(match[1]), url: decodeUrl(match[2]) });
  }

  const html = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = html.exec(String(text))) !== null) {
    links.push({ label: clean(htmlToText(match[2])), url: decodeUrl(match[1]) });
  }

  const unique = new Map();
  for (const link of links) {
    if (!link.url.includes('ticketnew.com')) continue;
    unique.set(`${link.label}|${link.url}`, link);
  }
  return [...unique.values()];
}

function findMovieLink(title, links) {
  const wanted = clean(title).toLowerCase();
  return links.find(link => {
    const label = clean(link.label).toLowerCase();
    return label === wanted || label.startsWith(`${wanted} `) || label.includes(`${wanted} `);
  })?.url || SOURCE;
}

function extractImageUrl(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /"image"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+)"/i
  ];
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match?.[1]) return decodeUrl(match[1]);
  }
  return null;
}

async function getTicketNewPoster(movieUrl) {
  if (!movieUrl || movieUrl === SOURCE) return null;
  try {
    const html = await fetchText(movieUrl);
    const poster = extractImageUrl(html);
    if (poster) return poster;
  } catch (error) {
    console.warn(`TicketNew movie metadata failed: ${error.message}`);
  }

  try {
    const readerUrl = `https://r.jina.ai/http://${movieUrl.replace(/^https?:\/\//, '')}`;
    const rendered = await fetchText(readerUrl, { 'X-No-Cache': 'true', 'X-Engine': 'browser' });
    const image = rendered.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/i)?.[1];
    if (image) return decodeUrl(image);
  } catch (error) {
    console.warn(`TicketNew reader metadata failed: ${error.message}`);
  }

  return null;
}

async function wikipediaPoster(title) {
  const candidates = [`${title} (2026 film)`, `${title} film`, title];
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(await fetchText(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate)}`));
      const source = json?.originalimage?.source || json?.thumbnail?.source;
      if (source) return source;
    } catch {}
  }
  return null;
}

async function downloadImage(url, targetBase) {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'VaradarajaCinemasPosterUpdater/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!type.startsWith('image/')) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 5000) return null;

    let ext = '.jpg';
    if (type === 'image/png') ext = '.png';
    else if (type === 'image/webp') ext = '.webp';
    else if (type === 'image/avif') ext = '.avif';

    const file = `${targetBase}${ext}`;
    await fs.writeFile(file, bytes);
    return `/assets/posters/${path.basename(file)}`;
  } catch {
    return null;
  }
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size >= 5000;
  } catch {
    return false;
  }
}

async function findExistingLocalPoster(movie, existingByKey) {
  const previous = existingByKey.get(normalizeMovieKey(movie));
  const candidate = previous?.poster || '';
  if (!candidate.startsWith('/assets/posters/')) return null;
  const file = candidate.replace(/^\//, '');
  return await fileExists(file) ? candidate : null;
}

async function ensurePoster(movie, movieLink, existingByKey) {
  const local = await findExistingLocalPoster(movie, existingByKey);
  if (local) return local;

  const slug = slugify(movie.title);
  const base = path.join(POSTER_DIR, slug);
  const sources = [];

  const ticketNewPoster = await getTicketNewPoster(movieLink);
  if (ticketNewPoster) sources.push(ticketNewPoster);

  const previous = existingByKey.get(normalizeMovieKey(movie));
  if (previous?.poster && /^https?:\/\//i.test(previous.poster)) sources.push(previous.poster);

  const fallback = POSTER_FALLBACKS[movie.title.toLowerCase()];
  if (fallback) sources.push(fallback);

  const wiki = await wikipediaPoster(movie.title);
  if (wiki) sources.push(wiki);

  const uniqueSources = [...new Set(sources)];
  for (const source of uniqueSources) {
    const localPath = await downloadImage(source, base);
    if (localPath) return localPath;
  }

  return PLACEHOLDER;
}

function validMovie(movie) {
  if (!movie || !clean(movie.title) || !clean(movie.language)) return false;
  if (!['2D', '3D'].includes(movie.format)) return false;
  if (!Array.isArray(movie.showtimes) || movie.showtimes.length === 0) return false;
  return movie.showtimes.every(show => normalizeTime(show.time) && (!show.audi || /^AUDI\s*\d+$/i.test(show.audi)));
}

function validateSchedule(movies, date) {
  if (!Array.isArray(movies) || movies.length === 0) throw new Error(`TicketNew returned no movies for ${date}.`);
  if (!movies.every(validMovie)) throw new Error('TicketNew returned malformed movie/showtime data. Existing showtimes.json was preserved.');

  const keys = new Set();
  for (const movie of movies) {
    const key = normalizeMovieKey(movie);
    if (keys.has(key)) throw new Error(`Duplicate movie/language/format entry detected: ${key}`);
    keys.add(key);
    const seenTimes = new Set();
    for (const show of movie.showtimes) {
      const time = normalizeTime(show.time);
      const showKey = `${time}|${clean(show.audi).toUpperCase()}`;
      if (seenTimes.has(showKey)) throw new Error(`Duplicate showtime detected for ${movie.title}: ${showKey}`);
      seenTimes.add(showKey);
    }
    if (!movie.poster || !movie.poster.startsWith('/assets/posters/')) {
      throw new Error(`Movie ${movie.title} has no valid local poster path.`);
    }
  }
}

function comparable(payload) {
  return JSON.stringify({
    source: payload.source,
    theatre: payload.theatre,
    address: payload.address,
    dataDate: payload.dataDate,
    movies: payload.movies
  });
}

async function readExisting() {
  try {
    return JSON.parse(await fs.readFile('showtimes.json', 'utf8'));
  } catch {
    return null;
  }
}

async function getTicketNewSchedule() {
  const requested = indiaDateParts();
  const directUrl = `${SOURCE}?fromdate=${requested.iso}&refresh=${Date.now()}`;
  const readerUrl = `https://r.jina.ai/http://${directUrl.replace(/^https?:\/\//, '')}`;
  let rendered = null;

  try {
    rendered = await fetchText(readerUrl, {
      'X-No-Cache': 'true',
      'X-Cache-Tolerance': '0',
      'X-Engine': 'browser',
      'X-Return-Format': 'markdown'
    });
    validateDate(rendered, requested);
    const movies = parseShowtimes(rendered);
    if (movies.length) return { movies, date: requested.iso, links: extractMovieLinks(rendered), method: 'ticketnew-reader' };
    throw new Error('TicketNew reader returned zero parsed movies.');
  } catch (error) {
    console.warn(`TicketNew reader failed: ${error.message}`);
  }

  try {
    const html = await fetchText(directUrl);
    const text = htmlToText(html);
    validateDate(text, requested);
    const movies = parseShowtimes(text);
    if (movies.length) return { movies, date: requested.iso, links: extractMovieLinks(html), method: 'ticketnew-direct' };
    throw new Error('TicketNew direct response returned zero parsed movies.');
  } catch (error) {
    throw new Error(`No fresh TicketNew schedule could be validated for ${requested.iso}. ${error.message}`);
  }
}

await fs.mkdir(POSTER_DIR, { recursive: true });

// Always read the previous cache before touching it. If TicketNew fails above,
// this script exits before showtimes.json is modified.
const existing = await readExisting();
const existingMovies = Array.isArray(existing?.movies) ? existing.movies : [];
const existingByKey = new Map(existingMovies.map(movie => [normalizeMovieKey(movie), movie]));

const schedule = await getTicketNewSchedule();
const links = schedule.links || [];

const movies = [];
for (const rawMovie of schedule.movies) {
  const movie = {
    title: clean(rawMovie.title),
    rating: normalizeRating(rawMovie.rating),
    language: clean(rawMovie.language),
    format: rawMovie.format === '3D' ? '3D' : '2D',
    bookingUrl: findMovieLink(rawMovie.title, links),
    showtimes: rawMovie.showtimes.map(show => ({
      time: normalizeTime(show.time),
      audi: clean(show.audi).toUpperCase()
    }))
  };
  movie.poster = await ensurePoster(movie, movie.bookingUrl, existingByKey);
  movies.push(movie);
}

validateSchedule(movies, schedule.date);

const payload = {
  source: SOURCE,
  theatre: THEATRE,
  address: ADDRESS,
  fetchedAt: existing?.fetchedAt || new Date().toISOString(),
  dataDate: schedule.date,
  refreshIntervalHours: 2,
  movies
};

if (existing && comparable(existing) === comparable(payload)) {
  console.log(`TicketNew schedule validated for ${schedule.date}; no data or poster-path changes detected. showtimes.json left untouched.`);
  await fs.rm(TEMP_JSON, { force: true });
  process.exit(0);
}

payload.fetchedAt = new Date().toISOString();
const json = JSON.stringify(payload, null, 2) + '\n';
await fs.writeFile(TEMP_JSON, json, 'utf8');

// Parse the temporary file one final time before the atomic replacement.
const verified = JSON.parse(await fs.readFile(TEMP_JSON, 'utf8'));
validateSchedule(verified.movies, schedule.date);
await fs.rename(TEMP_JSON, 'showtimes.json');

console.log(`Published ${movies.length} movie/language/format entries for ${schedule.date} using ${schedule.method}.`);
