import { formatDay, lessonTypes, methods, studentStatuses } from './shared.ts';
import type { Group, Instructor, Lesson, Options, Student } from './shared.ts';
import { button, dataId, esc, icon, iconButton, lessonBadge, lessonWho, pairs, selectOptions } from './ui.ts';

type Values = Record<string, string | number | null | undefined>;
export type Field = {
  key: string;
  label: string;
  kind?: 'text' | 'tel' | 'date' | 'time' | 'number' | 'password' | 'select' | 'textarea';
  placeholder?: string;
  choices?: ReadonlyArray<readonly [string, string]>;
  min?: string;
  max?: string;
  step?: string;
  limit?: number;
  optional?: boolean;
  when?: string;
  hidden?: boolean;
};
export type Editor = { heading: string; path: string; method: string; message: string; values: Values; fields: Field[]; submit?: string };
const person: Field[] = [
  { key: 'name', label: 'ФИО', placeholder: 'Фамилия Имя Отчество', limit: 120 },
  { key: 'phone', label: 'Телефон', kind: 'tel', placeholder: '+7 (___) ___-__-__', limit: 24 },
];
const account: Field[] = [
  { key: 'login', label: 'Логин для входа', placeholder: 'Латинские буквы и цифры', optional: true, limit: 40 },
  { key: 'password', label: 'Пароль', kind: 'password', placeholder: 'От 8 символов', optional: true, limit: 128 },
];
const select = (key: string, label: string, choices: ReadonlyArray<readonly [string, string]>, blank = 'Выберите значение', optional = false): Field =>
  ({ key, label, kind: 'select', choices: [['', blank], ...choices], optional });
