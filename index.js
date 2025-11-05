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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on ${PORT}`);
});
