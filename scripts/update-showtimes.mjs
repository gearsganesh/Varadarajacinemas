import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const POSTER_DIR = path.join('assets', 'posters');
const POSTER_FALLBACKS = {
  'jana nayagan': 'https://assets.thehansindia.com/h-upload/2025/11/06/1599461-untitled-design161.jpg',
  'dc': 'https://poster.gsc.com.my/2026/260805_DC_big.jpg',
  'spider-man: brand new day': 'https://image.tmdb.org/t/p/w500/yyB2VJEW3an2xCdcYCPQhn9QERR.jpg',
  'g.d.n': 'https://assets.voxcinemas.com/posters/P_HO00013355_1782144969910.jpg',
  'anbe diana': 'https://www.chennaipatrika.com/entertainment/uploads/images/image_750x_6a35376c48794.jpg'
};

function clean(s) { return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function slugify(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100); }
function decodeUrl(s) { return s.replace(/\\u0026/g, '&').replace(/\\u003d/g, '=').replace(/\\u002f/g, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\'); }

function parseShowtimes(markdown) {
  const lines = markdown.split(/\r?\n/).map(clean).filter(Boolean);
  const movies = [];
  let current = null;
  const movieLine = /^(?:\*\s*)?(.+?)\s+((?:UA\d+\+)|(?:U\/A)|(?:A)|(?:U)|(?:UA))\s*\|\s*(.+)$/i;
  const timeLine = /^(?:\*\s*)?(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
  const audiLine = /^(?:\*\s*)?(AUDI\s+\d+)$/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(movieLine);
    if (m) { current = { title: clean(m[1]), rating: m[2], language: '', format: '2D', showtimes: [] }; movies.push(current); continue; }
    if (!current) continue;
    if (/^(Tamil|English|Telugu|Malayalam|Hindi|Kannada|Bengali|Marathi)$/i.test(line)) { current.language = line; continue; }
    if (/^3D$/i.test(line)) { current.format = '3D'; continue; }
    const tm = line.match(timeLine);
    if (tm) {
      let audi = '';
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        const am = lines[j].match(audiLine);
        if (am) { audi = am[1].toUpperCase(); break; }
        if (timeLine.test(lines[j]) || movieLine.test(lines[j])) break;
      }
      current.showtimes.push({ time: tm[1].toUpperCase(), audi });
    }
  }
  return movies.filter(m => m.title && m.language && m.showtimes.length);
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,text/plain,*/*'
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function getTicketNewSchedule() {
  const cacheBust = `?vr_refresh=${Date.now()}`;
  // Prefer TicketNew itself. The previous implementation used a cached reader,
  // which could leave the site showing schedules from an older date.
  try {
    const direct = await fetchText(SOURCE + cacheBust);
    const parsed = parseShowtimes(direct);
    if (parsed.length) return { text: direct, movies: parsed, method: 'direct' };
  } catch (error) {
    console.warn(`Direct TicketNew fetch failed: ${error.message}`);
  }

  // Fallback for environments where TicketNew requires rendered HTML.
  const reader = `https://r.jina.ai/http://${SOURCE.replace(/^https?:\/\//, '')}${cacheBust}`;
  const rendered = await fetchText(reader);
  const parsed = parseShowtimes(rendered);
  if (!parsed.length) throw new Error('No showtimes could be parsed from the current TicketNew page. Existing showtimes.json was left untouched.');
  return { text: rendered, movies: parsed, method: 'reader' };
}

async function downloadImage(url, file) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'VaradharajaCinemasPosterUpdater/1.0', 'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }, cache: 'no-store' });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 5000) return false;
    await fs.writeFile(file, buffer);
    return true;
  } catch { return false; }
}

async function wikipediaPoster(title) {
  const candidates = [`${title} (2026 film)`, `${title} film`, title];
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(await fetchText(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate)}`));
      const source = json?.thumbnail?.source || json?.originalimage?.source;
      if (source) return source;
    } catch {}
  }
  return null;
}

async function bingPoster(title) {
  try {
    const query = encodeURIComponent(`${title} 2026 movie poster`);
    const html = await fetchText(`https://www.bing.com/images/search?q=${query}&form=HDRSC2&first=1`);
    const urls = [];
    const re = /"murl":"(.*?)"/g;
    let match;
    while ((match = re.exec(html)) !== null) {
      const url = decodeUrl(match[1]);
      if (/^https?:\/\//i.test(url) && !/pinterest|facebook|instagram/i.test(url)) urls.push(url);
    }
    for (const url of urls.slice(0, 12)) {
      if (/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url) || /image|poster|photo/i.test(url)) return url;
    }
  } catch {}
  return null;
}

async function findPoster(title) {
  const key = title.toLowerCase();
  if (POSTER_FALLBACKS[key]) return POSTER_FALLBACKS[key];
  const wiki = await wikipediaPoster(title);
  return wiki || bingPoster(title);
}

await fs.mkdir(POSTER_DIR, { recursive: true });
const schedule = await getTicketNewSchedule();
const movies = schedule.movies;
console.log(`TicketNew schedule parsed using ${schedule.method} fetch: ${movies.length} movie/language entries.`);

const posterCache = new Map();
for (const movie of movies) {
  const key = movie.title.toLowerCase();
  const filename = `${slugify(movie.title)}.jpg`;
  const relative = `/assets/posters/${filename}`;
  const target = path.join(POSTER_DIR, filename);
  let poster = posterCache.get(key);
  if (poster === undefined) {
    const source = await findPoster(movie.title);
    poster = null;
    if (source && await downloadImage(source, target)) poster = relative;
    else if (source) poster = source;
    posterCache.set(key, poster);
  }
  movie.poster = poster || undefined;
}

const payload = {
  source: SOURCE,
  theatre: 'Varadharaja Cinemas 4K RGB Laser Dolby Atmos, Chennai',
  address: '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India',
  fetchedAt: new Date().toISOString(),
  dataDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  refreshIntervalHours: 12,
  movies
};
await fs.writeFile('showtimes.json', JSON.stringify(payload, null, 2) + '\n');
console.log(`Updated ${movies.length} movie/language entries and poster assets.`);
