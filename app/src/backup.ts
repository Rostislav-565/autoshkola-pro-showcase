import type { SQLInputValue } from 'node:sqlite';
import { all, atomic, database, one, run, zone } from './db.ts';
import { dateInZone, digits, loginPattern, methods, minutes, normalize, phonePattern, roles, studentStatuses, validDay } from './shared.ts';
import type { UserView } from './shared.ts';
import { ApiError, requireRecord } from './validation.ts';

const layout = {
  users: ['id','login','passwordHash','name','phone','role'],
  instructors: ['id','name','phone','car','userId'],
  groups: ['id','name','searchName','instructorId'],
  students: ['id','name','searchName','phone','phoneDigits','birthDate','groupId','status','theoryProgress','userId','deletedAt'],
  lessons: ['id','type','date','startTime','startMinute','durationMin','groupId','studentId','instructorId','topic','status'],
  payments: ['id','studentId','studentName','amount','date','method','receiptNumber','comment'],
  requests: ['id','userId','text','status','createdAt'],
} as const;
type Table = keyof typeof layout;
type Row = Record<string, SQLInputValue>;
const tables = Object.keys(layout) as Table[];
const format = 'autoshkola-pro';
const version = 1;
const hashPattern = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
export function exportData() {
  return atomic(() => ({
    format, version, exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(tables.map(table => [table, all<Row>(`SELECT ${layout[table].join(',')} FROM ${table} ORDER BY id`)])),
  }));
}
function parseRow(table: Table, raw: unknown): Row {
  const obj = requireRecord(raw);
  const result: Row = {};
  function text(key: string, length = 120, pattern?: RegExp, optional = false) {
    const value = obj[key];
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > length || (pattern && !pattern.test(value))) throw new Error('поле «' + key + '» имеет неверное значение');
    result[key] = value;
    return value;
  }
  function integer(key: string, min: number, max: number) {
    const value = obj[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('поле «' + key + '» имеет неверное число');
    result[key] = value;
    return value;
  }
  function choice(key: string, values: string[]) {
    if (!values.includes(text(key, 24))) throw new Error('неизвестное значение поля «' + key + '»');
  }
  function nullableId(key: string) {
    return obj[key] === null ? result[key] = null : text(key, 100);
  }
  function date(key: string, past = false) {
    const value = text(key, 10);
    if (!validDay(value) || (past && value > dateInZone(zone))) throw new Error('неверная дата в поле «' + key + '»');
  }
  function phone() {
    const value = text('phone', 24, phonePattern);
    if (!/^\d{10,15}$/.test(digits(value))) throw new Error('неверный телефон');
    return value;
  }
  text('id', 100);
  switch (table) {
    case 'users':
      text('login', 40, loginPattern);
      text('passwordHash', 180, hashPattern);
      text('name');
      phone();
      choice('role', Object.keys(roles));
      break;
    case 'instructors':
      text('name');
      phone();
      text('car');
      nullableId('userId');
      break;
    case 'groups':
      result.searchName = normalize(text('name'));
      text('instructorId', 100);
      break;
    case 'students':
      result.searchName = normalize(text('name'));
      result.phoneDigits = digits(phone());
      date('birthDate', true);
      nullableId('groupId');
      nullableId('userId');
      choice('status', Object.keys(studentStatuses));
      integer('theoryProgress', 0, 100);
      result.deletedAt = obj.deletedAt === null ? null : integer('deletedAt', 1, Date.now());
      break;
    case 'lessons': {
      choice('type', ['GROUP','INDIVIDUAL']);
      choice('status', ['PLANNED','DONE','CANCELLED']);
      date('date');
      result.startMinute = minutes(text('startTime', 5, /^(?:[01]\d|2[0-3]):[0-5]\d$/));
      if (result.startMinute + integer('durationMin', 15, 480) > 1440) throw new Error('занятие заканчивается после полуночи');
      const groupId = nullableId('groupId');
      const studentId = nullableId('studentId');
      if (result.type === 'GROUP' ? !groupId || studentId !== null : !studentId || groupId !== null) throw new Error('неверная связь занятия с группой или учеником');
      text('instructorId', 100);
      text('topic', 180);
      break;
    }
    case 'payments':
      text('studentId', 100);
      text('studentName');
      integer('amount', 1, 100_000_000_00);
      integer('receiptNumber', 1, Number.MAX_SAFE_INTEGER - 1);
      date('date', true);
      choice('method', Object.keys(methods));
      text('comment', 500, undefined, true);
      break;
    case 'requests': {
      text('userId', 100);
      text('text', 4000);
      choice('status', ['NEW','DONE']);
      const date = text('createdAt', 24);
      if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date) throw new Error('неверная дата создания');
      break;
    }
  }
  return result;
}

