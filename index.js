import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

const {
  PORT = 8080,
  DB_HOST = "stock-db",
  DB_PORT = 3306,
  DB_NAME = "stockcount",
  DB_USER = "stockapp",
  DB_PASS = ""
} = process.env;

const app = express();
app.use(express.json());
app.use(cors()); // we'll restrict origin later to your frontend URL

// MySQL pool
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Create tables if missing
async function bootstrap() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plu VARCHAR(64) UNIQUE,
        name VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS counts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        location ENUM('bar','cooler') NOT NULL,
        qty DECIMAL(10,2) NOT NULL DEFAULT 0,
        counted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log("DB ready");
  } finally {
    conn.release();
  }
}
bootstrap().catch(err => {
  console.error("Bootstrap error:", err);
  process.exit(1);
});

// Health
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Seed items
app.post("/api/items/seed", async (req, res) => {
  const items = req.body?.items ?? [];
  if (!Array.isArray(items)) return res.status(400).json({ error: "items must be array" });
  const conn = await pool.getConnection();
  try {
    for (const it of items) {
      await conn.query(
        "INSERT INTO items (plu, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
        [it.plu ?? null, it.name]
      );
    }
    res.json({ ok: true, inserted: items.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  } finally {
    conn.release();
  }
});

// List items
app.get("/api/items", async (_req, res) => {
  const [rows] = await pool.query("SELECT id, plu, name FROM items ORDER BY name");
  res.json(rows);
});

// Record a count
app.post("/api/counts", async (req, res) => {
  const { itemId, location, qty } = req.body || {};
  if (!itemId || !["bar", "cooler"].includes(location) || qty == null)
    return res.status(400).json({ error: "itemId, location('bar'|'cooler'), qty required" });

  await pool.query("INSERT INTO counts (item_id, location, qty) VALUES (?, ?, ?)", [
    itemId,
    location,
    qty
  ]);
  res.json({ ok: true });
});

// Summary
app.get("/api/summary", async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT i.id, i.name, i.plu,
      COALESCE(SUM(CASE WHEN c.location='bar' THEN c.qty END),0) AS bar_qty,
      COALESCE(SUM(CASE WHEN c.location='cooler' THEN c.qty END),0) AS cooler_qty
    FROM items i
    LEFT JOIN counts c ON c.item_id = i.id
    GROUP BY i.id, i.name, i.plu
    ORDER BY i.name
  `);
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
