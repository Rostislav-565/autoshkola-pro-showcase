import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.ts';
import { atomic, one, run, zone } from './db.ts';
import { acceptPayment, changeProgress, lessonById, setLessonStatus, studentById } from './records.ts';
import { dateInZone, digits, methods, minutes, normalize, studentStatuses } from './shared.ts';
import type { Role, UserView } from './shared.ts';
import { ApiError, Form, found } from './validation.ts';

type Credentials = { login: string; passwordHash: string; name: string; phone: string; role: Role };
type Profile = { userId: string | null; login: string | null };
export const undoWindow = 5000;

async function credentials(form: Form, profile: Profile | undefined, name: string, phone: string, role: Role): Promise<Credentials> {
  const login = form.login();
  const password = form.password(Boolean(login && !profile?.userId));
  if (profile?.userId && !login) form.error('login', 'Укажите логин привязанного аккаунта.');
  if (password && !login) form.error('login', 'Укажите логин для нового пароля.');
  form.done();
  return { login, passwordHash: password ? await hashPassword(password) : '', name, phone, role };
}
function writeCredentials(input: Credentials, userId: string | null) {
  if (!input.login) return null;
  if (one('SELECT id FROM users WHERE login = ? AND id <> ?', input.login, userId ?? '')) {
    throw new ApiError(409, 'Этот логин уже занят.', { login: 'Выберите другой логин.' });
  }
  if (userId) {
    run('UPDATE users SET login = ?, name = ?, phone = ? WHERE id = ?', input.login, input.name, input.phone, userId);
    if (input.passwordHash) {
      run('UPDATE users SET passwordHash = ? WHERE id = ?', input.passwordHash, userId);
      run('DELETE FROM sessions WHERE userId = ?', userId);
    }
    return userId;
  }
  const id = randomUUID();
  if (!input.passwordHash) throw new ApiError(409, 'Аккаунт изменился. Откройте форму повторно.');
  run('INSERT INTO users VALUES (?,?,?,?,?,?)', id, input.login, input.passwordHash, input.name, input.phone, input.role);
  return id;
}
function studentProfile(id: string) {
  return found(one<Profile>('SELECT s.userId, u.login FROM students s LEFT JOIN users u ON u.id = s.userId WHERE s.id = ? AND s.deletedAt IS NULL', id));
}
function instructorProfile(id: string) {
  return found(one<Profile>('SELECT i.userId, u.login FROM instructors i LEFT JOIN users u ON u.id = i.userId WHERE i.id = ?', id));
}
export async function saveStudent(actor: UserView, id: string | undefined, form: Form) {
  const name = form.text('name', 'Введите ФИО (до 120 символов).');
  const phone = form.phone();
  const birthDate = form.date('birthDate', dateInZone(zone));
  const status = form.choice('status', Object.keys(studentStatuses));
  const theoryProgress = form.integer('theoryProgress', 0, 100, 'Укажите целое число от 0 до 100.');
  const groupId = form.text('groupId', 'Выберите группу.', 100, false) || null;
  const profile = id ? studentProfile(id) : undefined;
  const account = await credentials(form, profile, name, phone, 'STUDENT');
  return atomic(() => {
    const current = id ? studentProfile(id) : undefined;
    if (current?.userId !== profile?.userId) throw new ApiError(409, 'Карточка изменилась. Откройте форму повторно.');
    if (groupId && !one('SELECT id FROM groups WHERE id = ?', groupId)) throw new ApiError(422, 'Группа не найдена.', { groupId: 'Выберите доступную группу.' });
    const userId = writeCredentials(account, current?.userId ?? null);
    const resultId = id ?? randomUUID();
    if (id) run('UPDATE students SET name=?,searchName=?,phone=?,phoneDigits=?,birthDate=?,groupId=?,status=?,theoryProgress=?,userId=? WHERE id=?',
      name, normalize(name), phone, digits(phone), birthDate, groupId, status, theoryProgress, userId, id);
    else run('INSERT INTO students VALUES (?,?,?,?,?,?,?,?,?,?,NULL)',
      resultId, name, normalize(name), phone, digits(phone), birthDate, groupId, status, theoryProgress, userId);
    return studentById(actor, resultId);
  });
}
export async function saveInstructor(id: string | undefined, form: Form) {
  const name = form.text('name', 'Введите ФИО (до 120 символов).');
  const phone = form.phone();
  const car = form.text('car', 'Укажите автомобиль (до 120 символов).');
  const profile = id ? instructorProfile(id) : undefined;
  const account = await credentials(form, profile, name, phone, 'INSTRUCTOR');
  return atomic(() => {
    const current = id ? instructorProfile(id) : undefined;
    if (current?.userId !== profile?.userId) throw new ApiError(409, 'Карточка изменилась. Откройте форму повторно.');
    const userId = writeCredentials(account, current?.userId ?? null);
    const resultId = id ?? randomUUID();
    if (id) run('UPDATE instructors SET name=?,phone=?,car=?,userId=? WHERE id=?', name, phone, car, userId, id);
    else run('INSERT INTO instructors VALUES (?,?,?,?,?)', resultId, name, phone, car, userId);
    return { id: resultId };
  });
}
export function saveGroup(id: string | undefined, form: Form) {
  const name = form.text('name', 'Введите название группы (до 120 символов).');
  const instructorId = form.text('instructorId', 'Выберите инструктора.');
  const studentId = form.text('studentId', 'Выберите ученика.', 100, false);
  form.done();
  return atomic(() => {
    if (id) found(one('SELECT id FROM groups WHERE id = ?', id));
    if (!one('SELECT id FROM instructors WHERE id = ?', instructorId)) throw new ApiError(422, 'Инструктор не найден.', { instructorId: 'Выберите инструктора.' });
    if (studentId && !one('SELECT id FROM students WHERE id = ? AND deletedAt IS NULL', studentId)) throw new ApiError(422, 'Ученик не найден.', { studentId: 'Выберите ученика.' });
    if (one('SELECT id FROM groups WHERE searchName = ? AND id <> ?', normalize(name), id ?? '')) throw new ApiError(409, 'Группа с таким названием уже существует.', { name: 'Введите другое название.' });
    const resultId = id ?? randomUUID();
    if (id) run('UPDATE groups SET name=?,searchName=?,instructorId=? WHERE id=?', name, normalize(name), instructorId, id);
    else run('INSERT INTO groups VALUES (?,?,?,?)', resultId, name, normalize(name), instructorId);
    if (studentId) run('UPDATE students SET groupId = ? WHERE id = ?', resultId, studentId);
    return { id: resultId };
  });
}
export function saveLesson(actor: UserView, id: string | undefined, form: Form) {
  const type = form.choice('type', ['GROUP', 'INDIVIDUAL'] as const);
  const date = form.date('date');
  const startTime = form.text('startTime', 'Укажите время начала.', 5);
  const durationMin = form.integer('durationMin', 15, 480, 'Укажите длительность от 15 до 480 минут.');
  const groupId = type === 'GROUP' ? form.text('groupId', 'Выберите группу.') : null;
  const studentId = type === 'INDIVIDUAL' ? form.text('studentId', 'Выберите ученика.') : null;
  const instructorId = form.text('instructorId', 'Выберите инструктора.');
  const topic = form.text('topic', 'Укажите тему занятия (до 180 символов).', 180);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) form.error('startTime', 'Укажите время в формате ЧЧ:ММ.');
  if (minutes(startTime) + durationMin > 1440) form.error('durationMin', 'Занятие должно закончиться до полуночи.');
  form.done();
  return atomic(() => {
    if (id && lessonById(actor, id).status !== 'PLANNED') throw new ApiError(409, 'Редактировать можно только запланированные занятия.');
    if (!one('SELECT id FROM instructors WHERE id = ?', instructorId)) throw new ApiError(422, 'Инструктор не найден.', { instructorId: 'Выберите инструктора.' });
    if (groupId && !one('SELECT id FROM groups WHERE id = ? AND instructorId = ?', groupId, instructorId)) throw new ApiError(422, 'За группой закреплён другой инструктор.', { instructorId: 'Выберите инструктора этой группы.' });
    if (studentId && !one('SELECT id FROM students WHERE id = ? AND deletedAt IS NULL', studentId)) throw new ApiError(422, 'Ученик не найден.', { studentId: 'Выберите ученика.' });
    const resultId = id ?? randomUUID();
    if (id) run('UPDATE lessons SET type=?,date=?,startTime=?,startMinute=?,durationMin=?,groupId=?,studentId=?,instructorId=?,topic=? WHERE id=?',
      type, date, startTime, minutes(startTime), durationMin, groupId, studentId, instructorId, topic, id);
    else run("INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?,?,?,'PLANNED')",
      resultId, type, date, startTime, minutes(startTime), durationMin, groupId, studentId, instructorId, topic);
    return lessonById(actor, resultId);
  });
}
export function savePayment(actor: UserView, form: Form) {
  const studentId = form.text('studentId', 'Выберите ученика.');
  const amount = form.integer('amount', 1, 100_000_000_00, 'Укажите сумму больше нуля, до 100 млн ₽.');
  const date = form.date('date', dateInZone(zone));
  const method = form.choice('method', Object.keys(methods));
  const comment = form.text('comment', 'Комментарий должен содержать не больше 500 символов.', 500, false);
  form.done();
  return acceptPayment(actor, randomUUID(), studentId, amount, date, method, comment);
}
export function removeStudent(actor: UserView, id: string) {
  return atomic(() => {
    studentById(actor, id);
    const now = Date.now();
    run('UPDATE students SET deletedAt = ? WHERE id = ?', now, id);
    run('DELETE FROM sessions WHERE userId = (SELECT userId FROM students WHERE id = ?)', id);
    return { expiresAt: now + undoWindow };
  });
}
export function restoreStudent(actor: UserView, id: string) {
  return atomic(() => {
    const row = found(one<{ deletedAt: number | null }>('SELECT deletedAt FROM students WHERE id = ?', id));
    if (row.deletedAt === null) return studentById(actor, id);
    if (Date.now() > row.deletedAt + undoWindow) throw new ApiError(410, 'Время отмены истекло.');
    run('UPDATE students SET deletedAt = NULL WHERE id = ?', id);
    return studentById(actor, id);
  });
}
export function removeGroup(id: string) {
  return atomic(() => {
    found(one('SELECT id FROM groups WHERE id = ?', id));
    if (one('SELECT id FROM lessons WHERE groupId = ? LIMIT 1', id)) throw new ApiError(409, 'У группы есть занятия. Удаление нарушит историю расписания.');
    run('DELETE FROM groups WHERE id = ?', id);
    return { id };
  });
}
export function removeInstructor(id: string) {
  return atomic(() => {
    const { userId } = instructorProfile(id);
    if (one('SELECT id FROM groups WHERE instructorId = ? LIMIT 1', id)
      || one('SELECT id FROM lessons WHERE instructorId = ? LIMIT 1', id)) throw new ApiError(409, 'У инструктора есть группы или занятия. Сначала переназначьте группы. История занятий сохраняется.');
    if (userId) run('DELETE FROM sessions WHERE userId = ?', userId);
    run('DELETE FROM instructors WHERE id = ?', id);
    return { id };
  });
}
export function progress(actor: UserView, id: string, form: Form) {
  const value = form.integer('theoryProgress', 0, 100, 'Укажите целое число от 0 до 100.');
  form.done();
  return changeProgress(actor, id, value);
}
export function lessonStatus(actor: UserView, id: string, form: Form) {
  const status = form.choice('status', ['DONE', 'CANCELLED'] as const);
  form.done();
  return setLessonStatus(actor, id, status);
}
export function addRequest(actor: UserView, form: Form) {
  const text = form.text('text', 'Введите текст обращения (до 4000 символов).', 4000);
  form.done();
  const id = randomUUID();
  run("INSERT INTO requests VALUES (?,?,?,'NEW',?)", id, actor.id, text, new Date().toISOString());
  return { id };
}
export function processRequest(id: string) {
  found(one('SELECT id FROM requests WHERE id = ?', id));
  run("UPDATE requests SET status = 'DONE' WHERE id = ?", id);
  return { id };
}
