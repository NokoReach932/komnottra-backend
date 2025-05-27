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

// === Utility: Slugify ===
const slugify = (text) => 
  text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end

// === Routes ===

// --- Articles ---
// Get article by slug
app.get("/articles/slug/:slug", (req, res) => {
  const articles = readJSON(articlesFile);
  const slug = req.params.slug.toLowerCase();
  const article = articles.find(a => a.slug && a.slug.toLowerCase() === slug);

  if (!article) {
    return res.status(404).json({ message: "Article not found" });
  }
  res.json(article);
});

// Get all articles (with optional filters)
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

// Add a new article
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

    // Ensure unique slug
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

// Delete an article by ID
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
// Get all categories
app.get("/categories", (req, res) => {
  const categories = readJSON(categoriesFile);
  res.json(categories);
});

// Add a new category
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

// Delete a category by name
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

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
