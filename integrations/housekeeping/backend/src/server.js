require('dotenv').config();
const { assertConfig } = require('./config/env');

try {
  assertConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require('./app');
const { syncAllRooms, pollRooms } = require('./services/roomSync');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Housekeeping API running on http://localhost:${PORT}`);
  let initialSyncComplete = false;
  const retryInitialSync = () => syncAllRooms().then(() => { initialSyncComplete = true; });
  retryInitialSync().catch((err) => console.error('Initial HOSIS room sync failed:', err.message));
  const poller = setInterval(() => {
    const poll = initialSyncComplete ? pollRooms() : retryInitialSync();
    poll.catch((err) => console.error('HOSIS room synchronization failed:', err.message));
  }, 30000);
  poller.unref();
});
