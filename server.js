const express  = require("express");
const fs       = require("fs");
const path     = require("path");
const cors     = require("cors");
const archiver = require("archiver");
const multer   = require("multer");
const unzipper = require("unzipper");

const app = express(); // Initialize Express app

// ------------------------------------------------------------------
// Persistent-disk folders (Render)
// ------------------------------------------------------------------
const dataDir    = "/komnottra/data";
const uploadsDir = path.join(dataDir, "uploads");

if (!fs.existsSync(dataDir))    fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded images
app.use("/uploads", express.static(uploadsDir));

// ------------------------------------------------------------------
// Multer setup
// ------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    }
  })
});

// ------------------------------------------------------------------
// Misc setup
// ------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "https://www.komnottra.com",
  "https://komnottra.com",
  "http://localhost:5000"
];
app.use(cors({
  origin: (origin, cb) => {
    console.log("CORS from:", origin);
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error("Not allowed by CORS"));
  }
}));

app.use(express.json({ limit: "5mb" }));

// ------------------------------------------------------------------
// JSON files & helpers
// ------------------------------------------------------------------
const articlesFile   = path.join(dataDir, "articles.json");
const categoriesFile = path.join(dataDir, "categories.json");

if (!fs.existsSync(articlesFile))   fs.writeFileSync(articlesFile, "[]");
if (!fs.existsSync(categoriesFile)) fs.writeFileSync(categoriesFile, "[]");

const readJSON  = f => JSON.parse(fs.readFileSync(f, "utf-8") || "[]");
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ------------------------------------------------------------------
// ONE-TIME CLEANUP of duplicated category arrays
// ------------------------------------------------------------------
(function cleanArticlesFile() {
  const articles = readJSON(articlesFile);
  let changed = false;

  articles.forEach(a => {
    if (Array.isArray(a.category)) {
      const unique = [...new Set(a.category.map(c => c.trim()).filter(Boolean))];
      const cleaned = unique.length === 1 ? unique[0] : unique;
      if (JSON.stringify(cleaned) !== JSON.stringify(a.category)) {
        a.category = cleaned;
        changed = true;
      }
    }
  });

  if (changed) writeJSON(articlesFile, articles);
  if (changed) console.log("✅ Cleaned duplicate categories in articles.json");
})();

// ------------------------------------------------------------------
// Utils
// ------------------------------------------------------------------
const slugify = txt =>
  txt.toString().toLowerCase()
     .replace(/\s+/g, "-")
     .replace(/[^\w\-]+/g, "")
     .replace(/\-\-+/g, "-")
     .replace(/^-+/, "")
     .replace(/-+$/, "");

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

// --- Get article by slug ---
app.get("/articles/slug/:slug", (req, res) => {
  const articles = readJSON(articlesFile);
  const slug = req.params.slug.toLowerCase();
  const article = articles.find(a => a.slug?.toLowerCase() === slug);
  if (!article) return res.status(404).json({ message: "Article not found" });
  res.json(article);
});

// --- Get all articles (optional filtering) ---
app.get("/articles", (req, res) => {
  let articles = readJSON(articlesFile);
  const { category, excludeId } = req.query;

  if (category) {
    const catLower = category.toLowerCase();
    articles = articles.filter(a => {
      if (Array.isArray(a.category)) return a.category.some(c => c.toLowerCase() === catLower);
      if (typeof a.category === "string") return a.category.toLowerCase() === catLower;
      return false;
    });
  }

  if (excludeId) {
    const ex = Number(excludeId);
    if (!isNaN(ex)) articles = articles.filter(a => a.id !== ex);
  }

  res.json(articles);
});

// --- Create article ---
app.post("/articles", upload.single("image"), (req, res) => {
  try {
    const articles          = readJSON(articlesFile);
    const { title, content } = req.body;
    let   { category }       = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({ message: "Title is required and must be a string" });
    }

    // Normalize category
    if (Array.isArray(category)) {
      const unique = [...new Set(category.map(c => c.trim()).filter(Boolean))];
      category = unique.length === 1 ? unique[0] : unique;
    } else if (typeof category === "string") {
      category = category.trim() || null;
    } else {
      category = null;
    }

    // Unique slug
    const baseSlug = slugify(title);
    let slug = baseSlug, i = 1;
    while (articles.some(a => a.slug === slug)) slug = `${baseSlug}-${i++}`;

    const newArticle = {
      id       : Date.now(),
      slug,
      title,
      content,
      category,
      imageUrl : req.file ? `/uploads/${req.file.filename}` : ""
    };

    articles.unshift(newArticle);
    writeJSON(articlesFile, articles);
    res.status(201).json({ message: "Article added", article: newArticle });
  } catch (e) {
    console.error("Add article error:", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

// --- Delete article ---
app.delete("/articles/:id", (req, res) => {
  const articles = readJSON(articlesFile);
  const id = Number(req.params.id);
  const filtered = articles.filter(a => a.id !== id);
  if (filtered.length === articles.length) {
    return res.status(404).json({ message: "Article not found" });
  }
  writeJSON(articlesFile, filtered);
  res.json({ message: "Article deleted" });
});

// --- Categories ---
app.get("/categories", (_req, res) => res.json(readJSON(categoriesFile)));

app.post("/categories", (req, res) => {
  const { category } = req.body;
  if (!category || typeof category !== "string" || !category.trim())
    return res.status(400).json({ message: "Invalid category" });

  const cats = readJSON(categoriesFile);
  if (cats.includes(category)) return res.status(409).json({ message: "Category already exists" });

  cats.push(category);
  writeJSON(categoriesFile, cats);
  res.status(201).json({ message: "Category added", category });
});

app.delete("/categories/:category", (req, res) => {
  const target = decodeURIComponent(req.params.category);
  const cats = readJSON(categoriesFile);
  if (!cats.includes(target)) return res.status(404).json({ message: "Category not found" });

  writeJSON(categoriesFile, cats.filter(c => c !== target));
  res.json({ message: "Category deleted" });
});

// --- Admin backup ---
app.get("/admin/backup", (req, res) => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  res.attachment("backup.zip");
  archive.on("error", err => { console.error(err); res.status(500).end(); });
  archive.pipe(res);
  archive.file(articlesFile,   { name: "articles.json" });
  archive.file(categoriesFile, { name: "categories.json" });
  archive.finalize();
});

// --- Admin restore ---
app.post("/admin/restore", upload.single("backup"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const zip = await unzipper.Open.buffer(req.file.buffer);
    const art = zip.files.find(f => f.path === "articles.json");
    const cat = zip.files.find(f => f.path === "categories.json");
    if (!art || !cat) return res.status(400).json({ message: "Archive missing required files" });

    fs.writeFileSync(articlesFile, await art.buffer());
    fs.writeFileSync(categoriesFile, await cat.buffer());
    res.json({ message: "Restore successful" });
  } catch (e) {
    console.error("Restore error:", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/share/:slug", (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const articles = readJSON(articlesFile);
  const article = articles.find(a => a.slug === slug);

  if (!article) {
    return res.status(404).send("Article not found");
  }

  const imageUrl = article.imageUrl?.startsWith("http")
    ? article.imageUrl
    : `https://komnottra.com${article.imageUrl}`;

  const safeTitle = (article.title || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://komnottra.com/article.html?slug=${slug}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0; url=/article.html?slug=${slug}" />
  <title>${safeTitle}</title>
</head>
<body>
  Redirecting to article...
</body>
</html>
  `);
});

// ------------------------------------------------------------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
