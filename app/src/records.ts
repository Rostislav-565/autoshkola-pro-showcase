import type { SQLInputValue } from 'node:sqlite';
import { all, atomic, one, run, zone } from './db.ts';
import { dateInZone, digits, lessonStatuses, normalize, offsetDay, pageSize, timeInZone } from './shared.ts';
import type { Dashboard, Group, Inquiry, Instructor, Item, Lesson, Options, Page, Payment, Student, StudentDetail, UserView } from './shared.ts';
import { ApiError, found } from './validation.ts';

type Scope = { sql: string; values: SQLInputValue[] };
export const studentsFrom = 'students s LEFT JOIN groups g ON g.id = s.groupId LEFT JOIN users u ON u.id = s.userId';
export const studentColumns = 's.id, s.name, s.phone, s.birthDate, s.groupId, g.name AS groupName, s.status, s.theoryProgress, u.login';
const groupsFrom = 'groups g JOIN instructors i ON i.id = g.instructorId';
const groupColumns = `g.id, g.name, g.instructorId, i.name AS instructorName,
  (SELECT count(*) FROM students s WHERE s.groupId = g.id AND s.deletedAt IS NULL) AS studentCount`;
const instructorsFrom = 'instructors i LEFT JOIN users u ON u.id = i.userId';
const instructorColumns = `i.id, i.name, i.phone, i.car, u.login,
  (SELECT count(*) FROM groups g WHERE g.instructorId = i.id) AS groupCount`;
const lessonsFrom = `lessons l JOIN instructors i ON i.id = l.instructorId
  LEFT JOIN groups g ON g.id = l.groupId LEFT JOIN students s ON s.id = l.studentId`;
const lessonColumns = `l.id, l.type, l.date, l.startTime, l.durationMin, l.groupId, l.studentId,
  l.instructorId, l.topic, l.status, i.name AS instructorName, g.name AS groupName, s.name AS studentName`;
const requestsFrom = 'requests r JOIN users u ON u.id = r.userId';
const requestColumns = 'r.*, u.name';
const paymentColumns = 'p.*';
const scope = (sql = '1 = 1', ...values: SQLInputValue[]): Scope => ({ sql, values });
const studentScope = (actor: UserView) => {
  if (actor.role === 'INSTRUCTOR') return scope('s.deletedAt IS NULL AND g.instructorId = ?', actor.profileId);
  if (actor.role === 'STUDENT') return scope('s.deletedAt IS NULL AND s.id = ?', actor.profileId);
  return scope('s.deletedAt IS NULL');
};
export const lessonScope = (actor: UserView) => {
  if (actor.role === 'INSTRUCTOR') return scope('l.instructorId = ?', actor.profileId);
  if (actor.role === 'STUDENT') return scope(`(l.studentId = ? OR l.groupId =
    (SELECT groupId FROM students WHERE id = ? AND deletedAt IS NULL))`, actor.profileId, actor.profileId);
  return scope();
};
const paymentScope = (actor: UserView) => actor.role === 'STUDENT' ? scope('p.studentId = ?', actor.profileId) : scope();
const requestScope = (actor: UserView) => actor.role === 'STUDENT' ? scope('r.userId = ?', actor.id) : scope();

