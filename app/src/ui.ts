import { formatDay, lessonStatuses, methods, money, receiptNumber, studentStatuses } from './shared.ts';
import type { Lesson, Page, Payment, StudentStatus } from './shared.ts';

const icons: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
  students: '<path d="M2 9l10-5 10 5-10 5L2 9zm4 2v5c3 3 9 3 12 0v-5m4-2v6"/>',
  group: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-3-12a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  car: '<path d="M5 17v2m14-2v2M3 15v-3l2-2 2-5h10l2 5 2 2v5H3v-2zm2-5h14m-12 3h1m8 0h1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
  history: '<path d="M3 12a9 9 0 1 1 2 6M3 7v5h5m4-5v5l3 2"/>',
  wallet: '<path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V7m18 6h-5a2 2 0 0 0 0 4h5"/>',
  message: '<path d="M21 11a8 8 0 0 1-8 8H9l-5 3v-6a8 8 0 0 1-2-5 8 8 0 0 1 8-8h3a8 8 0 0 1 8 8zM8 11h7"/>',
  settings: '<path d="M10 3h4l.6 2.6 2.4 1.4 2.6-.8 2 3.5-2 1.8v2.7l2 1.8-2 3.5-2.6-.8-2.4 1.4L14 23h-4l-.6-2.9-2.4-1.4-2.6.8-2-3.5 2-1.8v-2.7l-2-1.8 2-3.5 2.6.8 2.4-1.4L10 3z" transform="translate(0 -1)"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3z"/>',
  logout: '<path d="M10 17l5-5-5-5m-7 5h12m-3-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  pencil: '<path d="m15 5 4 4M4 20l4.4-1 11.5-11.5a2.8 2.8 0 0 0-4-4L4.5 15 4 20z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/>',
  print: '<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM6 12h1"/>',
  receipt: '<path d="M6 3l3 2 3-2 3 2 3-2v18l-3-2-3 2-3-2-3 2V3zm3 7h6m-6 4h6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/>',
};
export const icon = (name: string) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
export const urlId = (value: string) => encodeURIComponent(value);
export const initials = (name: string) => esc(name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase());
export const avatar = (name: string, style = '') => `<span class="avatar ${style}" aria-hidden="true">${initials(name)}</span>`;
export function button(text: string, action: string, glyph = 'plus', style = 'primary', attrs = '') {
  return `<button type="button" class="button ${style}" data-action="${action}" ${attrs}>${glyph ? icon(glyph) : ''}${esc(text)}</button>`;
}
export function iconButton(text: string, action: string, glyph: string, attrs = '') {
  return `<button type="button" class="icon-button" data-action="${action}" aria-label="${esc(text)}" title="${esc(text)}" ${attrs}>${icon(glyph)}</button>`;
}
export const dataId = (id: string) => `data-id="${esc(id)}"`;
export const progress = (value: number) => `<div class="progress" aria-label="Прогресс ${value}%"><span class="track"><span style="width:${value}%"></span></span><span>${value}%</span></div>`;
const colors = { ACTIVE: 'green', GRADUATED: 'blue', EXPELLED: 'red', PLANNED: 'blue', DONE: 'green', CANCELLED: 'red', NEW: 'amber' };
export const badge = (label: string, status: keyof typeof colors) => `<span class="badge ${colors[status]}"><i></i>${esc(label)}</span>`;
export const studentBadge = (status: StudentStatus) => badge(studentStatuses[status], status);
export const lessonBadge = (lesson: Lesson) => badge(lessonStatuses[lesson.status], lesson.status);
export const lessonWho = (lesson: Lesson) => lesson.studentName || lesson.groupName || '—';