function checkRoles() {
  const invalid = one(`SELECT i.id FROM instructors i JOIN users u ON u.id = i.userId WHERE u.role <> 'INSTRUCTOR'
    UNION ALL SELECT s.id FROM students s JOIN users u ON u.id = s.userId WHERE u.role <> 'STUDENT' LIMIT 1`);
  if (invalid) throw new Error('роль аккаунта не соответствует карточке');
}
const tableLabels: Record<Table, string> = {
  users: 'Пользователи', instructors: 'Инструкторы', groups: 'Группы', students: 'Ученики',
  lessons: 'Занятия', payments: 'Оплаты', requests: 'Обращения',
};
export function importData(actor: UserView, raw: unknown) {
  const payload = requireRecord(raw);
  if (payload.format !== format || payload.version !== version) throw new ApiError(422, 'Неподдерживаемый формат или версия резервной копии.');
  const data = requireRecord(payload.tables);
  const parsed = new Map<Table, Row[]>();
  const errors: string[] = [];
  for (const table of tables) {
    const list = data[table];
    if (!Array.isArray(list) || list.length > 50_000) {
      errors.push(tableLabels[table] + ' — ожидается массив до 50 000 записей.');
      continue;
    }
    const seen = new Set<SQLInputValue>();
    const rows: Row[] = [];
    list.forEach((entry: unknown, index: number) => {
      try {
        const row = parseRow(table, entry);
        if (seen.has(row.id)) throw new Error('идентификатор повторяется в файле');
        seen.add(row.id);
        rows.push(row);
      } catch (error) {
        errors.push(`${tableLabels[table]}, строка ${index + 1} — ${error instanceof Error ? error.message : 'неверная запись'}.`);
      }
    });
    parsed.set(table, rows);
  }
  if (errors.length) return { created: 0, updated: 0, unchanged: 0, errorCount: errors.length, errors: errors.slice(0, 20) };
  let current: Table = 'users';
  let position = 0;
  try {
    return atomic(() => {
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      const trigger = one<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'payment_active_student' AND type = 'trigger'");
      if (!trigger) throw new Error('не найдена миграция платежей');
      database.exec('DROP TRIGGER payment_active_student');
      for (const table of tables) {
        current = table;
        const rows = parsed.get(table) ?? [];
        const columns = layout[table];
        for (const [index, row] of rows.entries()) {
          position = index + 1;
          const previous = one<Row>(`SELECT ${columns.join(',')} FROM ${table} WHERE id = ?`, row.id);
          if (table === 'users' && row.id === actor.id && (row.role !== 'ADMIN' || row.passwordHash !== previous?.passwordHash || row.login !== previous?.login)) {
            throw new Error('аккаунт текущего администратора должен сохранять роль, логин и пароль');
          }
          if (previous && columns.every(key => previous[key] === row[key])) {
            unchanged++;
            continue;
          }
          if (table === 'payments' && previous && (previous.receiptNumber !== row.receiptNumber || previous.studentId !== row.studentId)) {
            throw new Error('номер чека и плательщик существующей оплаты должны сохраняться');
          }
          if (previous) {
            const fields = columns.filter(key => key !== 'id');
            run(`UPDATE ${table} SET ${fields.map(key => key + '=?').join(',')} WHERE id = ?`, ...fields.map(key => row[key]), row.id);
            if (table === 'users' && (previous.passwordHash !== row.passwordHash || previous.role !== row.role || previous.login !== row.login)) run('DELETE FROM sessions WHERE userId = ?', row.id);
            updated++;
          } else {
            run(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...columns.map(key => row[key]));
            created++;
          }
        }
      }
      checkRoles();
      database.exec(trigger.sql);
      return { created, updated, unchanged, errorCount: 0, errors: [] };
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : '';
    const message = details.includes('LESSON_OVERLAP') ? 'занятие пересекается с другим занятием инструктора'
      : details.includes('FOREIGN KEY') ? 'связанная запись не найдена'
      : details.includes('UNIQUE') ? 'повторяется уникальное значение'
      : /^[а-яё]/i.test(details) ? details : 'не удалось сохранить запись';
    return { created: 0, updated: 0, unchanged: 0, errorCount: 1, errors: [`${tableLabels[current]}, строка ${position} — ${message}. Изменения отменены.`] };
  }
}
