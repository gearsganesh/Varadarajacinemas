import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const READER = `https://r.jina.ai/http://${SOURCE.replace(/^https?:\/\//, '')}`;
const POSTER_DIR = path.join('assets', 'posters');

function clean(s) {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(s) {
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function decodeUrl(s) {
  return s.replace(/\\u0026/g, '&').replace(/\\u003d/g, '=').replace(/\\u002f/g, '/').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseShowtimes(markdown) {
  const lines = markdown.split(/\r?\n/).map(clean).filter(Boolean);
  const movies = [];
  let current = null;

  const movieLine = /^(?:\*\s*)?(.+?)\s+((?:UA\d+\+)|(?:U\/A)|(?:A)|(?:U))\s*\|\s*(.+)$/i;
  const timeLine = /^(?:\*\s*)?(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
  const audiLine = /^(?:\*\s*)?(AUDI\s+\d+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(movieLine);
    if (m) {
      current = { title: clean(m[1]), rating: m[2], language: '', format: '2D', showtimes: [] };
      movies.push(current);
      continue;
    }
    if (!current) continue;
    if (/^(Tamil|English|Telugu|Malayalam|Hindi|Kannada|Bengali|Marathi)$/i.test(line)) {
      current.language = line;
      continue;
    }
    if (/^3D$/i.test(line)) {
      current.format = '3D';
      continue;
    }
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
  const response = await fetch(url, { headers: { 'User-Agent': 'VaradharajaCinemasShowtimeUpdater/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function downloadImage(url, file) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'VaradharajaCinemasPosterUpdater/1.0', 'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' } });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 5000) return false;
    await fs.writeFile(file, buffer);
    return true;
  } catch {
    return false;
  }
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
  const wiki = await wikipediaPoster(title);
  if (wiki) return wiki;
  return bingPoster(title);
}

await fs.mkdir(POSTER_DIR, { recursive: true });

const response = await fetch(READER, {
  headers: { 'User-Agent': 'VaradharajaCinemasShowtimeUpdater/1.0' }
});
if (!response.ok) throw new Error(`TicketNew reader request failed: ${response.status}`);
const markdown = await response.text();
const movies = parseShowtimes(markdown);
if (movies.length === 0) throw new Error('No showtimes could be parsed. Existing showtimes.json was left untouched.');

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
    if (source) {
      const ok = await downloadImage(source, target);
      if (ok) poster = relative;
    }
    posterCache.set(key, poster);
  } else if (poster) {
    try {
      await fs.copyFile(path.join(POSTER_DIR, filename), target);
    } catch {}
  }
  movie.poster = poster || undefined;
}

const payload = {
  source: SOURCE,
  theatre: 'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai',
  address: '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India',
  fetchedAt: new Date().toISOString(),
  dataDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  refreshIntervalHours: 12,
  movies
};

await fs.writeFile('showtimes.json', JSON.stringify(payload, null, 2) + '\n');
console.log(`Updated ${movies.length} movie/language entries and poster assets.`);
