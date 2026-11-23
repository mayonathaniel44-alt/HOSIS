const fs = require('node:fs/promises')
const path = require('node:path')
const dotenv = require('dotenv')
const { Client } = require('pg')

const backend = path.resolve(__dirname, '..')
const repository = path.resolve(backend, '..')

function identifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function literal(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

async function main() {
  dotenv.config({ path: path.join(backend, '.env'), quiet: true })
  dotenv.config({ path: path.join(backend, '.env.local'), quiet: true })
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  const url = new URL(databaseUrl)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('The database export script is restricted to a local HOSIS database.')
  }

  const requested = process.argv[2]
  const output = requested
    ? path.resolve(requested)
    : path.join(repository, 'exports', `HOSIS_full_database_${new Date().toISOString().slice(0, 10)}.sql`)
  await fs.mkdir(path.dirname(output), { recursive: true })

  const schemaDirectory = path.join(repository, 'database', 'schema')
  const schemaFiles = (await fs.readdir(schemaDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  const chunks = [
    '-- Grand Horizon Hotel - Complete HOSIS database backup\n',
    `-- Created: ${new Date().toISOString()}\n`,
    '-- Restore into an empty PostgreSQL database using psql.\n\n',
    "SET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n",
    'SET check_function_bodies = false;\nSET client_min_messages = warning;\n\n',
    'BEGIN;\nDROP SCHEMA IF EXISTS engineering CASCADE;\nDROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n\n',
  ]

  for (const filename of schemaFiles) {
    const sql = await fs.readFile(path.join(schemaDirectory, filename), 'utf8')
    if (sql.trim()) chunks.push(`-- Schema migration: ${filename}\n${sql.trim()}\n\n`)
  }
  chunks.push(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);\n\nSET session_replication_role = replica;\n\n`)

  const { rows: tables } = await client.query(`
    SELECT table_schema, table_name
      FROM information_schema.tables
     WHERE table_type = 'BASE TABLE' AND table_schema IN ('public', 'engineering')
     ORDER BY table_schema, table_name
  `)
  chunks.push(`TRUNCATE TABLE ${tables.map((table) =>
    `${identifier(table.table_schema)}.${identifier(table.table_name)}`).join(', ')} RESTART IDENTITY CASCADE;\n\n`)

  for (const table of tables) {
    const { rows: columns } = await client.query(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER'
       ORDER BY ordinal_position
    `, [table.table_schema, table.table_name])
    if (!columns.length) continue
    const select = columns.map((column, index) =>
      `${identifier(column.column_name)}::text AS ${identifier(`c${index}`)}`).join(', ')
    const { rows } = await client.query(
      `SELECT ${select} FROM ${identifier(table.table_schema)}.${identifier(table.table_name)}`,
    )
    if (!rows.length) continue
    const names = columns.map((column) => identifier(column.column_name)).join(', ')
    chunks.push(`-- Data: ${table.table_schema}.${table.table_name} (${rows.length} rows)\n`)
    for (const row of rows) {
      const values = columns.map((_, index) => literal(row[`c${index}`])).join(', ')
      chunks.push(`INSERT INTO ${identifier(table.table_schema)}.${identifier(table.table_name)} (${names}) OVERRIDING SYSTEM VALUE VALUES (${values});\n`)
    }
    chunks.push('\n')
  }

  const { rows: sequences } = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS sequence_name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'S' AND n.nspname IN ('public', 'engineering')
     ORDER BY n.nspname, c.relname
  `)
  for (const sequence of sequences) {
    const { rows: [state] } = await client.query(
      `SELECT last_value::text, is_called FROM ${identifier(sequence.schema_name)}.${identifier(sequence.sequence_name)}`,
    )
    chunks.push(`SELECT pg_catalog.setval('${sequence.schema_name}.${sequence.sequence_name}', ${state.last_value}, ${state.is_called});\n`)
  }
  chunks.push('\nSET session_replication_role = origin;\nCOMMIT;\n')

  await client.end()
  await fs.writeFile(output, chunks.join(''), { encoding: 'utf8', mode: 0o600 })
  const stat = await fs.stat(output)
  console.log(JSON.stringify({ output, bytes: stat.size, tables: tables.length, sequences: sequences.length }))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
