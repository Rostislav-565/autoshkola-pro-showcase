import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { login, logout, checkPassword, limitLogin, userFor } from './auth.ts';
import { exportData, importData } from './backup.ts';
import { migrate, one, zone } from './db.ts';
import { addRequest, lessonStatus, processRequest, progress, removeGroup, removeInstructor, removeStudent, restoreStudent, saveGroup, saveInstructor, saveLesson, savePayment, saveStudent } from './mutations.ts';
import { calendar, dashboard, detail, groups, history, instructors, lessonById, options, payments, receipt, requests, students } from './records.ts';
import { dateInZone, monday, validDay } from './shared.ts';
import type { Role, UserView } from './shared.ts';
import { ApiError, Form } from './validation.ts';

migrate();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3041);
const assets = new Map([
  ['/app.js', { file: 'build/app.js', type: 'text/javascript; charset=utf-8' }],
  ['/shared.js', { file: 'build/shared.js', type: 'text/javascript; charset=utf-8' }],
  ['/ui.js', { file: 'build/ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/views.js', { file: 'build/views.js', type: 'text/javascript; charset=utf-8' }],
  ['/dialogs.js', { file: 'build/dialogs.js', type: 'text/javascript; charset=utf-8' }],
  ['/style.css', { file: 'public/style.css', type: 'text/css; charset=utf-8' }],
  ['/favicon.svg', { file: 'public/favicon.svg', type: 'image/svg+xml' }],
]);
const html = readFileSync('public/index.html', 'utf8');

const nav = {
  ADMIN: ['dashboard','students','groups','instructors','schedule','history','payments','receipts','requests','settings'],
  INSTRUCTOR: ['dashboard','students','groups','schedule','history'],
  STUDENT: ['dashboard','students','schedule','history','payments','receipts','requests'],
} satisfies Record<Role, string[]>;
function pageAllowed(user: UserView, page: string, id?: string) {
  if (user.role === 'STUDENT' && page === 'students') return id === user.profileId;
  return nav[user.role].includes(page);
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { Location: location });
  res.end();
}
function body(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      req.resume();
      reject(new ApiError(415, 'Отправьте данные в формате JSON.'));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
      else if (chunks.length) chunks.length = 0;
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new ApiError(400, 'Передача данных прервана.')));
    req.on('end', () => {
      if (size > limit) return reject(new ApiError(413, 'Файл или запрос слишком большой.'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(new ApiError(400, 'Некорректный JSON.'));
      }
    });
  });
}
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  const expected = process.env.ORIGIN || `http://${req.headers.host || `${host}:${port}`}`;
  if ((origin && origin !== expected) || req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Запрос с другого сайта отклонён.');
}
function admin(user: UserView) {
  if (user.role !== 'ADMIN') throw new ApiError(403, 'У вас нет доступа к этому действию.');
}
function routeParts(path: string) {
  return path.split('/').slice(1).filter(Boolean).map(decodeURIComponent);
}
async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const [, section, id, action, extra] = routeParts(url.pathname);
  const method = req.method ?? 'GET';
  if (extra) throw new ApiError(404, 'Страница не найдена.');
  if (method !== 'GET') sameOrigin(req);
  if (section === 'login' && !id && method === 'POST') {
    const invalid = 'Неверный логин или пароль';
    if (!limitLogin(req)) throw new ApiError(429, 'Слишком много попыток. Повторите через минуту.');
    const form = new Form(await body(req, 8192));
    const account = form.text('login', 'Введите логин.', 40).toLowerCase();
    const password = form.password(true, 1);
    form.done();
    const row = one<{ id: string; passwordHash: string }>(`SELECT u.id,u.passwordHash FROM users u WHERE login = ? AND (
      u.role = 'ADMIN' OR EXISTS (SELECT 1 FROM students s WHERE s.userId = u.id AND s.deletedAt IS NULL)
      OR EXISTS (SELECT 1 FROM instructors i WHERE i.userId = u.id))`, account);
    const valid = await checkPassword(password, row?.passwordHash);
    if (!row || !valid) throw new ApiError(401, invalid);
    logout(req, res);
    login(res, row.id);
    return json(res, 200, { ok: true });
  }
  const user = userFor(req);
  if (!user) throw new ApiError(401, 'Войдите в систему.');
  const query = url.searchParams;
  if (section === 'logout' && !id && method === 'POST') {
    logout(req, res);
    return json(res, 200, { ok: true });
  }
  if (method === 'GET' && !id) {
    if (section === 'me') return json(res, 200, { user, today: dateInZone(zone) });
    if (section === 'options') return json(res, 200, options(user));
  }
  if (!section || !pageAllowed(user, section, id)) throw new ApiError(403, 'У вас нет доступа к этому разделу.');
  if (method === 'GET' && !action) {
    switch (section) {
      case 'dashboard': if (!id) return json(res, 200, dashboard(user)); break;
      case 'students': return json(res, 200, id ? detail(user, id, query) : students(user, query));
      case 'groups': if (!id) return json(res, 200, groups(user, query)); break;
      case 'instructors': if (!id) return json(res, 200, instructors(query)); break;
      case 'schedule': {
        const week = query.get('week') || dateInZone(zone);
        if (!validDay(week)) throw new ApiError(422, 'Выберите корректную дату недели.');
        return json(res, 200, id ? lessonById(user, id) : calendar(user, monday(week)));
      }
      case 'history': if (!id) return json(res, 200, history(user, query)); break;
      case 'payments': if (!id) return json(res, 200, payments(user, query)); break;
      case 'receipts': if (id) return json(res, 200, receipt(user, id)); break;
      case 'requests': if (!id) return json(res, 200, requests(user, query)); break;
      case 'settings': if (id === 'export') {
        res.setHeader('Content-Disposition', `attachment; filename="autoshkola-${dateInZone(zone)}.json"`);
        return json(res, 200, exportData());
      } break;
    }
  }
  if (section === 'requests' && !id && method === 'POST' && (user.role === 'STUDENT' || user.role === 'ADMIN')) {
    return json(res, 201, addRequest(user, new Form(await body(req, 32_768))));
  }
  if (id && method === 'PATCH' && user.role !== 'STUDENT') {
    if (section === 'students' && action === 'progress') return json(res, 200, progress(user, id, new Form(await body(req, 8192))));
    if (section === 'schedule' && action === 'status') return json(res, 200, lessonStatus(user, id, new Form(await body(req, 8192))));
  }
  admin(user);
  if (section === 'settings' && id === 'import' && !action && method === 'POST') return json(res, 200, importData(user, await body(req, 32_000_000)));
  if (section === 'students' && id && action === 'undo' && method === 'POST') return json(res, 200, restoreStudent(user, id));
  if (section === 'requests' && id && action === 'done' && method === 'PATCH') return json(res, 200, processRequest(id));
  if (id && !action && method === 'DELETE') {
    if (section === 'students') return json(res, 200, removeStudent(user, id));
    if (section === 'groups') return json(res, 200, removeGroup(id));
    if (section === 'instructors') return json(res, 200, removeInstructor(id));
  }
  if (!action && ((method === 'POST' && !id) || (method === 'PUT' && id))) {
    const form = new Form(await body(req, 32_768));
    const status = id ? 200 : 201;
    if (section === 'students') return json(res, status, await saveStudent(user, id, form));
    if (section === 'groups') return json(res, status, saveGroup(id, form));
    if (section === 'instructors') return json(res, status, await saveInstructor(id, form));
    if (section === 'schedule') return json(res, status, saveLesson(user, id, form));
    if (section === 'payments' && !id) return json(res, status, savePayment(user, form));
  }
  throw new ApiError(404, 'Страница не найдена.');
}
function sendError(res: ServerResponse, error: unknown) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof ApiError) return json(res, error.status, { message: error.message, fields: error.fields });
  if (error instanceof URIError) return json(res, 400, { message: 'Некорректный адрес.' });
  if (error instanceof Error) {
    if (error.message.includes('LESSON_OVERLAP')) return json(res, 409, { message: 'У инструктора уже есть занятие в это время.', fields: { startTime: 'Выберите время без пересечений.' } });
    if (error.message.includes('STUDENT_INACTIVE')) return json(res, 422, { message: 'Оплата доступна только для активных учеников.' });
    if (error.message.includes('locked')) return json(res, 503, { message: 'База занята. Повторите действие через несколько секунд.' });
  }
  console.error(error);
  json(res, 500, { message: 'Не удалось выполнить запрос. Попробуйте ещё раз.' });
}
export const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const asset = assets.get(url.pathname);
    if (asset && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': asset.type });
      return res.end(readFileSync(asset.file));
    }
    if (req.method !== 'GET') throw new ApiError(405, 'Метод запроса не поддерживается.');
    const user = userFor(req);
    if (url.pathname === '/') return redirect(res, user ? '/dashboard' : '/login');
    if (url.pathname === '/login' && user) return redirect(res, '/dashboard');
    if (url.pathname !== '/login' && !user) return redirect(res, '/login');
    const [page, id, extra] = routeParts(url.pathname);
    if (page !== 'login' && user && !extra && pageAllowed(user, page, id)) {
      if (page === 'receipts' && id) receipt(user, id);
      if (page === 'students' && id) detail(user, id, new URLSearchParams());
    }
    const allowed = page === 'login' || (user && !extra && pageAllowed(user, page, id));
    res.writeHead(allowed ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    sendError(res, error);
  }
});
server.listen(port, host, () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Автошкола PRO — http://${host}:${address.port}`);
});
