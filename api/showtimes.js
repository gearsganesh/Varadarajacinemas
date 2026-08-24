import fs from 'node:fs/promises';
import path from 'node:path';

export default async function handler(req, res) {
  try {
    const file = path.join(process.cwd(), 'showtimes.json');
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.movies) || data.movies.length === 0 || !data.dataDate) {
      throw new Error('showtimes.json is missing a valid cached schedule');
    }

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Cached showtimes API:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Cached cinema schedule temporarily unavailable' });
  }
}
