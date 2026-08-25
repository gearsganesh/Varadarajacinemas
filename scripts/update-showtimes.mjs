import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const SOURCE = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const THEATRE = 'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai';
const ADDRESS = '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India';
const PLACEHOLDER = '/assets/posters/placeholder.svg';
const POSTER_DIR = path.join('assets', 'posters');
const LANGUAGES = ['Tamil','Telugu','Malayalam','English','Hindi','Kannada','Bengali','Marathi','Odia','Punjabi'];

const clean = value => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function indiaDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, day: String(Number(get('day'))), weekday: get('weekday') };
}

function normalizeTime(value) {
  const m = clean(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  return `${hour}:${m[2]} ${m[3].toUpperCase()}`;
}

function normalizeMovieKey(movie) {
  return `${clean(movie.title).toLowerCase()}|${clean(movie.language).toLowerCase()}|${clean(movie.format || '2D').toUpperCase()}`;
}

function parseRatingLanguage(line) {
  const m = clean(line).match(/^((?:UA\s*\d+\+)|(?:UA\d+\+)|(?:U\/A)|(?:UA)|(?:U)|(?:A))\s*\|\s*(.+)$/i);
  if (!m) return null;
  return { rating: m[1].replace(/\s+/g, '').toUpperCase(), language: clean(m[2]) };
}

function isLanguage(value) {
  return LANGUAGES.some(l => l.toLowerCase() === clean(value).toLowerCase());
}

function isAudi(value) { return /^AUDI\s*\d+$/i.test(clean(value)); }
function isTime(value) { return Boolean(normalizeTime(value)); }

function parseShowtimes(text) {
  const lines = String(text).split(/\r?\n/).map(clean).filter(Boolean);
  const variants = [];
  let current = null;
  let lastPotentialTitle = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    if (parseRatingLanguage(nextLine) && !isTime(line) && !isAudi(line) && !isLanguage(line)) {
      lastPotentialTitle = line;
      continue;
    }
    const header = parseRatingLanguage(line);
    if (header) {
      const title = lastPotentialTitle;
      if (title && !isLanguage(title) && !/^filters?$/i.test(title)) {
        current = { title, rating: header.rating, language: header.language, format: '2D', showtimes: [] };
        variants.push(current);
      } else current = null;
      continue;
    }

    if (!current) {
      if (line && !isTime(line) && !isAudi(line) && !/^filters?$/i.test(line) && !/^(?:\d{1,2}\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))$/i.test(line)) {
        lastPotentialTitle = line;
      }
      continue;
    }

    if (isLanguage(line)) {
      if (current.showtimes.length) {
        const next = { title: current.title, rating: current.rating, language: line, format: '2D', showtimes: [] };
        variants.push(next);
        current = next;
      } else {
        current.language = line;
      }
      continue;
    }

    if (/^3D$/i.test(line)) { current.format = '3D'; continue; }

    const time = normalizeTime(line);
    if (!time) continue;

    let audi = '';
    for (let j = i + 1; j <= Math.min(i + 6, lines.length - 1); j++) {
      if (isTime(lines[j]) || parseRatingLanguage(lines[j])) break;
      if (isAudi(lines[j])) { audi = clean(lines[j]).toUpperCase(); break; }
    }
    current.showtimes.push({ time, audi });
  }

  const merged = new Map();
  for (const movie of variants) {
    if (!movie.title || !movie.language || !movie.showtimes.length) continue;
    const key = normalizeMovieKey(movie);
    if (!merged.has(key)) merged.set(key, { ...movie, showtimes: [] });
    merged.get(key).showtimes.push(...movie.showtimes);
  }
  for (const movie of merged.values()) {
    const unique = new Map(movie.showtimes.map(s => [`${s.time}|${s.audi}`, s]));
    movie.showtimes = [...unique.values()];
  }
  return [...merged.values()];
}

function validateDateText(text, requested) {
  const compact = String(text).replace(/\s+/g, ' ');
  const marker = compact.match(new RegExp(`\\b${requested.day}\\s+${requested.weekday}\\b`, 'i'));
  if (!marker) throw new Error(`TicketNew browser did not confirm today's date (${requested.day} ${requested.weekday}).`);
}

async function selectToday(page, requested) {
  const candidates = page.getByText(requested.day, { exact: true });
  const count = Math.min(await candidates.count(), 20);
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.y > 450) continue;
    await el.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1800);
    return;
  }
}

async function extractPosterUrls(page) {
  return await page.locator('img').evaluateAll(imgs => imgs.map(img => ({ src: img.currentSrc || img.src, alt: img.alt || '' })));
}

async function downloadPoster(url, target) {
  if (!url || !/^https?:/i.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0];
    if (!type.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 3000) return null;
    const ext = type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg';
    const file = `${target}${ext}`;
    await fs.mkdir(POSTER_DIR, { recursive: true });
    await fs.writeFile(file, bytes);
    return `/assets/posters/${path.basename(file)}`;
  } catch { return null; }
}

function slugify(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100) || 'movie'; }

async function main() {
  const requested = indiaDateParts();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  try {
    await page.goto(SOURCE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await selectToday(page, requested);
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    validateDateText(body, requested);
    const movies = parseShowtimes(body);
    if (!movies.length) throw new Error('Browser extraction returned no movie/showtime entries.');

    const previous = await fs.readFile('showtimes.json','utf8').then(JSON.parse).catch(() => ({ movies: [] }));
    const previousByKey = new Map((previous.movies || []).map(m => [normalizeMovieKey(m), m]));
    const posters = await extractPosterUrls(page);

    for (const movie of movies) {
      const prev = previousByKey.get(normalizeMovieKey(movie));
      if (prev?.poster?.startsWith('/assets/posters/')) movie.poster = prev.poster;
      else {
        const match = posters.find(p => clean(p.alt).toLowerCase().includes(clean(movie.title).toLowerCase()));
        movie.poster = await downloadPoster(match?.src, path.join(POSTER_DIR, slugify(movie.title))) || PLACEHOLDER;
      }
      movie.bookingUrl = SOURCE;
    }

    const payload = {
      source: SOURCE,
      theatre: THEATRE,
      address: ADDRESS,
      fetchedAt: new Date().toISOString(),
      dataDate: requested.iso,
      refreshIntervalMinutes: 30,
      movies
    };

    const tmp = 'showtimes.json.tmp';
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, 'showtimes.json');
    console.log(`Published ${movies.length} movies for ${requested.iso}:`);
    for (const movie of movies) console.log(`- ${movie.title} / ${movie.language} / ${movie.format}: ${movie.showtimes.map(s => `${s.time} ${s.audi}`).join(', ')}`);
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exit(1); });
