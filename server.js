//──────────────────────────────────────────────────────────────────────────────
//  Komnottra backend — Express + FS storage (JSON + image uploads)
//  ────────────────────────────────────────────────────────────────────────────
//  • Adds createdAt timestamp when a new article is published
//  • Serves compressed images & tiny‑blur placeholders
//  • Provides backup / restore endpoints (ZIP)
//  • CORS restricted to komnottra.com + localhost
//──────────────────────────────────────────────────────────────────────────────

// Core & third‑party deps
const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const cors     = require('cors');
const archiver = require('archiver');
const multer   = require('multer');
const unzipper = require('unzipper');
const sharp    = require('sharp');

const app = express();                      // Init Express

//──────────────────────────────────────────────────────────────────────────────
// 1 · Persistent‑disk folders (Render)
//──────────────────────────────────────────────────────────────────────────────
const dataDir    = '/komnottra/data';       // project‑specific persistent dir
const uploadsDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir))    fs.mkdirSync(dataDir,    { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

console.log('[startup] uploads dir →', uploadsDir);

// Serve uploaded images (set correct Content‑Type)
app.use('/uploads', (req, _res, next) => {
  console.log('[GET] /uploads', req.originalUrl);
  next();
});
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, fp) => {
    if (fp.endsWith('.png'))  res.type('png');
    if (fp.endsWith('.jpg')||fp.endsWith('.jpeg')) res.type('jpeg');
    if (fp.endsWith('.webp')) res.type('webp');
    if (fp.endsWith('.gif'))  res.type('gif');
  }
}));

//──────────────────────────────────────────────────────────────────────────────
// 2 · Multer (image upload → /uploads)
//──────────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const uniq = Date.now() + '-' + Math.round(Math.random()*1e9);
      cb(null, `${file.fieldname}-${uniq}${path.extname(file.originalname)}`);
    }
  })
});