export type Cell = { view: string; className?: string };
export function table(headings: string[], rows: Cell[][]) {
  return `<div class="table-wrap"><table><thead><tr>${headings.map(heading => '<th scope="col">' + esc(heading) + '</th>').join('')}</tr></thead>
    <tbody>${rows.map(cells => '<tr>' + cells.map((cell, index) =>
      `<td class="${cell.className ?? ''}" data-label="${esc(headings[index])}">${cell.view}</td>`).join('') + '</tr>').join('')}</tbody></table></div>`;
}
export const cell = (view: string, className?: string): Cell => ({ view, className });
export function pagination(page: Page<unknown>, key = 'page') {
  if (page.pages <= 1) return '';
  return `<div class="pagination"><span>Страница ${page.page} из ${page.pages} · всего ${page.count}</span><div>
    ${iconButton('Предыдущая страница', 'page', 'left', `data-key="${key}" data-value="${page.page - 1}" ${page.page <= 1 ? 'disabled' : ''}`)}
    ${iconButton('Следующая страница', 'page', 'right', `data-key="${key}" data-value="${page.page + 1}" ${page.page >= page.pages ? 'disabled' : ''}`)}</div></div>`;
}
export const blank = (title: string, desc: string, action = '', glyph = 'search') => `<div class="empty">
  <span class="tile blue">${icon(glyph)}</span><strong>${esc(title)}</strong><p>${esc(desc)}</p>${action}</div>`;
export function selectOptions(choices: ReadonlyArray<readonly [string, string]>, current = '') {
  return choices.map(([value, label]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
}
export const pairs = (items: ReadonlyArray<{ id: string; name: string }>): [string, string][] => items.map(item => [item.id, item.name]);
export const searchBox = (value: string, label: string) => `<label class="searchbox">${icon('search')}<input type="search" aria-label="${esc(label)}" placeholder="${esc(label)}" value="${esc(value)}" data-filter="q"></label>`;
export const selectFilter = (key: string, value: string, label: string, choices: ReadonlyArray<readonly [string, string]>, emptyOption?: string) =>
  `<select class="control" aria-label="${esc(label)}" data-filter="${key}">${selectOptions(emptyOption ? [['', emptyOption], ...choices] : choices, value)}</select>`;
export const dateFilter = (key: string, value: string, label: string) =>
  `<label class="date-filter"><span>${label}</span><input class="control" type="date" data-filter="${key}" value="${esc(value)}"></label>`;
export const title = (heading: string, action = '') =>
  `<header class="page-title"><h1>${heading}</h1>${action}</header>`;
export const region = (label: string, content: string, extra = '') =>
  `<section class="panel"><div class="panel-heading"><h2>${label}</h2>${extra}</div>${content}</section>`;
export const rowPerson = (name: string, link = '') =>
  link ? `<a class="strong" href="${link}">${esc(name)}</a>` : `<strong>${esc(name)}</strong>`;
export function lessonTable(list: Lesson[]) {
  return table(['Занятие', 'Ученик / группа', 'Дата и время', 'Инструктор', 'Статус'], list.map(lesson => [
    cell(`<strong>${esc(lesson.topic)}</strong><small>${lesson.durationMin} мин</small>`, 'lead'),
    cell(esc(lessonWho(lesson))),
    cell(`<span class="nowrap">${formatDay(lesson.date)} · ${lesson.startTime}</span>`),
    cell(esc(lesson.instructorName)), cell(lessonBadge(lesson)),
  ]));
}
export function paymentTable(list: Payment[], showStudent: boolean) {
  const headings = [...(showStudent ? ['Ученик'] : []), 'Дата', 'Способ оплаты', 'Сумма', 'Чек'];
  return table(headings, list.map(payment => [
    ...(showStudent ? [cell(rowPerson(payment.studentName), 'lead')] : []),
    cell(`<span class="nowrap">${formatDay(payment.date)}</span>`, showStudent ? '' : 'lead'),
    cell(methods[payment.method]),
    cell(`<strong class="nowrap">${money(payment.amount)}</strong>`),
    cell(`<a class="text-link nowrap" href="/receipts/${urlId(payment.id)}">${icon('receipt')} № ${receiptNumber(payment.receiptNumber)}</a>`),
  ]));
}
