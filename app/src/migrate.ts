import { migrate } from './db.ts';
migrate();
console.log('Миграции SQLite применены.');
