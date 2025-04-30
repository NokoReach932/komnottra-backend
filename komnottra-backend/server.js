const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

const dataFilePath = path.join(__dirname, "data", "articles.json");

app.use(cors({
  origin: "https://www.komnottra.com"
}));
app.use(express.json({ limit: '5mb' }));

// Ensure data file exists
if (!fs.existsSync(dataFilePath)) {
  fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
  fs.writeFileSync(dataFilePath, JSON.stringify([]));
}

// Helper to read/write data
const readArticles = () => JSON.parse(fs.readFileSync(dataFilePath));
const writeArticles = (articles) => fs.writeFileSync(dataFilePath, JSON.stringify(articles, null, 2));

// Routes
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
