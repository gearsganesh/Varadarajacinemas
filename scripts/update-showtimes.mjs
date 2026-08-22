import fs from 'node:fs/promises';

const SOURCE = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const READER = `https://r.jina.ai/http://${SOURCE.replace(/^https?:\/\//, '')}`;

function clean(s) {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseShowtimes(markdown) {
  const lines = markdown.split(/\r?\n/).map(clean).filter(Boolean);
  const movies = [];
  let current = null;
  let currentLanguage = '';
  let currentFormat = '2D';

  const movieLine = /^(?:\*\s*)?(.+?)\s+((?:UA\d+\+)|(?:U\/A)|(?:A)|(?:U))\s*\|\s*(.+)$/i;
  const timeLine = /^(?:\*\s*)?(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
  const audiLine = /^(?:\*\s*)?(AUDI\s+\d+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(movieLine);
    if (m) {
      current = { title: clean(m[1]), rating: m[2], language: '', format: '2D', showtimes: [] };
      currentLanguage = '';
      currentFormat = '2D';
      movies.push(current);
      continue;
    }

    if (!current) continue;
    if (/^(Tamil|English|Telugu|Malayalam|Hindi|Kannada|Bengali|Marathi)$/i.test(line)) {
      currentLanguage = line;
      current.language = line;
      continue;
    }
    if (/^3D$/i.test(line)) {
      currentFormat = '3D';
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

  const filtered = movies.filter(m => m.title && m.language && m.showtimes.length);
  const deduped = [];
  const seen = new Set();
  for (const movie of filtered) {
    const key = `${movie.title}|${movie.language}|${movie.format}|${movie.showtimes.map(s => s.time + s.audi).join(',')}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(movie); }
  }
  return deduped;
}

const response = await fetch(READER, {
  headers: { 'User-Agent': 'VaradharajaCinemasShowtimeUpdater/1.0' }
});
if (!response.ok) throw new Error(`TicketNew reader request failed: ${response.status}`);
const markdown = await response.text();
const movies = parseShowtimes(markdown);
if (movies.length === 0) throw new Error('No showtimes could be parsed. Existing showtimes.json was left untouched.');

const payload = {
  source: SOURCE,
  theatre: 'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai',
  address: '190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India',
  fetchedAt: new Date().toISOString(),
  dataDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  movies
};

await fs.writeFile('showtimes.json', JSON.stringify(payload, null, 2) + '\n');
console.log(`Updated ${movies.length} movie/language entries from TicketNew.`);
