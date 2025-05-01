const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// === CORS Setup ===
const allowedOrigins = [
  "https://www.komnottra.com",
  "https://komnottra.com",
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

// === JSON Parsing Limit (increased for image size) ===
app.use(express.json({ limit: "5mb" }));

// === Data Files ===
const dataDir = path.join(__dirname, "data");
const articlesFile = path.join(dataDir, "articles.json");
const categoriesFile = path.join(dataDir, "categories.json");

// === Ensure Data Directory and Files Exist ===
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

if (!fs.existsSync(articlesFile)) fs.writeFileSync(articlesFile, JSON.stringify([]));
if (!fs.existsSync(categoriesFile)) fs.writeFileSync(categoriesFile, JSON.stringify([]));

const readJSON = (file) => JSON.parse(fs.readFileSync(file));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// === Routes ===

// --- Articles ---
app.get("/articles", (req, res) => {
  try {
    const articles = readJSON(articlesFile);
    res.json(articles);
  } catch (err) {
    res.status(500).json({ message: "Failed to read articles", error: err.message });
  }
});

app.post("/articles", (req, res) => {
  try {
    const articles = readJSON(articlesFile);
    const newArticle = { ...req.body, id: Date.now() };
    articles.unshift(newArticle);
    writeJSON(articlesFile, articles);
    res.status(201).json({ message: "Article added", article: newArticle });
  } catch (err) {
    res.status(500).json({ message: "Failed to save article", error: err.message });
  }
});

app.delete("/articles/:id", (req, res) => {
  try {
    const articles = readJSON(articlesFile);
    const id = parseInt(req.params.id);
    const filtered = articles.filter(article => article.id !== id);
    if (filtered.length === articles.length) {
      return res.status(404).json({ message: "Article not found" });
    }
    writeJSON(articlesFile, filtered);
    res.json({ message: "Article deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete article", error: err.message });
  }
});

// --- Categories ---
app.get("/categories", (req, res) => {
  try {
    const categories = readJSON(categoriesFile);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to read categories", error: err.message });
  }
});

app.post("/categories", (req, res) => {
  try {
    const { category } = req.body;
    if (!category) return res.status(400).json({ message: "Category is required" });

    const categories = readJSON(categoriesFile);
    if (categories.includes(category)) return res.status(409).json({ message: "Category already exists" });

    categories.push(category);
    writeJSON(categoriesFile, categories);
    res.status(201).json({ message: "Category added", category });
  } catch (err) {
    res.status(500).json({ message: "Failed to save category", error: err.message });
  }
});

app.delete("/categories/:category", (req, res) => {
  try {
    const category = req.params.category;
    const categories = readJSON(categoriesFile);
    const filtered = categories.filter(c => c !== category);
    if (filtered.length === categories.length) {
      return res.status(404).json({ message: "Category not found" });
    }
    writeJSON(categoriesFile, filtered);
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete category", error: err.message });
  }
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
