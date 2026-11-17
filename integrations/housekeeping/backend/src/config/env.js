// Checks the environment before the server starts (NFR-SEC-006, NFR-DEP-002).
const EXAMPLE_SECRETS = ['change-this-secret', 'replace-with-the-class-project-secret'];

function assertConfig(env = process.env) {
  const problems = [];
  if (!env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set.');
  }
  if (!env.JWT_SECRET) {
    problems.push('JWT_SECRET is not set.');
  } else if (EXAMPLE_SECRETS.includes(env.JWT_SECRET) || env.JWT_SECRET.length < 16 ||
      /^(replace|change|example|demo)/i.test(env.JWT_SECRET)) {
    problems.push('JWT_SECRET is still the example value or shorter than 16 characters. Use a long private secret.');
  }
  if (!env.HOSIS_API_BASE_URL) {
    problems.push('HOSIS_API_BASE_URL is not set.');
  } else {
    try {
      const url = new URL(env.HOSIS_API_BASE_URL);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          url.search || url.hash ||
          url.pathname.replace(/\/+$/, '') !== '/api/v1/integrations/housekeeping' ||
          (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
        problems.push('HOSIS_API_BASE_URL must use the Housekeeping integration API path and HTTPS outside localhost.');
      }
    } catch {
      problems.push('HOSIS_API_BASE_URL must be a valid URL.');
    }
  }
  if (!env.HOSIS_INTEGRATION_TOKEN || env.HOSIS_INTEGRATION_TOKEN.length < 32 ||
      /\s/.test(env.HOSIS_INTEGRATION_TOKEN) ||
      /^(replace|change|example|demo)/i.test(env.HOSIS_INTEGRATION_TOKEN)) {
    problems.push('HOSIS_INTEGRATION_TOKEN must be a unique server-side secret of at least 32 characters.');
  }
  if (problems.length) {
    throw new Error(`Backend configuration error:\n- ${problems.join('\n- ')}\nSee backend/.env.example.`);
  }
}

// Origins allowed to call the API from a browser. Defaults to local Vite ports.
function corsOrigins(env = process.env) {
  const configuredOrigins = (env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (env.NODE_ENV === 'production') return configuredOrigins;

  const localDevelopmentOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://[::1]:5173',
    'http://[::1]:5174',
  ];
  return [...new Set([...configuredOrigins, ...localDevelopmentOrigins])];
}

module.exports = { assertConfig, corsOrigins };
