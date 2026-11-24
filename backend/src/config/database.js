
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const databasePath = process.env.HOSIS_DB_PATH || path.resolve(
  __dirname,
  "../../../database/hotel_sales.db"
);

const schemaPath = path.resolve(
  __dirname,
  "../../../database/schema/schema.sql"
);

fs.mkdirSync(path.dirname(databasePath), {
  recursive: true
});

const db = new Database(databasePath);

db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(schemaPath, "utf8");
db.exec(schema);

console.log("SQLite database connected successfully!");

module.exports = db;
