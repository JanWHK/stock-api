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
app.use(cors());            // tighten later to your frontend origin
app.use(express.json());

let pool;
(async () => {
  try {
    pool = await mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
    console.log('MySQL pool ready');
  } catch (e) {
    console.error('MySQL init error:', e.message);
  }
})();

app.get('/', (req, res) => res.send('stock-api up'));
app.get('/health', async (req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/ping', (req, res) => res.json({ pong: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on ${PORT}`);
});
