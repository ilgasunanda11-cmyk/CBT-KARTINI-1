import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.cwd(), process.env.DATABASE_PATH);
  }
  return path.resolve(process.cwd(), 'server', 'database', 'kartini_cbt.db');
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDatabasePath();
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:') {
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}

export function setDbForTest(testDb: Database.Database): void {
  dbInstance = testDb;
  dbInstance.pragma('foreign_keys = ON');
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx(db);
}
