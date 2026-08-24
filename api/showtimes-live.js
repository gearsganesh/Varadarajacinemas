const TICKETNEW_URL = 'https://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507';
const DISTRICT_URL = 'https://www.district.in/movies/varadharaja-cinemas-4k-dolby-atmos-in-chennai-CD1037507';
const LANGS = ['Tamil','Telugu','Malayalam','English','Hindi','Kannada','Bengali','Marathi','Odia','Punjabi'];

function indiaDate(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function clean(v){return String(v||'').replace(/\u00a0/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function htmlToText(v){return String(v||'').replace(/<script[\s\S]*?<\/script>/gi,'\n').replace(/<style[\s\S]*?<\/style>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li|h[1-6]|section|article)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")}
function isTime(s){return /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)}
function parse(text){
  const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean);
  const movieRe=/^(.*?)\s+((?:UA\d+\+)|(?:U\/A)|(?:UA)|(?:U)|(?:A))\s*\|\s*(.+)$/i;
  const movies=[];let current=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],m=line.match(movieRe);
    if(m){
      const details=m[3];
      current={title:clean(m[1]),rating:m[2].toUpperCase(),language:LANGS.find(x=>new RegExp('\\b'+x+'\\b','i').test(details))||'',format:/3D/i.test(details)?'3D':'2D',showtimes:[]};
      movies.push(current);continue;
    }
    if(!current)continue;
    const lang=LANGS.find(x=>new RegExp('^'+x+'$','i').test(line));
    if(lang){current.language=lang;continue}
    if(/^3D$/i.test(line)){current.format='3D';continue}
    if(isTime(line)){
      let audi='';
      for(let j=i+1;j<=Math.min(i+3,lines.length-1);j++){
        if(isTime(lines[j])||movieRe.test(lines[j]))break;
        if(/^AUDI\s*\d+$/i.test(lines[j])){audi=lines[j].toUpperCase();break}
      }
      current.showtimes.push({time:line.toUpperCase(),audi});
    }
  }
  const grouped=new Map();
  for(const m of movies){if(!m.title||!m.language||!m.showtimes.length)continue;const key=m.title+'|'+m.language+'|'+m.format;if(!grouped.has(key))grouped.set(key,{...m,showtimes:[]});grouped.get(key).showtimes.push(...m.showtimes)}
  return [...grouped.values()];
}
function hasRequestedDate(text,date){const day=String(Number(date.slice(8,10)));const m=String(text).match(/\b(\d{1,2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);return !m||m[1]===day}
async function fetchText(url,headers={}){
  const r=await fetch(url,{cache:'no-store',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36','Accept':'text/html,application/xhtml+xml,text/plain,*/*',...headers}});
  if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text();
}
async function poster(title){
  for(const q of [`${title} (2026 film)`,`${title} film`,title]){try{const r=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(q),{cache:'no-store',headers:{'User-Agent':'VaradarajaCinemas/1.0'}});if(!r.ok)continue;const d=await r.json();if(d?.originalimage?.source||d?.thumbnail?.source)return d.originalimage?.source||d.thumbnail.source}catch{}}
  return null;
}
async function addPosters(movies){const cache=new Map();for(const m of movies){const k=m.title.toLowerCase();if(!cache.has(k))cache.set(k,await poster(m.title));const p=cache.get(k);if(p)m.poster=p}return movies}
async function getLive(){
  const date=indiaDate();
  const ticketReader=`https://r.jina.ai/http://ticketnew.com/movies/chennai/varadaraja-cinemas-4k-rgb-laser-dolby-atmos-chennai-c/1037507?fromdate=${date}&refresh=${Date.now()}`;
  try{const text=await fetchText(ticketReader,{'X-No-Cache':'true','X-Return-Format':'markdown','X-Engine':'browser'});const movies=parse(text);if(movies.length&&hasRequestedDate(text,date))return {movies:await addPosters(movies),date,source:'ticketnew'};}catch(e){console.warn('TicketNew live fetch failed:',e.message)}
  try{const text=await fetchText(`https://r.jina.ai/http://www.district.in/movies/varadharaja-cinemas-4k-dolby-atmos-in-chennai-CD1037507?date=${date}&refresh=${Date.now()}`,{'X-No-Cache':'true','X-Return-Format':'markdown','X-Engine':'browser'});const movies=parse(text);if(movies.length)return {movies:await addPosters(movies),date,source:'ticketnew-compatible'};}catch(e){console.warn('Live fallback failed:',e.message)}
  try{const html=await fetchText(`${TICKETNEW_URL}?fromdate=${date}&refresh=${Date.now()}`);const movies=parse(htmlToText(html));if(movies.length)return {movies:await addPosters(movies),date,source:'ticketnew-direct'};}catch(e){console.warn('TicketNew direct fetch failed:',e.message)}
  throw new Error('Live TicketNew schedule unavailable');
}
export default async function handler(req,res){try{const data=await getLive();res.setHeader('Cache-Control','public, s-maxage=600, stale-while-revalidate=60');res.setHeader('Content-Type','application/json; charset=utf-8');res.status(200).json({theatre:'Varadaraja Cinemas 4K RGB Laser Dolby Atmos, Chennai',address:'190/2B, 1st Main Rd, Jothi Nagar, Chitlapakkam, Chennai, Tamil Nadu 600064, India',date:data.date,fetchedAt:new Date().toISOString(),source:data.source,movies:data.movies})}catch(e){console.error(e);res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Live cinema schedule temporarily unavailable'})}}
