const express = require('express');
const cors = require('cors');
const authRoutes = require('./modules/auth/auth.routes');
const housekeepingRoutes = require('./modules/housekeeping');
const errorHandler = require('./middleware/errorHandler');
const { corsOrigins } = require('./config/env');

const app = express();

// Basic security headers on every response: no "X-Powered-By: Express", no
// MIME sniffing, no framing of API responses, and no referrer leaks.
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  next();
});

// Only the HOSIS frontend may call the API from a browser (set CORS_ORIGIN).
app.use(cors({ origin: corsOrigins() }));
// 3 MB leaves room for one lost-and-found photo (2 MB) sent as base64.
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Each HOSIS subsystem is mounted as its own module (modular monolith).
app.use('/api/auth', authRoutes);
app.use('/api/housekeeping', housekeepingRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