function filter(condition: Scope, sql: string, ...values: SQLInputValue[]) {
  condition.sql += ' AND (' + sql + ')';
  condition.values.push(...values);
}
function search(params: URLSearchParams) {
  return normalize((params.get('q') ?? '').slice(0, 200));
}
function readPage<T>(columns: string, from: string, where: Scope, order: string, rawPage: string | null): Page<T> {
  const count = one<{ count: number }>(`SELECT count(*) AS count FROM ${from} WHERE ${where.sql}`, ...where.values)?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.max(1, Math.min(pages, Number.parseInt(rawPage ?? '1', 10) || 1));
  const items = all<T>(`SELECT ${columns} FROM ${from} WHERE ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...where.values, pageSize, (page - 1) * pageSize);
  return { items, page, pages, count };
}

export function studentById(actor: UserView, id: string) {
  const where = studentScope(actor);
  return found(one<Student>(`SELECT ${studentColumns} FROM ${studentsFrom} WHERE ${where.sql} AND s.id = ?`, ...where.values, id));
}
export function students(actor: UserView, params: URLSearchParams) {
  const where = studentScope(actor);
  const query = search(params);
  if (query) {
    const number = digits(query);
    if (number && /^[+\d ()-]+$/.test(query)) {
      const alternate = number.replace(/^[78](?=\d{10}$)/, prefix => prefix === '8' ? '7' : '8');
      filter(where, 'instr(s.phoneDigits, ?) > 0 OR instr(s.phoneDigits, ?) > 0', number, alternate);
    } else {
      filter(where, 'instr(s.searchName, ?) > 0', query);
    }
  }
  const groupId = params.get('groupId');
  if (groupId) filter(where, 's.groupId = ?', groupId);
  const status = params.get('status');
  if (status) filter(where, 's.status = ?', status);
  const sorts: Record<string, string> = { name: 's.searchName ASC', '-name': 's.searchName DESC', '-progress': 's.theoryProgress DESC, s.searchName', group: 'g.searchName, s.searchName' };
  const key = params.get('sort') ?? 'name';
  const order = Object.hasOwn(sorts, key) ? sorts[key] : sorts.name;
  return readPage<Student>(studentColumns, studentsFrom, where, order + ', s.id', params.get('page'));
}
export function groups(actor: UserView, params: URLSearchParams) {
  const where = actor.role === 'INSTRUCTOR' ? scope('g.instructorId = ?', actor.profileId) : scope();
  const query = search(params);
  if (query) filter(where, 'instr(g.searchName, ?) > 0', query);
  return readPage<Group>(groupColumns, groupsFrom, where, 'g.searchName, g.id', params.get('page'));
}
export function instructors(params: URLSearchParams) {
  const query = search(params);
  const result = all<Instructor>(`SELECT ${instructorColumns} FROM ${instructorsFrom}`)
    .filter(item => !query || [item.name, item.car, item.phone].some(value => normalize(value).includes(query)) || (digits(query) && digits(item.phone).includes(digits(query))))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const pages = Math.max(1, Math.ceil(result.length / pageSize));
  const page = Math.max(1, Math.min(pages, Number.parseInt(params.get('page') ?? '1', 10) || 1));
  return { items: result.slice((page - 1) * pageSize, page * pageSize), count: result.length, pages, page };
}
export function lessonById(actor: UserView, id: string) {
  const where = lessonScope(actor);
  return found(one<Lesson>(`SELECT ${lessonColumns} FROM ${lessonsFrom} WHERE ${where.sql} AND l.id = ?`, ...where.values, id));
}
export function calendar(actor: UserView, week: string) {
  const where = lessonScope(actor);
  return all<Lesson>(`SELECT ${lessonColumns} FROM ${lessonsFrom}
    WHERE ${where.sql} AND l.status = 'PLANNED' AND l.date BETWEEN ? AND ?
    ORDER BY l.date, l.startMinute, l.id`, ...where.values, week, offsetDay(week, 6));
}
export function history(actor: UserView, params: URLSearchParams, student?: Student) {
  const where = student ? scope('(l.studentId = ? OR l.groupId = ?)', student.id, student.groupId) : scope();
  const allowed = lessonScope(actor);
  filter(where, allowed.sql, ...allowed.values);
  filter(where, "l.status IN ('DONE','CANCELLED')");
  const status = params.get('status');
  if (status && Object.hasOwn(lessonStatuses, status)) filter(where, 'l.status = ?', status);
  const query = search(params);
  if (query) {
    filter(where, `instr(coalesce(s.searchName, ''), ?) > 0
    OR instr(coalesce(g.searchName, ''), ?) > 0 OR instr(l.date, ?) > 0
    OR instr(substr(l.date,9,2) || '.' || substr(l.date,6,2) || '.' || substr(l.date,1,4), ?) > 0
    OR EXISTS (SELECT 1 FROM students gs WHERE gs.groupId = l.groupId AND gs.deletedAt IS NULL AND instr(gs.searchName, ?) > 0
      AND (? = 'ADMIN' OR (? = 'STUDENT' AND gs.id = ?) OR (? = 'INSTRUCTOR' AND g.instructorId = ?)))`,
      query, query, query, query, query, actor.role, actor.role, actor.profileId, actor.role, actor.profileId);
  }
  return readPage<Lesson>(lessonColumns, lessonsFrom, where, 'l.date DESC, l.startMinute DESC, l.id', params.get('page'));
}
export function payments(actor: UserView, params: URLSearchParams, studentId?: string) {
  const where = paymentScope(actor);
  const student = studentId || params.get('studentId');
  if (student) filter(where, 'p.studentId = ?', student);
  const from = params.get('from');
  const to = params.get('to');
  if (from) filter(where, 'p.date >= ?', from);
  if (to) filter(where, 'p.date <= ?', to);
  const page = readPage<Payment>(paymentColumns, 'payments p', where, 'p.date DESC, p.receiptNumber DESC', params.get('page'));
  page.total = one<{ total: number }>(`SELECT coalesce(sum(p.amount), 0) AS total FROM payments p WHERE ${where.sql}`, ...where.values)?.total ?? 0;
  return page;
}
export function receipt(actor: UserView, id: string) {
  const where = paymentScope(actor);
  return found(one<Payment>(`SELECT ${paymentColumns} FROM payments p WHERE ${where.sql} AND p.id = ?`, ...where.values, id));
}
export function requests(actor: UserView, params: URLSearchParams) {
  const where = requestScope(actor);
  const status = params.get('status');
  if (status) filter(where, 'r.status = ?', status);
  return readPage<Inquiry>(requestColumns, requestsFrom, where, 'r.createdAt DESC, r.id', params.get('page'));
}
export function detail(actor: UserView, id: string, params: URLSearchParams): StudentDetail {
  const person = studentById(actor, id);
  const historyParams = new URLSearchParams({ page: params.get('lessonPage') || '1' });
  const paymentParams = new URLSearchParams({ page: params.get('paymentPage') || '1' });
  return {
    ...person,
    lessons: history(actor, historyParams, person),
    payments: actor.role === 'INSTRUCTOR' ? { items: [], page: 1, pages: 1, count: 0 } : payments(actor, paymentParams, id),
  };
}
export function options(actor: UserView): Options {
  if (actor.role === 'STUDENT') return { students: [], activeStudents: [], instructors: [], groups: [] };
  const where = studentScope(actor);
  const records = all<Item & { status: string }>(`SELECT s.id, s.name, s.status FROM ${studentsFrom} WHERE ${where.sql} ORDER BY s.searchName`, ...where.values);
  const ownGroups = actor.role === 'ADMIN' ? scope() : scope('instructorId = ?', actor.profileId);
  const ownInstructors = actor.role === 'ADMIN' ? scope() : scope('id = ?', actor.profileId);
  return {
    students: records.map(({ id, name }) => ({ id, name })),
    activeStudents: records.filter(item => item.status === 'ACTIVE').map(({ id, name }) => ({ id, name })),
    groups: all(`SELECT id, name, instructorId FROM groups WHERE ${ownGroups.sql} ORDER BY searchName`, ...ownGroups.values),
    instructors: all<Item>(`SELECT id, name FROM instructors WHERE ${ownInstructors.sql}`, ...ownInstructors.values).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  };
}
export function dashboard(actor: UserView): Dashboard {
  const today = dateInZone(zone);
  const month = today.slice(0, 7);
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() - 5 + index);
    const key = date.toISOString().slice(0, 7);
    const amount = actor.role === 'ADMIN'
      ? one<{ total: number }>('SELECT coalesce(sum(amount),0) AS total FROM payments WHERE date >= ? AND date <= ?', key + '-01', key + '-31')?.total ?? 0
      : 0;
    return { month: key, amount };
  });
  const where = studentScope(actor);
  const groupWhere = actor.role === 'ADMIN' ? scope() : scope('instructorId = ?', actor.profileId);
  const upcoming = lessonScope(actor);
  return {
    today, monthly, revenue: monthly[5].amount,
    students: one<{ count: number }>(`SELECT count(*) AS count FROM ${studentsFrom} WHERE ${where.sql}`, ...where.values)?.count ?? 0,
    instructors: actor.role === 'ADMIN' ? one<{ count: number }>('SELECT count(*) AS count FROM instructors')?.count ?? 0 : 0,
    groups: one<{ count: number }>(`SELECT count(*) AS count FROM groups WHERE ${groupWhere.sql}`, ...groupWhere.values)?.count ?? 0,
    upcoming: all<Lesson>(`SELECT ${lessonColumns} FROM ${lessonsFrom}
      WHERE ${upcoming.sql} AND l.status = 'PLANNED' AND (l.date > ? OR (l.date = ? AND l.startTime >= ?))
      ORDER BY l.date, l.startMinute, l.id LIMIT 5`, ...upcoming.values, today, today, timeInZone(zone)),
    requests: actor.role === 'ADMIN' ? all<Inquiry>(`SELECT ${requestColumns} FROM ${requestsFrom} WHERE r.status = 'NEW' ORDER BY r.createdAt DESC LIMIT 5`) : [],
  };
}

export function changeProgress(actor: UserView, id: string, value: number) {
  return atomic(() => {
    studentById(actor, id);
    run('UPDATE students SET theoryProgress = ? WHERE id = ?', value, id);
    return studentById(actor, id);
  });
}
export function setLessonStatus(actor: UserView, id: string, status: 'DONE' | 'CANCELLED') {
  return atomic(() => {
    const lesson = lessonById(actor, id);
    if (lesson.status !== 'PLANNED' && lesson.status !== status) throw new ApiError(409, 'Статус этого занятия уже изменён.');
    run('UPDATE lessons SET status = ? WHERE id = ?', status, id);
    return lessonById(actor, id);
  });
}
export function acceptPayment(actor: UserView, id: string, studentId: string, amount: number, date: string, method: string, comment: string) {
  return atomic(() => {
    const student = studentById(actor, studentId);
    if (student.status !== 'ACTIVE') throw new ApiError(422, 'Оплата доступна только для активных учеников.', { studentId: 'Выберите активного ученика.' });
    run('INSERT INTO payments (id,studentId,studentName,amount,date,method,comment) VALUES (?,?,?,?,?,?,?)', id, studentId, student.name, amount, date, method, comment);
    return receipt(actor, id);
  });
}
