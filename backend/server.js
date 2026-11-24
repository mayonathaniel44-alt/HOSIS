
require("dotenv").config();

const app = require("./src/app");

// Initialize database
require("./src/config/database");

const PORT = process.env.PORT || 5002;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
