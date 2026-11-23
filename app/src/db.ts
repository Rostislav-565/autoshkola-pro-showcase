import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');
export const zone = process.env.BUSINESS_TIME_ZONE || 'Europe/Saratov';
const file = resolve(process.env.DATABASE_PATH || './data/autoshkola.sqlite');
mkdirSync(dirname(file), { recursive: true });
export const database = new DatabaseSync(file);
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

export function all<T>(sql: string, ...params: SQLInputValue[]) {
  return database.prepare(sql).all(...params) as T[];
}
export function one<T>(sql: string, ...params: SQLInputValue[]) {
  return database.prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return database.prepare(sql).run(...params);
}
export function atomic<T>(work: () => T) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
export function migrate() {
  database.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, installedAt TEXT NOT NULL) STRICT;');
  for (const name of readdirSync('migrations').filter(file => /^\d+_.+\.sql$/.test(file)).sort()) {
    atomic(() => {
      if (one('SELECT name FROM migrations WHERE name = ?', name)) return;
      database.exec(readFileSync(join('migrations', name), 'utf8'));
      run('INSERT INTO migrations VALUES (?, ?)', name, new Date().toISOString());
    });
  }
}
