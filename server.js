const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");
const multer = require("multer");
const unzipper = require("unzipper");

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 5000;

// === CORS Setup ===
const allowedOrigins = [
  "https://www.komnottra.com",
  "https://komnottra.com",
  "http://localhost:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));

app.use(express.json({ limit: "5mb" }));

// === Use __dirname to locate data folder relative to app location ===
const dataDir = path.resolve(__dirname, "data");
const articlesFile = path.join(dataDir, "articles.json");
const categoriesFile = path.join(dataDir, "categories.json");

// === Ensure folder and files exist ===
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(articlesFile)) fs.writeFileSync(articlesFile, JSON.stringify([]));
if (!fs.existsSync(categoriesFile)) fs.writeFileSync(categoriesFile, JSON.stringify([]));

// === Read/Write Utilities ===
const readJSON = (file) => {
  try {
    const data = fs.readFileSync(file);
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read file:", file, err);
    return [];
  }
};

const writeJSON = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log("Successfully wrote to", file);
  } catch (err) {
    console.error("Failed to write file:", file, err);
  }
};

// === Utility: Slugify ===
const slugify = (text) => 
  text.toString().toLowerCase()
    .replace(/\s+/g, '-')           
    .replace(/[^\w\-]+/g, '')       
    .replace(/\-\-+/g, '-')         
    .replace(/^-+/, '')             
    .replace(/-+$/, '');            

// === Routes ===

// --- Articles ---
app.get("/articles/slug/:slug", (req, res) => {
  const articles = readJSON(articlesFile);
  const slug = req.params.slug.toLowerCase();
  const article = articles.find(a => a.slug && a.slug.toLowerCase() === slug);
  if (!article) return res.status(404).json({ message: "Article not found" });
  res.json(article);
});

app.get("/articles", (req, res) => {
  let articles = readJSON(articlesFile);
  const { category, excludeId } = req.query;
  if (category) {
    const categoryLower = category.toLowerCase();
    articles = articles.filter(article => article.category?.toLowerCase() === categoryLower);
  }
  if (excludeId) {
    const excludeIdNum = parseInt(excludeId);
    if (!isNaN(excludeIdNum)) {
      articles = articles.filter(article => article.id !== excludeIdNum);
    }
  }
  res.json(articles);
});

app.post("/articles", (req, res) => {
  try {
    const articles = readJSON(articlesFile);
    const { title } = req.body;
    if (!title || typeof title !== "string") {
      return res.status(400).json({ message: "Title is required and must be a string" });
    }
    const baseSlug = slugify(title);
    let slug = baseSlug;
    let suffix = 1;
    while (articles.some(a => a.slug === slug)) {
      slug = `${baseSlug}-${suffix++}`;
    }
    const newArticle = { ...req.body, id: Date.now(), slug };
    articles.unshift(newArticle);
    writeJSON(articlesFile, articles);
    res.status(201).json({ message: "Article added", article: newArticle });
  } catch (err) {
    console.error("Error adding article:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/articles/:id", (req, res) => {
  const articles = readJSON(articlesFile);
  const id = parseInt(req.params.id);
  const filtered = articles.filter(article => article.id !== id);
  if (filtered.length === articles.length) {
    return res.status(404).json({ message: "Article not found" });
  }
  writeJSON(articlesFile, filtered);
  res.json({ message: "Article deleted" });
});

// --- Categories ---
app.get("/categories", (req, res) => {
  const categories = readJSON(categoriesFile);
  res.json(categories);
});

app.post("/categories", (req, res) => {
  const { category } = req.body;
  if (!category || typeof category !== "string" || category.trim() === "") {
    return res.status(400).json({ message: "Invalid category" });
  }
  const categories = readJSON(categoriesFile);
  if (categories.includes(category)) {
    return res.status(409).json({ message: "Category already exists" });
  }
  categories.push(category);
  writeJSON(categoriesFile, categories);
  res.status(201).json({ message: "Category added", category });
});

app.delete("/categories/:category", (req, res) => {
  const categoryToDelete = decodeURIComponent(req.params.category);
  const categories = readJSON(categoriesFile);
  if (!categories.includes(categoryToDelete)) {
    return res.status(404).json({ message: "Category not found" });
  }
  const updated = categories.filter(cat => cat !== categoryToDelete);
  writeJSON(categoriesFile, updated);
  res.json({ message: "Category deleted" });
});

// --- Admin Backup & Restore ---

// Backup endpoint - archive articles.json and categories.json into backup.zip
app.get("/admin/backup", (req, res) => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  res.attachment("backup.zip");

  archive.on("error", err => {
    console.error("Archive error:", err);
    res.status(500).send({ message: "Archive error" });
  });

  archive.pipe(res);

  archive.file(articlesFile, { name: "articles.json" });
  archive.file(categoriesFile, { name: "categories.json" });

  archive.finalize();
});

// Restore endpoint - upload a zip containing articles.json and categories.json to restore data
app.post("/admin/restore", upload.single("backup"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const zip = await unzipper.Open.buffer(req.file.buffer);
    const articlesEntry = zip.files.find(f => f.path === "articles.json");
    const categoriesEntry = zip.files.find(f => f.path === "categories.json");

    if (!articlesEntry || !categoriesEntry) {
      return res.status(400).json({ message: "Missing articles.json or categories.json in archive" });
    }

    fs.writeFileSync(articlesFile, await articlesEntry.buffer());
    fs.writeFileSync(categoriesFile, await categoriesEntry.buffer());

    res.json({ message: "Restore successful" });
  } catch (err) {
    console.error("Restore error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
