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

// === Routes ===

// --- Articles ---
app.get("/articles", (req, res) => {
  const articles = readJSON(articlesFile);
  res.json(articles);
});

app.post("/articles", (req, res) => {
  const articles = readJSON(articlesFile);
  const newArticle = { ...req.body, id: Date.now() };
  articles.unshift(newArticle);
  writeJSON(articlesFile, articles);
  res.status(201).json({ message: "Article added", article: newArticle });
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
  if (!category) return res.status(400).json({ message: "Category is required" });

  const categories = readJSON(categoriesFile);
  if (categories.includes(category)) return res.status(409).json({ message: "Category already exists" });

  categories.push(category);
  writeJSON(categoriesFile, categories);
  res.status(201).json({ message: "Category added", category });
});

app.delete("/categories/:category", (req, res) => {
  const category = req.params.category;
  const categories = readJSON(categoriesFile);
  const filtered = categories.filter(c => c !== category);
  if (filtered.length === categories.length) {
    return res.status(404).json({ message: "Category not found" });
  }
  writeJSON(categoriesFile, filtered);
  res.json({ message: "Category deleted" });
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
