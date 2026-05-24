import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool } from '../config/database.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()   // 001, 002, … — строгий порядок

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    try {
      await pool.query(sql)
      console.log(`✅  Migration ${file} — OK`)
    } catch (err) {
      console.error(`❌  Migration ${file} failed:`, err.message)
      process.exit(1)
    }
  }

  await pool.end()
  console.log('All migrations completed.')
}

migrate()
