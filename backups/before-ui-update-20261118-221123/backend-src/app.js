
const express = require("express");
const { createAuthRouter } = require('./auth');
const db = require('./config/database');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use('/api/auth', createAuthRouter(db));
app.use('/api/business', require('./business').createBusinessRouter(db));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Hotel Sales and Marketing API is running!"
  });
});

const path = require('node:path');
app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
app.use(express.static(path.resolve(__dirname, '../../frontend/dist')));
app.get(/.*/, (req, res) => res.sendFile(path.resolve(__dirname, '../../frontend/dist/index.html')));
app.use((error, req, res, next) => res.status(error.status === 413 ? 413 : 400).json({ message: error.status === 413 ? 'File is too large. Use a backup smaller than 9 MB.' : 'Invalid request.' }));

module.exports = app;
