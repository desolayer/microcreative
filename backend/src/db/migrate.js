import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool } from '../config/database.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const sql = readFileSync(join(__dirname, 'migrations/001_initial.sql'), 'utf8')
  try {
    await pool.query(sql)
    console.log('Migration completed successfully')
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
