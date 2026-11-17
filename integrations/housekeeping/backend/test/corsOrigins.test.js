const assert = require('node:assert/strict');
const test = require('node:test');
const { corsOrigins } = require('../src/config/env');

test('development CORS allows both local Vite ports alongside configured origins', () => {
  const origins = corsOrigins({
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://team.local:5173',
  });

  assert.ok(origins.includes('http://team.local:5173'));
  assert.ok(origins.includes('http://localhost:5173'));
  assert.ok(origins.includes('http://localhost:5174'));
  assert.ok(origins.includes('http://127.0.0.1:5174'));
});

test('production CORS uses only explicitly configured origins', () => {
  assert.deepEqual(corsOrigins({
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://housekeeping.example.com',
  }), ['https://housekeeping.example.com']);
});