//──────────────────────────────────────────────────────────────────────────────
// 3 · Misc Express setup
//──────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
  'https://www.komnottra.com',
  'https://komnottra.com',
  'http://localhost:5000'
];
app.use(cors({
  origin: (origin, cb) => {
    console.log('[CORS]', origin);
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '5mb' }));

//──────────────────────────────────────────────────────────────────────────────
// 4 · JSON files helpers
//──────────────────────────────────────────────────────────────────────────────
const articlesFile   = path.join(dataDir, 'articles.json');
const categoriesFile = path.join(dataDir, 'categories.json');
if (!fs.existsSync(articlesFile))   fs.writeFileSync(articlesFile,   '[]');
if (!fs.existsSync(categoriesFile)) fs.writeFileSync(categoriesFile, '[]');
const readJSON  = f => JSON.parse(fs.readFileSync(f,'utf-8')||'[]');
const writeJSON = (f,d)=> fs.writeFileSync(f,JSON.stringify(d,null,2));

//──────────────────────────────────────────────────────────────────────────────
// 5 · Utility: slugify
//──────────────────────────────────────────────────────────────────────────────
const slugify = txt => txt.toString().toLowerCase()
  .normalize('NFKD')
  .replace(/\s+/g,'-')
  .replace(/[^\p{L}\p{N}-]+/gu,'')
  .replace(/--+/g,'-')
  .replace(/^-+|-+$/g,'');

//──────────────────────────────────────────────────────────────────────────────
// 6 · ROUTES
//──────────────────────────────────────────────────────────────────────────────
// GET single article by slug
app.get('/articles/slug/:slug', (req,res)=>{
  const art = readJSON(articlesFile);
  const slug = req.params.slug.toLowerCase().normalize('NFKD');
  const article = art.find(a=>a.slug?.toLowerCase().normalize('NFKD')===slug);
  if (!article) return res.status(404).json({message:'Article not found'});
  res.json(article);
});

// GET all articles (optional ?category= & ?excludeId=)
app.get('/articles', (req,res)=>{
  let arts = readJSON(articlesFile);
  const { category, excludeId } = req.query;
  if (category) {
    const cat = category.toLowerCase();
    arts = arts.filter(a=>{
      if (Array.isArray(a.category)) return a.category.some(c=>c.toLowerCase()===cat);
      if (typeof a.category==='string') return a.category.toLowerCase()===cat;
      return false;
    });
  }
  if (excludeId) {
    const ex = Number(excludeId);
    if (!isNaN(ex)) arts = arts.filter(a=>a.id!==ex);
  }
  res.json(arts);
});

// POST create article (adds createdAt)
app.post('/articles', upload.single('image'), async (req,res)=>{
  try {
    /* 1 ▸ Validate input ----------------------------------------------------*/
    const articles              = readJSON(articlesFile);
    const { title, content }    = req.body;
    let   { category }          = req.body;
    if (!title || typeof title!=='string') {
      return res.status(400).json({message:'Title is required (string)'});
    }
    // norm category → string|array|null
    if (Array.isArray(category)) {
      const uniq = [...new Set(category.map(c=>c.trim()).filter(Boolean))];
      category   = uniq.length===1 ? uniq[0] : uniq;
    } else if (typeof category==='string') {
      category = category.trim()||null;
    } else category = null;

    /* 2 ▸ Unique slug -------------------------------------------------------*/
    const baseSlug = slugify(title);
    let   slug     = baseSlug; let i=1;
    while (articles.some(a=>a.slug===slug)) slug = `${baseSlug}-${i++}`;

    /* 3 ▸ Image compression + blur -----------------------------------------*/
    let imageUrl=''; let blurDataUrl='';
    if (req.file) {
      const compressedName = `compressed-${req.file.filename}`;
      const compressedPath = path.join(uploadsDir, compressedName);
      const imgBuf = await sharp(req.file.path)
        .resize({width:1200,withoutEnlargement:true})
        .jpeg({quality:70}).toBuffer();
      fs.writeFileSync(compressedPath, imgBuf);
      imageUrl = `/uploads/${compressedName}`;
      const tinyBuf = await sharp(imgBuf).resize(20).blur().toBuffer();
      blurDataUrl = `data:image/jpeg;base64,${tinyBuf.toString('base64')}`;
      fs.unlinkSync(req.file.path); // remove original upload
    }

    /* 4 ▸ Build & save article (createdAt 👍) --------------------------------*/
    const newArticle = {
      id        : Date.now(),
      slug,
      title,
      content,
      category,
      imageUrl,
      blurDataUrl,
      createdAt : new Date().toISOString()
    };
    articles.unshift(newArticle);
    writeJSON(articlesFile, articles);
    res.status(201).json({message:'Article added', article:newArticle});
  } catch(e){
    console.error('Add article error:', e);
    res.status(500).json({message:'Internal server error'});
  }
});

// PUT update article by ID (with optional image upload)
app.put('/articles/:id', upload.single('image'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid article ID' });

    const articles = readJSON(articlesFile);
    const index = articles.findIndex(a => a.id === id);
    if (index === -1) return res.status(404).json({ message: 'Article not found' });

    // Extract fields from body
    const { title, content } = req.body;
    let { category } = req.body;

    // Validate title and content (optional)
    if (title && typeof title !== 'string') {
      return res.status(400).json({ message: 'Title must be a string' });
    }
    if (content && typeof content !== 'string') {
      return res.status(400).json({ message: 'Content must be a string' });
    }

    // Normalize category like in POST
    if (Array.isArray(category)) {
      const uniq = [...new Set(category.map(c => c.trim()).filter(Boolean))];
      category = uniq.length === 1 ? uniq[0] : uniq;
    } else if (typeof category === 'string') {
      category = category.trim() || null;
    } else {
      category = null;
    }

    // Get current article
    const article = articles[index];

    // If title changed, update slug
    if (title && title !== article.title) {
      const baseSlug = slugify(title);
      let slug = baseSlug;
      let i = 1;
      while (articles.some(a => a.slug === slug && a.id !== id)) {
        slug = `${baseSlug}-${i++}`;
      }
      article.slug = slug;
      article.title = title;
    } else if (title) {
      article.title = title;
    }

    if (content) article.content = content;
    if (category !== null) article.category = category;

    // Handle image upload (compress + blur) like POST
    if (req.file) {
      // Delete old image if exists
      if (article.imageUrl?.startsWith('/uploads/')) {
        const oldPath = path.join(dataDir, article.imageUrl);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (e) { console.error('Failed deleting old image', e); }
        }
      }

      const compressedName = `compressed-${req.file.filename}`;
      const compressedPath = path.join(uploadsDir, compressedName);
      const imgBuf = await sharp(req.file.path)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      fs.writeFileSync(compressedPath, imgBuf);

      article.imageUrl = `/uploads/${compressedName}`;

      const tinyBuf = await sharp(imgBuf).resize(20).blur().toBuffer();
      article.blurDataUrl = `data:image/jpeg;base64,${tinyBuf.toString('base64')}`;

      fs.unlinkSync(req.file.path); // remove original upload
    }

    articles[index] = article;
    writeJSON(articlesFile, articles);

    res.json({ message: 'Article updated', article });
  } catch (e) {
    console.error('Update article error:', e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE article (also removes local image)
app.delete('/articles/:id', (req,res)=>{
  const id = Number(req.params.id);
  const arts = readJSON(articlesFile);
  const art  = arts.find(a=>a.id===id);
  if (!art) return res.status(404).json({message:'Article not found'});
  if (art.imageUrl?.startsWith('/uploads/')) {
    const p = path.join(dataDir, art.imageUrl);
    if (fs.existsSync(p)) try { fs.unlinkSync(p);} catch(e){ console.error('img del',e);} }
  writeJSON(articlesFile, arts.filter(a=>a.id!==id));
  res.json({message:'Article & image deleted'});
});

// CATEGORY routes (GET/POST/DELETE)
app.get('/categories',(_q,res)=>res.json(readJSON(categoriesFile)));
app.post('/categories',(req,res)=>{
  const { category } = req.body;
  if (!category||typeof category!=='string'||!category.trim())
    return res.status(400).json({message:'Invalid category'});
  const cats = readJSON(categoriesFile);
  if (cats.includes(category)) return res.status(409).json({message:'Category exists'});
  cats.push(category); writeJSON(categoriesFile,cats);
  res.status(201).json({message:'Category added', category});
});
app.delete('/categories/:category',(req,res)=>{
  const target = decodeURIComponent(req.params.category);
  const cats = readJSON(categoriesFile);
  if (!cats.includes(target)) return res.status(404).json({message:'Category not found'});
  writeJSON(categoriesFile,cats.filter(c=>c!==target));
  res.json({message:'Category deleted'});
});

// BACKUP (zip) & RESTORE (upload zip)
app.get('/admin/backup',(_q,res)=>{
  const archive = archiver('zip',{zlib:{level:9}});
  res.attachment('backup.zip');
  archive.on('error',err=>{console.error(err);res.status(500).end();});
  archive.pipe(res);
  archive.file(articlesFile,{name:'articles.json'});
  archive.file(categoriesFile,{name:'categories.json'});
  archive.directory(uploadsDir,'uploads');
  archive.finalize();
});

app.post('/admin/restore',upload.single('backup'),async(req,res)=>{
  try {
    if (!req.file?.path) return res.status(400).json({message:'No file uploaded'});
    const zip = await unzipper.Open.file(req.file.path);
    const art = zip.files.find(f=>f.path==='articles.json');
    const cat = zip.files.find(f=>f.path==='categories.json');
    if (!art||!cat) return res.status(400).json({message:'Archive missing files'});
    fs.writeFileSync(articlesFile, await art.buffer());
    fs.writeFileSync(categoriesFile, await cat.buffer());
    await Promise.all(zip.files.map(async f=>{
      if (f.path.startsWith('uploads/')&&!f.path.endsWith('/')) {
        const dest = path.join(uploadsDir, f.path.replace('uploads/',''));
        fs.mkdirSync(path.dirname(dest),{recursive:true});
        fs.writeFileSync(dest, await f.buffer());
      }
    }));
    fs.unlinkSync(req.file.path);
    res.json({message:'Restore successful'});
  }catch(e){
    console.error('Restore error',e);
    res.status(500).json({message:'Internal restore error'});
  }
});

// Share (short URL with OG meta)
app.get('/share/:slug',(req,res)=>{
  const slug = req.params.slug.toLowerCase();
  const arts = readJSON(articlesFile);
  const art  = arts.find(a=>a.slug===slug);
  if (!art) return res.status(404).send('Article not found');
  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="utf-8" />
    <title>${art.title}</title>
    <meta property="og:title" content="${art.title}" />
    <meta property="og:description" content="${art.content.slice(0,100)}" />
    <meta property="og:image" content="${art.imageUrl}" />
    <meta http-equiv="refresh" content="0; url=/articles/slug/${slug}" />
    </head><body>
    Redirecting to article...
    </body></html>`;
  res.send(html);
});

// Start server
app.listen(PORT,()=>console.log(`[server] listening on port ${PORT}`));
