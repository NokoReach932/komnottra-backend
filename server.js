const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Paths
const articlesFilePath = path.join(__dirname, "data", "articles.json");
const categoriesFilePath = path.join(__dirname, "data", "categories.json");

// Allow only your frontend domain
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin === "https://www.komnottra.com") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

// Ensure files exist
if (!fs.existsSync(articlesFilePath)) {
  fs.mkdirSync(path.dirname(articlesFilePath), { recursive: true });
  fs.writeFileSync(articlesFilePath, JSON.stringify([]));
}
if (!fs.existsSync(categoriesFilePath)) {
  fs.writeFileSync(categoriesFilePath, JSON.stringify([]));
}

// === Article Helpers ===
const readArticles = () => JSON.parse(fs.readFileSync(articlesFilePath));
const writeArticles = (data) => fs.writeFileSync(articlesFilePath, JSON.stringify(data, null, 2));

// === Category Helpers ===
const readCategories = () => JSON.parse(fs.readFileSync(categoriesFilePath));
const writeCategories = (data) => fs.writeFileSync(categoriesFilePath, JSON.stringify(data, null, 2));

// === Article Routes ===
app.get("/articles", (req, res) => {
  res.json(readArticles());
});

app.post("/articles", (req, res) => {
  const articles = readArticles();
  const newArticle = req.body;
  newArticle.id = Date.now();
  articles.unshift(newArticle);
  writeArticles(articles);
  res.status(201).json({ message: "Article added", article: newArticle });
});

app.delete("/articles/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const articles = readArticles();
  const filtered = articles.filter(article => article.id !== id);
  if (filtered.length === articles.length) {
    return res.status(404).json({ message: "Article not found" });
  }
  writeArticles(filtered);
  res.json({ message: "Article deleted" });
});

// === Category Routes ===
app.get("/categories", (req, res) => {
  res.json(readCategories());
});

app.post("/categories", (req, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).json({ message: "Category is required" });

  const categories = readCategories();
  if (categories.includes(category)) {
    return res.status(400).json({ message: "Category already exists" });
  }
  categories.push(category);
  writeCategories(categories);
  res.status(201).json({ message: "Category added", category });
});

app.delete("/categories/:name", (req, res) => {
  const name = req.params.name;
  const categories = readCategories();
  const filtered = categories.filter(c => c !== name);
  if (filtered.length === categories.length) {
    return res.status(404).json({ message: "Category not found" });
  }
  writeCategories(filtered);
  res.json({ message: "Category deleted" });
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
