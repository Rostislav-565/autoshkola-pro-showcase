import { confirmDialog, editorView, groupEditor, instructorEditor, lessonDialog, lessonEditor, paymentEditor, progressEditor, requestEditor, studentEditor } from './dialogs.ts';
import type { Editor, Field } from './dialogs.ts';
import { monday, offsetDay, validDay } from './shared.ts';
import type { Dashboard, Group, Inquiry, Instructor, Lesson, Options, Page, Payment, Student, StudentDetail, UserView } from './shared.ts';
import { blank, button, esc, icon, urlId } from './ui.ts';
import { dashboardView, groupsView, historyView, instructorsView, loginView, paymentsView, receiptView, requestsView, scheduleView, settingsView, shell, skeleton, studentView, studentsView } from './views.ts';

type Route = { key: string; id?: string; params: URLSearchParams; path: string };
type Loaded = Dashboard | Page<Student> | StudentDetail | Page<Group> | Page<Instructor> | Lesson[] | Page<Lesson> | Page<Payment> | Page<Inquiry> | Payment | null;
type BackupReport = { created: number; updated: number; unchanged: number; errorCount: number; errors: string[] };
type Removal = { kind: 'students' | 'groups' | 'instructors'; id: string; name: string };
class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly fields?: Record<string, string>) { super(message); }
}
const app = document.querySelector<HTMLDivElement>('#app')!;
const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
const toasts = document.querySelector<HTMLDivElement>('#toasts')!;
const emptyOptions: Options = { students: [], activeStudents: [], groups: [], instructors: [] };
let options = emptyOptions;
let user: UserView | undefined;
let today = '';
let route: Route = currentRoute();
let data: Loaded = null;
let activeEditor: Editor | undefined;
let removal: Removal | undefined;
let revision = 0;
let debounce: number | undefined;
let working = false;
let mobileOpen = false;
let light = localStorage.getItem('autoshkola-theme') === 'light';
document.documentElement.dataset.theme = light ? 'light' : 'dark';