const number = (key: string, label: string, min: string, max: string, step = '1'): Field => ({ key, label, kind: 'number', min, max, step });
export function studentEditor(opts: Options, today: string, item?: Student): Editor {
  return {
    heading: item ? 'Редактирование ученика' : 'Новый ученик', path: '/students' + (item ? '/' + encodeURIComponent(item.id) : ''),
    method: item ? 'PUT' : 'POST', message: item ? 'Карточка ученика обновлена.' : 'Ученик добавлен.',
    values: item ? { ...item } : { status: 'ACTIVE', theoryProgress: 0 },
    fields: [...person, { key: 'birthDate', label: 'Дата рождения', kind: 'date', max: today },
      select('groupId', 'Группа', pairs(opts.groups), 'Без группы', true),
      { key: 'status', label: 'Статус', kind: 'select', choices: Object.entries(studentStatuses) },
      number('theoryProgress', 'Прогресс по теории, %', '0', '100'), ...account],
  };
}
export function instructorEditor(item?: Instructor): Editor {
  return {
    heading: item ? 'Редактирование инструктора' : 'Новый инструктор', path: '/instructors' + (item ? '/' + encodeURIComponent(item.id) : ''),
    method: item ? 'PUT' : 'POST', message: item ? 'Карточка инструктора обновлена.' : 'Инструктор добавлен.',
    values: item ? { ...item } : {}, fields: [...person, { key: 'car', label: 'Автомобиль', placeholder: 'Марка, модель и госномер', limit: 120 }, ...account],
  };
}
export function groupEditor(opts: Options, item?: Group): Editor {
  return {
    heading: item ? 'Редактирование группы' : 'Новая группа', path: '/groups' + (item ? '/' + encodeURIComponent(item.id) : ''),
    method: item ? 'PUT' : 'POST', message: item ? 'Группа обновлена.' : 'Группа добавлена.',
    values: item ? { ...item } : {}, fields: [
      { key: 'name', label: 'Название группы', placeholder: 'Например, Субботняя', limit: 120 },
      select('instructorId', 'Инструктор', pairs(opts.instructors), 'Выберите инструктора'),
      select('studentId', 'Добавить ученика в группу', pairs(opts.students), 'Без назначения', true),
    ],
  };
}
export function lessonEditor(opts: Options, date: string, time = '09:00', item?: Lesson): Editor {
  const type = item?.type ?? 'GROUP';
  return {
    heading: item ? 'Редактирование занятия' : 'Новое занятие', path: '/schedule' + (item ? '/' + encodeURIComponent(item.id) : ''),
    method: item ? 'PUT' : 'POST', message: item ? 'Занятие обновлено.' : 'Занятие создано.',
    values: item ? { ...item } : { type, date, startTime: time, durationMin: 60 },
    fields: [
      { key: 'type', label: 'Тип занятия', kind: 'select', choices: Object.entries(lessonTypes) },
      { ...select('groupId', 'Группа', pairs(opts.groups), 'Выберите группу'), when: 'GROUP', hidden: type !== 'GROUP' },
      { ...select('studentId', 'Ученик', pairs(opts.students), 'Выберите ученика'), when: 'INDIVIDUAL', hidden: type !== 'INDIVIDUAL' },
      select('instructorId', 'Инструктор', pairs(opts.instructors), 'Выберите инструктора'),
      { key: 'topic', label: 'Тема занятия', placeholder: 'Например, Парковка задним ходом', limit: 180 },
      { key: 'date', label: 'Дата', kind: 'date' }, { key: 'startTime', label: 'Время начала', kind: 'time' },
      number('durationMin', 'Длительность, мин', '15', '480'),
    ],
  };
}
export function paymentEditor(opts: Options, today: string, studentId?: string): Editor {
  return {
    heading: 'Принять оплату', path: '/payments', method: 'POST', message: 'Оплата принята, чек сформирован.', submit: 'Принять оплату',
    values: { studentId, date: today, method: 'CARD' }, fields: [
      select('studentId', 'Ученик', pairs(opts.activeStudents), 'Выберите активного ученика'),
      number('amount', 'Сумма, ₽', '0.01', '100000000', '0.01'),
      { key: 'date', label: 'Дата оплаты', kind: 'date', max: today },
      { key: 'method', label: 'Способ оплаты', kind: 'select', choices: Object.entries(methods) },
      { key: 'comment', label: 'Комментарий', kind: 'textarea', limit: 500, optional: true },
    ],
  };
}
export function progressEditor(item: Student): Editor {
  return {
    heading: 'Прогресс по теории', path: '/students/' + encodeURIComponent(item.id) + '/progress',
    method: 'PATCH', message: 'Прогресс обновлён.', values: { theoryProgress: item.theoryProgress }, fields: [
      number('theoryProgress', 'Теория, %', '0', '100'),
    ],
  };
}
export const requestEditor = (): Editor => ({
  heading: 'Новое обращение', path: '/requests', method: 'POST', submit: 'Отправить', message: 'Обращение отправлено.',
  values: {}, fields: [{ key: 'text', label: 'Текст обращения', kind: 'textarea', limit: 4000, placeholder: 'Опишите ваш вопрос' }],
});
function field(item: Field, selected: Values) {
  const value = selected[item.key] ?? '';
  const type = item.kind ?? 'text';
  const attrs = `id="field-${item.key}" name="${item.key}" aria-describedby="error-${item.key}" ${item.optional ? '' : 'required'} ${item.hidden ? 'disabled' : ''}`;
  const placeholder = item.placeholder ? `placeholder="${esc(item.placeholder)}"` : '';
  const limit = item.limit ? `maxlength="${item.limit}"` : '';
  const ranges = [['min', item.min], ['max', item.max], ['step', item.step]].filter(([, data]) => data).map(([key, data]) => `${key}="${data}"`).join(' ');
  const control = type === 'select'
    ? `<select ${attrs}>${selectOptions(item.choices ?? [], String(value))}</select>`
    : type === 'textarea'
      ? `<textarea ${attrs} ${placeholder} ${limit} rows="5">${esc(value)}</textarea>`
      : `<input type="${type}" ${attrs} ${placeholder} ${limit} ${ranges} value="${esc(value)}"${type === 'password' ? ' autocomplete="new-password"' : ''}>`;
  return `<div class="field"${item.when ? ` data-type-field="${item.when}"` : ''}${item.hidden ? ' hidden' : ''}>
    <label for="field-${item.key}">${item.label}${item.optional ? ' <small class="optional">необязательно</small>' : ''}</label>
    ${control}<small class="field-error" id="error-${item.key}" data-error="${item.key}"></small></div>`;
}
export function dialogHead(heading: string) {
  return `<header class="dialog-head"><h2 id="dialog-title">${heading}</h2>${iconButton('Закрыть', 'close-dialog', 'close')}</header>`;
}
export function editorView(editor: Editor) {
  return dialogHead(editor.heading) + `<form id="editor-form" novalidate><div class="dialog-body">
    ${editor.fields.map(item => field(item, editor.values)).join('')}</div>
    <footer class="dialog-actions">${button('Отмена', 'close-dialog', '', 'secondary')}
    <button type="submit" class="button primary">${icon('check')} ${editor.submit ?? 'Сохранить'}</button></footer></form>`;
}
export function lessonDialog(lesson: Lesson, admin: boolean, canManage: boolean) {
  const planned = lesson.status === 'PLANNED';
  return dialogHead(esc(lesson.topic)) + `<div class="dialog-body">${lessonBadge(lesson)}<dl class="details lesson-details">
    <div><dt>Тип</dt><dd>${lessonTypes[lesson.type]}</dd></div><div><dt>${lesson.type === 'GROUP' ? 'Группа' : 'Ученик'}</dt><dd>${esc(lessonWho(lesson))}</dd></div>
    <div><dt>Дата</dt><dd>${formatDay(lesson.date)}</dd></div><div><dt>Начало</dt><dd>${lesson.startTime}</dd></div>
    <div><dt>Длительность</dt><dd>${lesson.durationMin} мин</dd></div><div><dt>Инструктор</dt><dd>${esc(lesson.instructorName)}</dd></div></dl></div>` +
    (planned && canManage ? `<footer class="dialog-actions stacked">
      ${admin ? button('Редактировать', 'edit-lesson', 'pencil', 'secondary', dataId(lesson.id)) : ''}
      ${button('Отменить занятие', 'lesson-cancel', 'close', 'danger-outline', dataId(lesson.id))}
      ${button('Отметить проведённым', 'lesson-done', 'check', 'primary', dataId(lesson.id))}</footer>` : '');
}
export function confirmDialog(name: string, type: string, note: string) {
  return dialogHead('Удалить ' + type + '?') + `<div class="dialog-body"><p><strong>${esc(name)}</strong></p><p>${note}</p></div>
  <footer class="dialog-actions">${button('Отмена', 'close-dialog', '', 'secondary')}
  ${button('Удалить', 'confirm-remove', 'trash', 'danger')}</footer>`;
}
