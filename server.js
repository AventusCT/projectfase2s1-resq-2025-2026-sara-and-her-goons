// server.js (MySQL versie voor XAMPP)
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const mysql = require('mysql2/promise');

const OPENING_START = "08:00";
const OPENING_END   = "18:00";
const POLICY_LOCK_MIN_BEFORE_START = 60; // minuten

const app = express();
app.use(express.json());
app.use(cors());

// Frontend statisch serveren
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// MySQL pool (XAMPP: root zonder wachtwoord, database 'epic3')
const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',      // pas dit aan als je een wachtwoord hebt gezet
  database: 'epic3',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function withinOpening(start, end) {
  return timeToMinutes(start) >= timeToMinutes(OPENING_START) &&
         timeToMinutes(end)   <= timeToMinutes(OPENING_END) &&
         timeToMinutes(end)   >  timeToMinutes(start);
}

function isLocked(res) {
  const now = new Date();
  const [y, mo, d] = res.date.split('-').map(Number);
  const [sh, sm] = res.start.split(':').map(Number);
  const startDate = new Date(y, mo - 1, d, sh, sm, 0);
  const diffMin = Math.floor((startDate - now) / 60000);
  return diffMin < POLICY_LOCK_MIN_BEFORE_START;
}

// Helpers om MySQL TIME/DATE mooi terug te geven
function rowToReservation(row) {
  const pad = (n) => n.toString().padStart(2, '0');

  let dateStr;
  if (row.date instanceof Date) {
    dateStr = row.date.toISOString().slice(0, 10);
  } else {
    dateStr = String(row.date);
  }

  function timeToStr(v) {
    if (typeof v === 'string') {
      // 'HH:MM:SS' -> 'HH:MM'
      return v.slice(0,5);
    }
    if (v instanceof Date) {
      return pad(v.getHours()) + ':' + pad(v.getMinutes());
    }
    return String(v).slice(0,5);
  }

  return {
    id: row.id,
    employee: row.employee_name,
    item: row.item_id,
    date: dateStr,
    start: timeToStr(row.start_time),
    end: timeToStr(row.end_time),
    status: row.status || 'ACTIVE'
  };
}

// ----------------- Routes -----------------

// health
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'DB connectie faalde' });
  }
});

// producten (optioneel, frontend heeft statische lijst)
app.get('/api/products', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, type FROM products ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// reserveringen ophalen
app.get('/api/reservations', async (req, res, next) => {
  try {
    const { employee, date, admin } = req.query;
    const where = [];
    const params = [];

    if (employee && !admin) {
      where.push('LOWER(employee_name) = LOWER(?)');
      params.push(employee);
    }
    if (date) {
      where.push('date = ?');
      params.push(date);
    }

    const sql =
      'SELECT id, employee_name, item_id, date, start_time, end_time, status ' +
      'FROM reservations ' +
      (where.length ? 'WHERE ' + where.join(' AND ') + ' ' : '') +
      'ORDER BY date ASC, start_time ASC';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map(rowToReservation));
  } catch (err) {
    next(err);
  }
});

// reservering aanmaken
app.post('/api/reservations', async (req, res, next) => {
  try {
    const { employee, item, date, start, end } = req.body;

    if (!employee || !item || !date || !start || !end) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Alle velden zijn verplicht.'
      });
    }

    if (!withinOpening(start, end)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Tijden moeten liggen tussen ${OPENING_START} en ${OPENING_END}.`
      });
    }

    // overlap check
    const [confRows] = await pool.query(
      `SELECT id FROM reservations
         WHERE item_id = ?
           AND date = ?
           AND status = 'ACTIVE'
           AND NOT (end_time <= ? OR start_time >= ?)`,
      [item, date, end, start]
    );

    if (confRows.length > 0) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'Er bestaat al een reservering die overlapt.'
      });
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO reservations
         (id, employee_name, item_id, date, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [id, employee, item, date, start, end]
    );

    const [rows] = await pool.query(
      'SELECT id, employee_name, item_id, date, start_time, end_time, status FROM reservations WHERE id = ?',
      [id]
    );
    const r = rowToReservation(rows[0]);
    res.status(201).json({
      id: r.id,
      employee_name: r.employee,
      item_id: r.item,
      date: r.date,
      start_time: r.start,
      end_time: r.end,
      status: r.status
    });
  } catch (err) {
    next(err);
  }
});

// reservering updaten
app.put('/api/reservations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { item, date, start, end } = req.body;

    const [existRows] = await pool.query(
      'SELECT id, employee_name, item_id, date, start_time, end_time, status FROM reservations WHERE id = ?',
      [id]
    );
    if (existRows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Reservering niet gevonden.' });
    }
    const existing = rowToReservation(existRows[0]);

    if (isLocked(existing)) {
      return res.status(400).json({
        error: 'LOCKED',
        message: 'Reservering kan niet meer worden gewijzigd (binnen 1 uur voor start).'
      });
    }

    if (!item || !date || !start || !end) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Alle velden zijn verplicht.'
      });
    }

    if (!withinOpening(start, end)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Tijden moeten liggen tussen ${OPENING_START} en ${OPENING_END}.`
      });
    }

    const [confRows] = await pool.query(
      `SELECT id FROM reservations
         WHERE item_id = ?
           AND date = ?
           AND id <> ?
           AND status = 'ACTIVE'
           AND NOT (end_time <= ? OR start_time >= ?)`,
      [item, date, id, end, start]
    );
    if (confRows.length > 0) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'Er bestaat al een reservering die overlapt.'
      });
    }

    await pool.query(
      `UPDATE reservations
         SET item_id = ?, date = ?, start_time = ?, end_time = ?
       WHERE id = ?`,
      [item, date, start, end, id]
    );

    const [rows] = await pool.query(
      'SELECT id, employee_name, item_id, date, start_time, end_time, status FROM reservations WHERE id = ?',
      [id]
    );
    const r = rowToReservation(rows[0]);
    res.json({
      id: r.id,
      employee_name: r.employee,
      item_id: r.item,
      date: r.date,
      start_time: r.start,
      end_time: r.end,
      status: r.status
    });
  } catch (err) {
    next(err);
  }
});

// reservering verwijderen (normale medewerker)
app.delete('/api/reservations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existRows] = await pool.query(
      'SELECT id, employee_name, item_id, date, start_time, end_time, status FROM reservations WHERE id = ?',
      [id]
    );
    if (existRows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Reservering niet gevonden.' });
    }
    const existing = rowToReservation(existRows[0]);

    if (isLocked(existing)) {
      return res.status(400).json({
        error: 'LOCKED',
        message: 'Binnen 1 uur voor start kan niet worden geannuleerd.'
      });
    }

    await pool.query('DELETE FROM reservations WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// reservering verwijderen (admin – mag altijd)
app.delete('/api/reservations/:id/any', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [existRows] = await pool.query(
      'SELECT id FROM reservations WHERE id = ?',
      [id]
    );
    if (existRows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Reservering niet gevonden.' });
    }

    await pool.query('DELETE FROM reservations WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// globale error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'SERVER_ERROR',
    message: 'Er ging iets mis op de server.'
  });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend (MySQL) + frontend draaien op http://localhost:${PORT}`);
});
