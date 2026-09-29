require('dotenv').config();
require('express-async-errors'); // lets async route errors reach the error handler below

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const clubsRoutes = require('./routes/clubs.routes');
const eventsRoutes = require('./routes/events.routes');
const matchesRoutes = require('./routes/matches.routes');
const transactionsRoutes = require('./routes/transactions.routes');
const hostRoutes = require('./routes/host.routes');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true, // permissive in dev if unset
  credentials: true,
}));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/host', hostRoutes);
app.use('/api/clubs', clubsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/transactions', transactionsRoutes);

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// Centralized error handler — catches anything thrown/rejected in routes
// (express-async-errors forwards async rejections here automatically).
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Internal server error.',
    ...(process.env.NODE_ENV !== 'production' ? { details: err.message } : {}),
  });
});

module.exports = app;
