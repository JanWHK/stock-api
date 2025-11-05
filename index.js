// index.js
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const {
  PORT = 8080,
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASS,
  DB_NAME
} = process.env;

const app = express();
app.use(cors());            // TODO: restrict to your frontend origin
app.use(express.json());

let pool;

// one-time init + schema ensure
(async () => {
  try {
    pool = await mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
    console.log('MySQL pool ready');

    // Ensure schema (idempotent)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stock_counts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
        location VARCHAR(100) NOT NULL,
        counted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Schema ensured');
  } catch (e) {
    console.error('MySQL init error:', e.message);
  }
})();

app.get('/',         (req, res) => res.send('stock-api up'));
app.get('/api/ping', (req, res) => res.json({ pong: true }));

app.get('/health', async (req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Create a stock count
app.post('/api/stock', async (req, res) => {
  try {
    const { item_name, quantity, location, counted_at } = req.body;

    if (!item_name || quantity == null || !location) {
      return res.status(400).json({ ok: false, error: 'item_name, quantity, location required' });
    }

    // optional counted_at (ISO "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD")
    const sql = counted_at
      ? 'INSERT INTO stock_counts (item_name, quantity, location, counted_at) VALUES (?, ?, ?, ?)'
      : 'INSERT INTO stock_counts (item_name, quantity, location) VALUES (?, ?, ?)';

    const params = counted_at
      ? [item_name.trim(), Number(quantity), String(location).trim(), counted_at]
      : [item_name.trim(), Number(quantity), String(location).trim()];

    const [result] = await pool.execute(sql, params);
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// List stock counts (optionally filter by date)
app.get('/api/stock', async (req, res) => {
  try {
    const { date } = req.query; // e.g. 2025-11-05
    let rows;

    if (date) {
      [rows] = await pool.execute(
        `SELECT id, item_name, quantity, location, counted_at
         FROM stock_counts
         WHERE DATE(counted_at) = ?
         ORDER BY counted_at DESC, item_name ASC`,
        [date]
      );
    } else {
      [rows] = await pool.execute(
        `SELECT id, item_name, quantity, location, counted_at
         FROM stock_counts
         ORDER BY counted_at DESC
         LIMIT 200`
      );
    }

    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on ${PORT}`);
});
