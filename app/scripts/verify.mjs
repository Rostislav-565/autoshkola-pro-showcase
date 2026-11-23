import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const folder = mkdtempSync(join(tmpdir(), 'autoshkola-pro-'));
Object.assign(process.env, { DATABASE_PATH: join(folder, 'verify.sqlite'), PORT: '0', HOST: '127.0.0.1', COOKIE_SECURE: 'false' });
delete process.env.ORIGIN;
let server;
let database;
try {
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/migrate.ts'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/seed.ts'], { stdio: 'inherit' });
  ({ server } = await import('../build/server.js'));
  ({ database } = await import('../build/db.js'));
  if (!server.listening) await once(server, 'listening');
  const root = 'http://127.0.0.1:' + server.address().port;

  class Client {
    cookie = '';
    async send(path, { method = 'GET', body, status = 200 } = {}) {
      const headers = { Cookie: this.cookie };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, status, method + ' ' + path);
      const session = response.headers.get('set-cookie');
      if (session) this.cookie = session.split(';')[0];
      if (response.headers.get('content-type')?.includes('application/json')) return response.json();
      return response.text();
    }
    post(path, body, status = 201) { return this.send(path, { method: 'POST', body, status }); }
    patch(path, body, status = 200) { return this.send(path, { method: 'PATCH', body, status }); }
    login(login, password, status = 200) { return this.post('/api/login', { login, password }, status); }
  }
  const guest = new Client();
  const admin = new Client();
  const instructor = new Client();
  const pupil = new Client();
  const template = { phone: '+7 (900) 555-10-23', birthDate: '2000-01-15', status: 'ACTIVE', theoryProgress: 0 };
  const loginHtml = await guest.send('/login');
  assert.match(loginHtml, /lang="ru"/);
  await guest.send('/api/students', { status: 401 });
  const wrong = await guest.login('admin', 'wrong', 401);
  assert.equal(wrong.message, 'Неверный логин или пароль');
  await admin.login('admin', 'admin123');
  const { today } = await admin.send('/api/me');
  const overview = await admin.send('/api/dashboard');
  assert.deepEqual([overview.students, overview.instructors, overview.groups, overview.requests.length], [15, 4, 3, 2]);
  assert.equal(overview.monthly.length, 6);
  console.log('✓ Вход и исходные данные для обзора');

  const student = await admin.post('/api/students', { ...template, name: 'Контрольный Ученик Проверки' });
  const validation = await admin.post('/api/students', { ...template, name: '' }, 422);
  assert.ok(validation.fields.name);
  const group = await admin.post('/api/groups', { name: 'Контрольная группа', instructorId: 'i-1', studentId: student.id });
  assert.equal((await admin.send('/api/students/' + student.id)).groupId, group.id);
  assert.equal((await admin.send('/api/students?q=' + encodeURIComponent('КОНТРОЛЬНЫЙ'))).count, 1);
  assert.equal((await admin.send('/api/students?q=' + encodeURIComponent('8 (900) 555-10-23'))).items[0].id, student.id);
  assert.equal((await admin.send('/api/groups?q=' + encodeURIComponent('контрольная'))).items[0].id, group.id);
  const slot = { type: 'INDIVIDUAL', date: today, startTime: '21:05', durationMin: 50, studentId: student.id, instructorId: 'i-1', topic: 'Контрольное вождение' };
  const lesson = await admin.post('/api/schedule', slot);
  assert.ok((await admin.send('/api/schedule?week=' + today)).some(item => item.id === lesson.id));
  const overlap = await admin.post('/api/schedule', { ...slot, startTime: '21:45' }, 409);
  assert.match(overlap.message, /уже есть занятие/);
  await admin.patch('/api/schedule/' + lesson.id + '/status', { status: 'DONE' });
  assert.ok(!(await admin.send('/api/schedule?week=' + today)).some(item => item.id === lesson.id));
  const recent = await admin.send('/api/history?status=DONE&q=' + encodeURIComponent('Контрольный Ученик'));
  assert.equal(recent.items[0].id, lesson.id);
  const cancellation = await admin.post('/api/schedule', { ...slot, startTime: '22:10' });
  await admin.patch('/api/schedule/' + cancellation.id + '/status', { status: 'CANCELLED' });
  const replacement = await admin.post('/api/schedule', { ...slot, startTime: '22:10', topic: 'Освобождённый слот' });
  console.log('✓ Ученик, группа, индивидуальное занятие, пересечение, отмена и поиск в истории');

  const payment = await admin.post('/api/payments', { studentId: student.id, amount: 195050, date: today, method: 'CARD', comment: '' });
  const otherPayment = await admin.post('/api/payments', { studentId: 's-1', amount: 75000, date: today, method: 'CASH', comment: 'Проверка' });
  assert.ok(otherPayment.receiptNumber > payment.receiptNumber);
  assert.equal((await admin.send('/api/receipts/' + payment.id)).studentName, student.name);
  assert.match(await admin.send('/receipts/' + payment.id), /style\.css/);
  assert.match(await admin.send('/style.css'), /@media print/);
  assert.equal((await admin.send('/api/payments?studentId=' + student.id + '&from=' + today + '&to=' + today)).total, 195050);
  await admin.post('/api/payments', { studentId: 's-14', amount: 20000, date: today, method: 'CARD' }, 422);
  console.log('✓ Оплата, итог фильтра, уникальные номера и запрет оплаты за неактивного ученика');

  await instructor.login('instructor', 'instructor123');
  assert.ok((await instructor.send('/api/groups')).items.every(item => item.instructorId === 'i-1'));
  assert.ok((await instructor.send('/api/schedule?week=' + today)).every(item => item.instructorId === 'i-1'));
  await instructor.send('/api/students/s-2', { status: 404 });
  await instructor.patch('/api/students/s-2/progress', { theoryProgress: 80 }, 404);
  assert.equal((await instructor.patch('/api/students/' + student.id + '/progress', { theoryProgress: 83 })).theoryProgress, 83);
  await instructor.patch('/api/schedule/' + replacement.id + '/status', { status: 'DONE' });
  await instructor.send('/api/receipts/' + payment.id, { status: 403 });
  await instructor.send('/api/settings/export', { status: 403 });

  await pupil.login('student', 'student123');
  const personal = await pupil.send('/api/students/s-1');
  assert.equal(personal.name, 'Петрова Анна Максимовна');
  assert.ok((await pupil.send('/api/payments')).items.every(item => item.studentId === 's-1'));
  assert.ok((await pupil.send('/api/schedule?week=' + today)).every(item => item.studentId === 's-1' || item.groupId === 'g-1'));
  await pupil.send('/api/students/' + student.id, { status: 403 });
  await pupil.send('/api/schedule/' + lesson.id, { status: 404 });
  await pupil.send('/api/receipts/' + payment.id, { status: 404 });
  await pupil.patch('/api/students/s-1/progress', { theoryProgress: 100 }, 403);
  assert.equal((await pupil.send('/api/receipts/' + otherPayment.id)).id, otherPayment.id);
  const text = 'Проверочное обращение.\nВторая строка должна сохраниться.';
  const inquiry = await pupil.post('/api/requests', { text });
  const newItems = await admin.send('/api/requests?status=NEW');
  assert.equal(newItems.items.find(item => item.id === inquiry.id)?.text, text);
  await admin.patch('/api/requests/' + inquiry.id + '/done');
  assert.ok((await admin.send('/api/requests?status=DONE')).items.some(item => item.id === inquiry.id));
  console.log('✓ Доступ трёх ролей по спискам и прямым идентификаторам, прогресс, обращение и обработка');

  const snapshot = await admin.send('/api/settings/export');
  assert.equal(snapshot.version, 1);
  const identical = await admin.post('/api/settings/import', snapshot, 200);
  assert.deepEqual([identical.created, identical.updated, identical.errorCount], [0, 0, 0]);
  const invalid = structuredClone(snapshot);
  invalid.tables.students.find(item => item.id === student.id).theoryProgress = 101;
  const rejected = await admin.post('/api/settings/import', invalid, 200);
  assert.equal(rejected.errorCount, 1);
  const update = structuredClone(snapshot);
  update.tables.students.find(item => item.id === student.id).theoryProgress = 90;
  update.tables.requests.push({ id: 'import-verification', userId: 'u-student', text: 'Контроль импорта', status: 'NEW', createdAt: new Date().toISOString() });
  const applied = await admin.post('/api/settings/import', update, 200);
  assert.deepEqual([applied.created, applied.updated, applied.errorCount], [1, 1, 0]);
  const invalidReference = structuredClone(update);
  invalidReference.tables.students.find(item => item.id === student.id).groupId = 'missing-record';
  assert.equal((await admin.post('/api/settings/import', invalidReference, 200)).errorCount, 1);
  await admin.send('/api/students/' + student.id, { method: 'DELETE' });
  await admin.send('/api/students/' + student.id, { status: 404 });
  assert.equal((await admin.send('/api/receipts/' + payment.id)).studentName, student.name);
  await admin.post('/api/students/' + student.id + '/undo', undefined, 200);
  assert.equal((await admin.send('/api/students/' + student.id)).theoryProgress, 90);
  await pupil.post('/api/logout', undefined, 200);
  await pupil.send('/api/me', { status: 401 });
  console.log('✓ Экспорт, повторный импорт, обновление и создание, отклонение неверных данных, удаление и отмена');

  for (let index = 0; index < 36; index++) await admin.post('/api/students', { ...template, name: 'Проверка пагинации ' + index });
  const first = await admin.send('/api/students');
  const second = await admin.send('/api/students?page=2');
  assert.deepEqual([first.count, first.pages, first.items.length, second.items.length], [52, 2, 50, 2]);
  console.log('✓ Пагинация после 50 записей');
} finally {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  database?.close();
  rmSync(folder, { recursive: true, force: true });
}
