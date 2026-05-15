import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal',
        notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE items ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE items ADD COLUMN recurrence_frequency TEXT;
      ALTER TABLE items ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE items ADD COLUMN recurrence_days_of_week TEXT;

      CREATE INDEX IF NOT EXISTS idx_items_due_date ON items (due_date);
      CREATE INDEX IF NOT EXISTS idx_items_is_recurring ON items (is_recurring);
    `,
  },
];

export function openDatabase(databasePath: string): Database.Database {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = FULL");

  applyMigrations(database);

  return database;
}

function applyMigrations(database: Database.Database): void {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
  );

  const getAppliedVersions = database.prepare<[], { version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version ASC",
  );

  const appliedVersions = new Set(
    getAppliedVersions.all().map((row) => row.version),
  );

  const markMigration = database.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );

  const runMigration = database.transaction(() => {
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      database.exec(migration.sql);
      markMigration.run(migration.version, new Date().toISOString());
    }
  });

  runMigration();
}
