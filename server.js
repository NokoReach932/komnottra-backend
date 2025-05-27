const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));  // Allow all origins for dev/testing
app.use(express.json({ limit: "5mb" }));

const dataDir = path.resolve(__dirname, "data");
const articlesFile = path.join(dataDir, "articles.json");
const categoriesFile = path.join(dataDir, "categories.json");

// Ensure data folder and files exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(articlesFile)) fs.writeFileSync(articlesFile, JSON.stringify([]));
if (!fs.existsSync(categoriesFile)) fs.writeFileSync(categoriesFile, JSON.stringify([]));

// Read/Write helpers
const readJSON = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
};

const writeJSON = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Write error:", err);
  }
};

// --- Backup Download ---
app.get("/admin/backup/download", (req, res) => {
  const articles = readJSON(articlesFile);
  const categories = readJSON(categoriesFile);
  res.json({ articles, categories });
});

// --- Backup Restore ---
app.post("/admin/backup/restore", (req, res) => {
  const { articles, categories } = req.body;
  if (!articles || !categories) {
    return res.status(400).json({ message: "Missing articles or categories data" });
  }
  writeJSON(articlesFile, articles);
  writeJSON(categoriesFile, categories);
  res.json({ message: "Backup restored successfully" });
});

// Your existing article/category routes here (omitted for brevity)

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