const content = () => document.querySelector<HTMLDivElement>('#content');
function currentRoute(): Route {
  const [key = 'dashboard', id] = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  return { key, id, params: new URLSearchParams(location.search), path: location.pathname };
}
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json() as T | { message: string; fields?: Record<string, string> };
  if (!response.ok) {
    const error = payload as { message: string; fields?: Record<string, string> };
    throw new HttpError(error.message || 'Не удалось выполнить запрос.', response.status, error.fields);
  }
  return payload as T;
}
const message = (error: unknown) => error instanceof HttpError ? error.message : 'Не удалось связаться с сервером. Повторите попытку.';
function toast(text: string, error = false, action?: { label: string; run: () => void; time: number }) {
  toasts.querySelectorAll('.toast:not(.toast-with-action)').forEach(old => old.remove());
  const box = document.createElement('div');
  box.className = 'toast ' + (error ? 'toast-error' : '');
  box.innerHTML = icon(error ? 'alert' : 'check') + '<span>' + esc(text) + '</span>';
  if (action) {
    box.classList.add('toast-with-action');
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'toast-action';
    control.textContent = action.label;
    control.addEventListener('click', () => { box.remove(); action.run(); });
    box.append(control);
  }
  toasts.append(box);
  window.setTimeout(() => box.remove(), action ? Math.max(0, action.time) : 4200);
}
function fail(error: unknown) {
  if (error instanceof HttpError && error.status === 401 && user) {
    location.assign('/login');
    return;
  }
  toast(message(error), true);
}
function setTitle() {
  document.title = (content()?.querySelector('h1')?.textContent || 'Вход') + ' · Автошкола PRO';
}
function selectedWeek() {
  const week = route.params.get('week');
  return monday(week && validDay(week) ? week : today);
}
function selectedDay() {
  const week = selectedWeek();
  const day = route.params.get('day') || (today >= week && today <= offsetDay(week, 6) ? today : week);
  return day >= week && day <= offsetDay(week, 6) ? day : week;
}
function markup(): string {
  if (!user) return '';
  switch (route.key) {
    case 'dashboard': return dashboardView(data as Dashboard, user);
    case 'students': return route.id ? studentView(data as StudentDetail, user) : studentsView(data as Page<Student>, user, options, route.params);
    case 'groups': return groupsView(data as Page<Group>, user, route.params);
    case 'instructors': return instructorsView(data as Page<Instructor>, route.params);
    case 'schedule': return scheduleView(data as Lesson[], user, today, selectedWeek(), selectedDay());
    case 'history': return historyView(data as Page<Lesson>, route.params);
    case 'payments': return paymentsView(data as Page<Payment>, user, options, route.params);
    case 'receipts': return receiptView(data as Payment);
    case 'requests': return requestsView(data as Page<Inquiry>, route.params, user);
    case 'settings': return settingsView();
    default: return blank('Страница не найдена', 'Выберите раздел в меню.', '<a class="button secondary" href="/dashboard">На главную</a>');
  }
}
function paint(preserveFilters = false) {
  const root = content();
  if (!root) return;
  const html = markup();
  const results = root.querySelector('#results');
  if (preserveFilters && results) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const fresh = template.content.querySelector('#results');
    if (fresh) {
      results.replaceChildren(...fresh.childNodes);
      return;
    }
  }
  root.innerHTML = html;
  setTitle();
}
const dataRoutes = ['dashboard','students','groups','instructors','schedule','history','payments','requests','receipts'];
async function load(mode: 'initial' | 'quiet' | 'filters' = 'initial', refreshOptions = false) {
  const token = ++revision;
  const root = content();
  if (!root) return;
  if (mode === 'initial') root.innerHTML = skeleton();
  root.setAttribute('aria-busy', 'true');
  try {
    const [nextData, nextOptions] = await Promise.all([
      dataRoutes.includes(route.key) ? api<Loaded>(route.path + location.search) : null,
      refreshOptions ? api<Options>('/options') : options,
    ]);
    if (token !== revision) return;
    options = nextOptions;
    data = nextData;
    paint(mode === 'filters');
  } catch (error) {
    if (token !== revision) return;
    fail(error);
    if (mode === 'initial') {
      root.innerHTML = blank('Не удалось открыть раздел', message(error), button('Повторить', 'retry', '', 'secondary'), 'alert');
      setTitle();
    }
  } finally {
    if (token === revision) root.removeAttribute('aria-busy');
  }
}
function setMobile(open: boolean) {
  mobileOpen = open;
  document.querySelector('.layout')?.classList.toggle('menu-open', open);
  const shade = document.querySelector<HTMLElement>('.mobile-shade');
  if (shade) shade.hidden = !open;
  document.querySelector('[data-action="menu"][aria-controls]')?.setAttribute('aria-expanded', String(open));
}
function page() {
  clearTimeout(debounce);
  route = currentRoute();
  closeDialog();
  setMobile(false);
  if (route.key === 'login') {
    app.innerHTML = loginView(light);
    setTitle();
    return;
  }
  if (!user) {
    location.assign('/login');
    return;
  }
  app.innerHTML = shell(user, route.key, today, light);
  void load('initial');
}
function go(to: string, push = true) {
  const target = new URL(to, location.origin);
  if (target.href === location.href) return;
  if (push) history.pushState(null, '', target);
  else history.replaceState(null, '', target);
  window.scrollTo(0, 0);
  page();
}
function updateParams(changes: Record<string, string>, mode: 'quiet' | 'filters' = 'quiet') {
  const next = new URLSearchParams(route.params);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (next.toString() === route.params.toString()) return;
  const qs = next.toString();
  history.replaceState(null, '', route.path + (qs ? '?' + qs : ''));
  route = currentRoute();
  void load(mode);
}
function showDialog(html: string, isEditor = false) {
  dialog.className = isEditor ? 'drawer dialog' : 'dialog modal';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  const input = dialog.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
  (input ?? dialog.querySelector<HTMLElement>('button'))?.focus();
}
function closeDialog() {
  if (working && dialog.open) return;
  if (dialog.open) {
    dialog.close();
    dialog.replaceChildren();
  }
  activeEditor = undefined;
  removal = undefined;
}
function openEditor(editor: Editor) {
  activeEditor = editor;
  showDialog(editorView(editor), true);
}
function setErrors(form: ParentNode, errors: Record<string, string> = {}) {
  form.querySelectorAll<HTMLElement>('[data-error]').forEach(node => {
    const key = node.dataset.error ?? '';
    node.textContent = errors[key] ?? '';
    const control = form.querySelector(`[name="${key}"]`);
    if (control) {
      if (errors[key]) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
  });
}
function fieldValue(field: Field, raw: FormDataEntryValue | null) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (field.kind !== 'number' || !value) return field.kind === 'password' ? raw : value;
  if (field.key === 'amount') return /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Math.round(Number(value.replace(',', '.')) * 100) : null;
  return Number(value);
}
async function submitEditor(form: HTMLFormElement) {
  const editor = activeEditor;
  if (!editor || working) return;
  setErrors(form);
  const fields = new FormData(form);
  const values = Object.fromEntries(editor.fields.filter(field => fields.has(field.key)).map(field => [field.key, fieldValue(field, fields.get(field.key))]));
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const old = btn.innerHTML;
  working = true;
  btn.disabled = true;
  btn.textContent = 'Сохранение…';
  try {
    const result = await api<{ id: string }>(editor.path, editor.method, values);
    working = false;
    closeDialog();
    toast(editor.message);
    if (editor.path === '/payments' && editor.method === 'POST') {
      go('/receipts/' + urlId(result.id));
    } else {
      await load('quiet', true);
    }
  } catch (error) {
    if (error instanceof HttpError) setErrors(form, error.fields);
    const note = form.querySelector('.form-error') ?? document.createElement('p');
    note.className = 'form-error';
    note.setAttribute('role', 'alert');
    note.textContent = message(error);
    if (!note.parentNode) form.querySelector('.dialog-body')?.append(note);
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    fail(error);
  } finally {
    working = false;
    btn.disabled = false;
    btn.innerHTML = old;
  }
}
async function submitLogin(form: HTMLFormElement) {
  setErrors(form);
  const note = form.querySelector<HTMLElement>('.login-error')!;
  note.textContent = '';
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  if (submit.disabled) return;
  submit.disabled = true;
  submit.textContent = 'Вход…';
  try {
    await api('/login', 'POST', Object.fromEntries(new FormData(form)));
    location.assign('/dashboard');
  } catch (error) {
    if (error instanceof HttpError) setErrors(form, error.fields);
    note.textContent = message(error);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Войти';
  }
}
async function submitBackup(form: HTMLFormElement) {
  const file = form.querySelector<HTMLInputElement>('[name="backup"]')?.files?.[0];
  setErrors(form);
  if (!file || !file.size || file.size > 32_000_000) {
    setErrors(form, { backup: 'Выберите JSON-файл размером до 32 МБ.' });
    return;
  }
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    let payload: unknown;
    try { payload = JSON.parse(await file.text()) as unknown; }
    catch { throw new HttpError('Файл содержит некорректный JSON.', 400); }
    const report = await api<BackupReport>('/settings/import', 'POST', payload);
    const target = document.querySelector('#import-report');
    if (target) target.innerHTML = `<section class="panel import-result"><h2>Отчёт об импорте</h2>
      <p>Создано ${report.created}, обновлено ${report.updated}, ошибок ${report.errorCount}.</p>
      ${report.unchanged ? `<p>Без изменений ${report.unchanged}.</p>` : ''}
      ${report.errors.length ? '<ul>' + report.errors.map(error => '<li>' + esc(error) + '</li>').join('') + '</ul>' : ''}</section>`;
    toast(report.errorCount ? 'Импорт отклонён. Подробности в отчёте.' : 'Импорт завершён.', Boolean(report.errorCount));
    if (!report.errorCount) options = await api<Options>('/options');
  } catch (error) {
    setErrors(form, { backup: message(error) });
    fail(error);
  } finally {
    submit.disabled = false;
  }
}
async function downloadBackup() {
  const response = await fetch('/api/settings/export', { cache: 'no-store' });
  if (!response.ok) {
    const error = await response.json() as { message: string };
    throw new HttpError(error.message, response.status);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'autoshkola-' + today + '.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  toast('Резервная копия сформирована.');
}
function itemFor<T extends { id: string }>(id: string) {
  return (data as Page<T> | null)?.items?.find(item => item.id === id);
}
function lessonFor(id: string) {
  return Array.isArray(data) ? data.find(item => item.id === id) : undefined;
}
async function optimisticLesson(id: string, status: 'DONE' | 'CANCELLED') {
  const previous = data;
  const pathname = location.href;
  const optimistic = Array.isArray(previous) ? previous.filter(lesson => lesson.id !== id) : previous;
  data = optimistic;
  closeDialog();
  paint();
  try {
    await api('/schedule/' + urlId(id) + '/status', 'PATCH', { status });
    toast(status === 'DONE' ? 'Занятие отмечено проведённым.' : 'Занятие отменено.');
  } catch (error) {
    if (location.href === pathname && data === optimistic) { data = previous; paint(); }
    throw error;
  }
}
async function optimisticRequest(id: string) {
  const previous = data as Page<Inquiry>;
  const pathname = location.href;
  const items = route.params.get('status') === 'NEW' ? previous.items.filter(item => item.id !== id)
    : previous.items.map(item => item.id === id ? { ...item, status: 'DONE' as const } : item);
  const optimistic = { ...previous, items };
  data = optimistic;
  paint(true);
  try {
    await api('/requests/' + urlId(id) + '/done', 'PATCH');
    toast('Обращение обработано.');
    if (location.href === pathname) await load('filters');
  } catch (error) {
    if (location.href === pathname && data === optimistic) { data = previous; paint(true); }
    throw error;
  }
}
async function performRemoval() {
  const current = removal;
  if (!current || working) return;
  const path = '/' + current.kind + '/' + urlId(current.id);
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-action="confirm-remove"]')!;
  working = true;
  confirm.disabled = true;
  try {
    const result = await api<{ expiresAt?: number }>(path, 'DELETE');
    working = false;
    closeDialog();
    if (result.expiresAt) {
      toast('Ученик удалён.', false, { label: 'Отменить', time: result.expiresAt - Date.now(), run: () => {
        void api(path + '/undo', 'POST').then(async () => { toast('Ученик восстановлен.'); await load('quiet', true); }).catch(fail);
      } });
    } else toast(current.kind === 'groups' ? 'Группа удалена.' : 'Инструктор удалён.');
    await load('quiet', true);
  } catch (error) {
    const alert = document.createElement('p');
    alert.className = 'form-error';
    alert.setAttribute('role', 'alert');
    alert.textContent = message(error);
    const body = dialog.querySelector('.dialog-body');
    body?.querySelector('.form-error')?.remove();
    body?.append(alert);
    throw error;
  } finally {
    confirm.disabled = false;
    working = false;
  }
}
function toggleType() {
  const type = dialog.querySelector<HTMLSelectElement>('[name="type"]')?.value;
  dialog.querySelectorAll<HTMLElement>('[data-type-field]').forEach(field => {
    const hidden = field.dataset.typeField !== type;
    field.hidden = hidden;
    const input = field.querySelector<HTMLSelectElement>('select');
    if (input) input.disabled = hidden;
  });
}
function toggleTheme() {
  light = !light;
  localStorage.setItem('autoshkola-theme', light ? 'light' : 'dark');
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const control = document.querySelector('[data-action="theme"]');
  const label = light ? 'Включить тёмную тему' : 'Включить светлую тему';
  if (control) {
    control.innerHTML = icon(light ? 'moon' : 'sun');
    control.setAttribute('aria-label', label);
    control.setAttribute('title', label);
  }
}
async function action(element: HTMLElement) {
  const { action: key, id = '', value = '', date, time } = element.dataset;
  const isAdmin = user?.role === 'ADMIN';
  switch (key) {
    case 'theme': return toggleTheme();
    case 'menu': return setMobile(!mobileOpen);
    case 'password': {
      const input = document.querySelector<HTMLInputElement>('#login-form [name="password"]');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        const label = input.type === 'password' ? 'Показать пароль' : 'Скрыть пароль';
        element.setAttribute('aria-label', label);
        element.setAttribute('title', label);
      }
      return;
    }
    case 'logout': await api('/logout', 'POST'); return location.assign('/login');
    case 'retry': return load();
    case 'close-dialog': return closeDialog();
    case 'confirm-remove': return performRemoval();
    case 'new-student': return openEditor(studentEditor(options, today));
    case 'new-group': return openEditor(groupEditor(options));
    case 'new-instructor': return openEditor(instructorEditor());
    case 'new-lesson': return openEditor(lessonEditor(options, date ?? today, time));
    case 'new-payment': return openEditor(paymentEditor(options, today, id || undefined));
    case 'new-request': return openEditor(requestEditor());
    case 'edit-student': {
      const item = route.id ? data as StudentDetail : itemFor<Student>(id);
      if (item) openEditor(studentEditor(options, today, item));
      return;
    }
    case 'edit-group': {
      const item = itemFor<Group>(id);
      if (item) openEditor(groupEditor(options, item));
      return;
    }
    case 'edit-instructor': {
      const item = itemFor<Instructor>(id);
      if (item) openEditor(instructorEditor(item));
      return;
    }
    case 'progress': return openEditor(progressEditor(data as StudentDetail));
    case 'view-lesson': {
      const item = lessonFor(id);
      if (item) showDialog(lessonDialog(item, isAdmin, user?.role !== 'STUDENT'));
      return;
    }
    case 'edit-lesson': {
      const item = lessonFor(id);
      if (item) openEditor(lessonEditor(options, item.date, item.startTime, item));
      return;
    }
    case 'lesson-done': return optimisticLesson(id, 'DONE');
    case 'lesson-cancel': return optimisticLesson(id, 'CANCELLED');
    case 'request-done': return optimisticRequest(id);
    case 'delete-student':
    case 'delete-group':
    case 'delete-instructor': {
      const item = itemFor<Student | Group | Instructor>(id);
      if (!item) return;
      const kind = key === 'delete-student' ? 'students' : key === 'delete-group' ? 'groups' : 'instructors';
      const label = kind === 'students' ? 'ученика' : kind === 'groups' ? 'группу' : 'инструктора';
      removal = { id, kind, name: item.name };
      showDialog(confirmDialog(item.name, label, kind === 'students' ? 'Карточка исчезнет из списка. Отменить удаление можно в течение 5 секунд.' : 'Подтвердите удаление записи.'));
      return;
    }
    case 'print': return window.print();
    case 'export': return downloadBackup();
    case 'week': return updateParams({ week: monday(value), day: value });
    case 'calendar-day': return updateParams({ day: value });
    case 'page': return updateParams({ [element.dataset.key ?? 'page']: value }, 'filters');
    case 'clear-filters': {
      clearTimeout(debounce);
      history.replaceState(null, '', route.path);
      route = currentRoute();
      await load('quiet');
      return;
    }
  }
}
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest<HTMLElement>('[data-action]');
  if (trigger) {
    if (trigger instanceof HTMLButtonElement && trigger.disabled) return;
    void action(trigger).catch(fail);
    return;
  }
  const link = event.target.closest<HTMLAnchorElement>('a[href]');
  if (!link || link.origin !== location.origin || link.download || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  go(link.href);
});
document.addEventListener('input', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.dataset.filter !== 'q') return;
  clearTimeout(debounce);
  debounce = window.setTimeout(() => updateParams({ q: input.value.trim(), page: '' }, 'filters'), 300);
});
document.addEventListener('change', event => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
  if (control.dataset.filter && control.dataset.filter !== 'q') {
    updateParams({ [control.dataset.filter]: control.value, page: '' }, 'filters');
  }
  if (control.closest('#editor-form')) {
    if (control.name === 'type') toggleType();
    if (control.name === 'groupId' && activeEditor?.path.startsWith('/schedule')) {
      const instructor = options.groups.find(group => group.id === control.value)?.instructorId;
      const field = dialog.querySelector<HTMLSelectElement>('[name="instructorId"]');
      if (field && instructor) field.value = instructor;
    }
  }
});
document.addEventListener('submit', event => {
  if (!(event.target instanceof HTMLFormElement)) return;
  const form = event.target;
  event.preventDefault();
  if (form.id === 'login-form') void submitLogin(form);
  if (form.id === 'editor-form') void submitEditor(form);
  if (form.id === 'import-form') void submitBackup(form);
});
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeDialog();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileOpen) setMobile(false);
});
window.addEventListener('popstate', page);
async function init() {
  if (route.key === 'login') { page(); return; }
  try {
    const session = await api<{ user: UserView; today: string }>('/me');
    user = session.user;
    today = session.today;
    options = await api<Options>('/options');
    page();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return location.assign('/login');
    app.innerHTML = blank('Не удалось открыть приложение', message(error), '<a class="button secondary" href="/login">К форме входа</a>', 'alert');
  }
}
void init();
