const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));

const dataDir = path.resolve(__dirname, "data");
const articlesFile = path.join(dataDir, "articles.json");
const categoriesFile = path.join(dataDir, "categories.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(articlesFile)) fs.writeFileSync(articlesFile, JSON.stringify([]));
if (!fs.existsSync(categoriesFile)) fs.writeFileSync(categoriesFile, JSON.stringify([]));

const readJSON = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`Failed to read file ${file}`, err);
    return [];
  }
};

const writeJSON = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to write file ${file}`, err);
  }
};

// === Articles Routes ===
app.get("/articles", (req, res) => {
  const articles = readJSON(articlesFile);
  res.json(articles);
});

app.post("/articles", (req, res) => {
  const articles = readJSON(articlesFile);
  const newArticle = { ...req.body, id: Date.now() };
  newArticle.slug = newArticle.title.toLowerCase().replace(/\s+/g, "-");
  articles.unshift(newArticle);
  writeJSON(articlesFile, articles);
  res.status(201).json({ message: "Article added", article: newArticle });
});

app.delete("/articles/:id", (req, res) => {
  const articles = readJSON(articlesFile);
  const id = parseInt(req.params.id);
  const updated = articles.filter(a => a.id !== id);
  if (updated.length === articles.length) {
    return res.status(404).json({ message: "Article not found" });
  }
  writeJSON(articlesFile, updated);
  res.json({ message: "Article deleted" });
});

// === Categories Routes ===
app.get("/categories", (req, res) => {
  const categories = readJSON(categoriesFile);
  res.json(categories);
});

app.post("/categories", (req, res) => {
  const { category } = req.body;
  if (!category || typeof category !== "string") {
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

// === Backup Routes ===
app.get("/admin/backup/download", (req, res) => {
  const articles = readJSON(articlesFile);
  const categories = readJSON(categoriesFile);
  res.setHeader("Content-Type", "application/json");
  res.json({ articles, categories });
});

app.post("/admin/backup/restore", (req, res) => {
  const { articles, categories } = req.body;
  if (!Array.isArray(articles) || !Array.isArray(categories)) {
    return res.status(400).json({ message: "Invalid backup data" });
  }
  writeJSON(articlesFile, articles);
  writeJSON(categoriesFile, categories);
  res.json({ message: "Backup restored successfully" });
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
