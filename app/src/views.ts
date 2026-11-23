import { formatDay, lessonStatuses, methods, money, offsetDay, receiptNumber, requestStatuses, roles, studentStatuses } from './shared.ts';
import type { Dashboard, Group, Inquiry, Instructor, Lesson, Options, Page, Payment, Student, StudentDetail, UserView } from './shared.ts';
import { avatar, badge, blank, button, cell, dataId, dateFilter, esc, icon, iconButton, lessonTable, lessonWho, pagination, pairs, paymentTable, progress, region, rowPerson, searchBox, selectFilter, studentBadge, table, title, urlId } from './ui.ts';

const navItems = [
  ['dashboard', 'Обзор', 'grid'], ['students', 'Ученики', 'students'], ['groups', 'Группы', 'group'],
  ['instructors', 'Инструкторы', 'car'], ['schedule', 'Расписание', 'calendar'], ['history', 'История занятий', 'history'],
  ['payments', 'Оплаты', 'wallet'], ['requests', 'Обращения', 'message'], ['settings', 'Настройки', 'settings'],
] as const;
const instructorNav = ['dashboard','students','groups','schedule','history'];
const studentNav = ['dashboard','students','schedule','history','payments','requests'];
export const logo = `<div class="brand"><img src="/favicon.svg" alt="" width="32" height="32"><strong>Автошкола <b>PRO</b></strong></div>`;
export function shell(user: UserView, route: string, today: string, light: boolean) {
  const isStudent = user.role === 'STUDENT';
  function nav(key: string, label: string, glyph: string) {
    const href = isStudent && key === 'students' ? '/students/' + urlId(user.profileId ?? '') : '/' + key;
    const active = key === route || (route === 'receipts' && key === 'payments');
    return `<a href="${href}" class="nav-link${active ? ' current' : ''}"${active ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`;
  }
  const entries = navItems.filter(([key]) => user.role === 'ADMIN' || (isStudent ? studentNav : instructorNav).includes(key));
  const first = entries.filter(([key]) => !['payments','requests','settings'].includes(key));
  const second = entries.filter(([key]) => ['payments','requests','settings'].includes(key));
  return `<div class="layout">
    <div class="mobile-shade" data-action="menu" hidden></div>
    <aside id="sidebar" class="sidebar">
      <a href="/dashboard" class="brand-link" aria-label="Автошкола PRO — главная">${logo}</a>
      <nav aria-label="Разделы">${first.map(([key,label,glyph]) => nav(key, isStudent && key === 'students' ? 'Мой прогресс' : label, glyph)).join('')}
      ${second.length ? '<div class="nav-separator">' + second.map(([key,label,glyph]) => nav(key,label,glyph)).join('') + '</div>' : ''}</nav>
      <div class="sidebar-bottom">${avatar(user.name, 'profile-avatar')}<div class="profile-name"><strong>${esc(user.name)}</strong><small>${roles[user.role]}</small></div>
        ${iconButton('Выйти', 'logout', 'logout')}</div>
    </aside>
    <main class="workspace">
      <div class="topbar"><div class="mobile-header">${iconButton('Открыть меню', 'menu', 'menu', 'aria-controls="sidebar" aria-expanded="false"')}
        <strong>Автошкола PRO</strong></div>
      <div class="top-actions"><time class="date-chip" datetime="${today}">${formatDay(today, { day: 'numeric', month: 'long', year: 'numeric' })}</time>${iconButton(light ? 'Включить тёмную тему' : 'Включить светлую тему', 'theme', light ? 'moon' : 'sun')}</div></div>
      <div id="content" class="content">${skeleton()}</div>
    </main></div>`;
}
export function skeleton() {
  return `<div class="skeleton" role="status" aria-label="Загрузка данных"><span class="loading-block short"></span><span class="loading-block subtitle"></span>
    <div class="skeleton-grid">${'<span class="loading-block"></span>'.repeat(4)}</div><span class="loading-block tall"></span></div>`;
}
export function loginView(light: boolean) {
  return `<main class="login-page"><div class="login-theme">${iconButton(light ? 'Включить тёмную тему' : 'Включить светлую тему', 'theme', light ? 'moon' : 'sun')}</div>
    <div class="login-card">${logo}<h1>Вход в систему</h1>
    <form id="login-form" novalidate>
      <label class="field"><span>Логин</span><div class="input-icon">${icon('user')}<input name="login" autocomplete="username" placeholder="Введите логин" required maxlength="40"></div><small data-error="login"></small></label>
      <label class="field"><span>Пароль</span><div class="input-icon">${icon('lock')}<input name="password" type="password" autocomplete="current-password" placeholder="Введите пароль" required maxlength="128">${iconButton('Показать пароль', 'password', 'eye')}</div><small data-error="password"></small></label>
      <p class="login-error" role="alert"></p><button type="submit" class="button primary">Войти</button>
    </form></div></main>`;
}
function chart(data: Dashboard['monthly']) {
  const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });
  const maximum = Math.max(...data.map(item => item.amount));
  const unit = Math.max(1_000_000, Math.ceil(maximum / 4 / 1_000_000) * 1_000_000);
  const labels = [4, 3, 2, 1, 0].map(level => '<span>' + (level ? new Intl.NumberFormat('ru-RU').format(level * unit / 100_000) + ' тыс.' : '0') + '</span>');
  return `<div class="chart" aria-label="Выручка за шесть месяцев"><div class="chart-labels" aria-hidden="true">${labels.join('')}</div>
    <div class="chart-content"><div class="gridlines" aria-hidden="true">${'<i></i>'.repeat(5)}</div><div class="bars">
    ${data.map((item, i) => `<div class="bar-column"><div class="bar-slot"><div class="bar${i === data.length - 1 ? ' last' : ''}" style="--value:${item.amount / (unit * 4) * 100}%" tabindex="0" aria-label="${formatDay(item.month + '-01', { month: 'long' })}: ${money(item.amount)}">
      <span>${money(item.amount)}</span></div></div><span class="month-label">${monthLabel.format(new Date(item.month + '-01T00:00:00Z')).replace('.', '')}</span></div>`).join('')}</div></div></div>`;
}
export function dashboardView(data: Dashboard, user: UserView) {
  const isAdmin = user.role === 'ADMIN';
  const stats = isAdmin ? [
    ['Ученики', data.students, '/students'],
    ['Инструкторы', data.instructors, '/instructors'],
    ['Группы', data.groups, '/groups'],
    ['Выручка за месяц', money(data.revenue), '/payments'],
  ] : user.role === 'INSTRUCTOR' ? [
    ['Мои ученики', data.students, '/students'],
    ['Мои группы', data.groups, '/groups'],
  ] : [];
  const kpis = stats.length ? `<div class="stats panel${isAdmin ? '' : ' stats-personal'}">${stats.map(([label, count, url]) => `<a class="kpi" href="${url}"><span class="kpi-label">${label}</span><strong class="kpi-value">${count}</strong></a>`).join('')}</div>` : '';
  const schedule = region('Ближайшие занятия', data.upcoming.length ? `<ul class="upcoming-list">${data.upcoming.map(lesson => `<li>
    <time class="lesson-time" datetime="${lesson.date}T${lesson.startTime}"><strong>${lesson.startTime}</strong><small>${formatDay(lesson.date, { day: 'numeric', month: 'short' })}</small></time>
    <div><strong>${esc(lesson.topic)}</strong><small>${esc(lessonWho(lesson))}</small></div></li>`).join('')}</ul>`
    : blank('Ближайших занятий нет', 'Все запланированные занятия появятся здесь.', '<a class="button secondary" href="/schedule">Открыть расписание</a>', 'calendar'),
    '<a class="text-link" href="/schedule">Расписание</a>');
  const recent = data.requests.length ? table(['Отправитель', 'Обращение', 'Дата'], data.requests.map(item => [
    cell(`<strong>${esc(item.name)}</strong>`, 'lead'), cell(`<div class="request-text">${esc(item.text)}</div>`, 'long-cell'),
    cell(formatDay(item.createdAt), 'nowrap'),
  ])) : blank('Новых обращений нет', 'Все входящие обращения обработаны.', '<a class="button secondary" href="/requests">Журнал обращений</a>', 'message');
  return title('Обзор', isAdmin ? button('Добавить ученика', 'new-student') : '') + kpis +
    `<div class="dashboard-grid panel${isAdmin ? '' : ' single'}">${isAdmin ? region('Выручка по месяцам', chart(data.monthly), '<span class="chart-key">₽</span>') : ''}${schedule}</div>` +
    (isAdmin ? region('Новые обращения', recent, '<a href="/requests" class="text-link">Все обращения</a>') : '');
}

const pane = (filters: string, results: string) => `<section class="panel list-panel"><div class="filters">${filters}</div><div id="results">${results}</div></section>`;
const clear = button('Сбросить фильтры', 'clear-filters', 'close', 'secondary');
const qv = (params: URLSearchParams, key: string) => params.get(key) ?? '';
const actions = (...controls: string[]) => '<div class="row-actions">' + controls.join('') + '</div>';
const edit = (label: string, action: string, id: string) => iconButton(label, action, 'pencil', dataId(id));
const remove = (label: string, action: string, id: string) => iconButton(label, action, 'trash', dataId(id));
export function studentsView(data: Page<Student>, user: UserView, opts: Options, params: URLSearchParams) {
  const admin = user.role === 'ADMIN';
  const create = admin ? button('Добавить ученика', 'new-student') : '';
  const filters = searchBox(qv(params, 'q'), 'Поиск по ФИО или телефону') +
    selectFilter('groupId', qv(params, 'groupId'), 'Группа', pairs(opts.groups), 'Все группы') +
    selectFilter('status', qv(params, 'status'), 'Статус', Object.entries(studentStatuses), 'Все статусы') +
    selectFilter('sort', qv(params, 'sort') || 'name', 'Сортировка', [['name','ФИО: А–Я'],['-name','ФИО: Я–А'],['-progress','По прогрессу'],['group','По группе']]);
  const results = data.items.length ? table(['Ученик', 'Телефон', 'Группа', 'Статус', 'Теория', ...(admin ? ['Действия'] : [])], data.items.map(item => [
    cell(rowPerson(item.name, '/students/' + urlId(item.id)), 'lead'), cell(esc(item.phone), 'nowrap'), cell(esc(item.groupName || 'Без группы')),
    cell(studentBadge(item.status)), cell(progress(item.theoryProgress)),
    ...(admin ? [cell(actions(edit('Редактировать ученика', 'edit-student', item.id), remove('Удалить ученика', 'delete-student', item.id)), 'actions-cell')] : []),
  ])) + pagination(data) : blank('Ученики не найдены', params.size ? 'Измените запрос или сбросьте фильтры.' : 'В этом разделе появятся карточки учеников.', params.size ? clear : create, 'students');
  return title('Ученики', create) + pane(filters, results);
}
export function groupsView(data: Page<Group>, user: UserView, params: URLSearchParams) {
  const admin = user.role === 'ADMIN';
  const create = admin ? button('Добавить группу', 'new-group') : '';
  const results = data.items.length ? table(['Группа', 'Инструктор', 'Учеников', ...(admin ? ['Действия'] : [])], data.items.map(item => [
    cell(`<a class="strong" href="/students?groupId=${urlId(item.id)}">${esc(item.name)}</a>`, 'lead'),
    cell(esc(item.instructorName)), cell(String(item.studentCount)),
    ...(admin ? [cell(actions(edit('Редактировать группу', 'edit-group', item.id), remove('Удалить группу', 'delete-group', item.id)), 'actions-cell')] : []),
  ])) + pagination(data) : blank('Группы не найдены', 'Здесь отображаются учебные группы автошколы.', params.size ? clear : create, 'group');
  return title('Группы', create) +
    pane(searchBox(qv(params, 'q'), 'Поиск по названию группы'), results);
}
export function instructorsView(data: Page<Instructor>, params: URLSearchParams) {
  const create = button('Добавить инструктора', 'new-instructor');
  const results = data.items.length ? table(['Инструктор', 'Телефон', 'Автомобиль', 'Групп', 'Действия'], data.items.map(item => [
    cell(rowPerson(item.name), 'lead'), cell(esc(item.phone), 'nowrap'), cell(esc(item.car)), cell(String(item.groupCount)),
    cell(actions(edit('Редактировать инструктора', 'edit-instructor', item.id), remove('Удалить инструктора', 'delete-instructor', item.id)), 'actions-cell'),
  ])) + pagination(data) : blank('Инструкторы не найдены', 'Добавьте карточку инструктора и его автомобиля.', params.size ? clear : create, 'car');
  return title('Инструкторы', create) +
    pane(searchBox(qv(params, 'q'), 'Поиск по ФИО, телефону или автомобилю'), results);
}
export function studentView(item: StudentDetail, user: UserView) {
  const isAdmin = user.role === 'ADMIN';
  const isStudent = user.role === 'STUDENT';
  const manage = isAdmin ? actions(button('Редактировать', 'edit-student', 'pencil', 'secondary', dataId(item.id)),
    item.status === 'ACTIVE' ? button('Принять оплату', 'new-payment', 'wallet', 'primary', dataId(item.id)) : '') : '';
  return `${!isStudent ? '<a class="back text-link" href="/students">' + icon('left') + ' К списку учеников</a>' : ''}
    ${title(esc(item.name), manage)}
    <div class="detail-grid">${region('Личные данные', `<dl class="details"><div><dt>Телефон</dt><dd>${esc(item.phone)}</dd></div><div><dt>Дата рождения</dt><dd>${formatDay(item.birthDate)}</dd></div>
      <div><dt>Группа</dt><dd>${esc(item.groupName || 'Без группы')}</dd></div><div><dt>Статус</dt><dd>${studentBadge(item.status)}</dd></div></dl>`)}
    ${region('Прогресс по теории', `<div class="progress-detail"><strong>${item.theoryProgress}%</strong>${progress(item.theoryProgress)}
      ${isStudent ? '' : button('Изменить прогресс', 'progress', 'pencil', 'secondary', dataId(item.id))}</div>`)}</div>
    ${region('История занятий', item.lessons.items.length ? lessonTable(item.lessons.items) + pagination(item.lessons, 'lessonPage') : blank('Завершённых занятий нет', 'Проведённые и отменённые занятия появятся здесь.', '<a class="button secondary" href="/schedule">Открыть расписание</a>', 'history'))}
    ${user.role === 'INSTRUCTOR' ? '' : region('История оплат', item.payments.items.length ? paymentTable(item.payments.items, false) + pagination(item.payments, 'paymentPage') :
      blank('Оплат пока нет', 'Зарегистрированные платежи появятся здесь.', isAdmin && item.status === 'ACTIVE' ? button('Принять оплату', 'new-payment', 'wallet', 'primary', dataId(item.id)) : '', 'wallet'))}`;
}
export function historyView(data: Page<Lesson>, params: URLSearchParams) {
  const filter = searchBox(qv(params, 'q'), 'Поиск по ученику, группе или дате') +
    selectFilter('status', qv(params, 'status'), 'Статус занятия', [['DONE', lessonStatuses.DONE], ['CANCELLED', lessonStatuses.CANCELLED]], 'Все статусы');
  const results = data.items.length ? lessonTable(data.items) + pagination(data) : blank('Занятия не найдены',
    'Здесь хранятся проведённые и отменённые занятия.', params.size ? clear : '<a class="button secondary" href="/schedule">Открыть расписание</a>', 'history');
  return title('История занятий') + pane(filter, results);
}
export function paymentsView(data: Page<Payment>, user: UserView, opts: Options, params: URLSearchParams) {
  const isAdmin = user.role === 'ADMIN';
  const create = isAdmin ? button('Принять оплату', 'new-payment', 'wallet') : '';
  const filter = dateFilter('from', qv(params, 'from'), 'Дата с') + dateFilter('to', qv(params, 'to'), 'Дата по') +
    (isAdmin ? selectFilter('studentId', qv(params, 'studentId'), 'Ученик', pairs(opts.students), 'Все ученики') : '');
  const results = `<div class="total-line">${icon('wallet')}<span>Итого за период</span><strong>${money(data.total || 0)}</strong></div>` +
    (data.items.length ? paymentTable(data.items, isAdmin) + pagination(data) : blank('Оплаты не найдены', 'Записи об оплатах появятся здесь.', params.size ? clear : create, 'wallet'));
  return title(isAdmin ? 'Оплаты' : 'Мои оплаты', create) + pane(filter, results);
}
export function requestsView(data: Page<Inquiry>, params: URLSearchParams, user: UserView) {
  const isAdmin = user.role === 'ADMIN';
  const create = button('Новое обращение', 'new-request', 'message');
  const results = data.items.length ? table([...(isAdmin ? ['Отправитель'] : []), 'Обращение', 'Дата', 'Статус', ...(isAdmin ? ['Действие'] : [])], data.items.map(item => [
    ...(isAdmin ? [cell(rowPerson(item.name), 'lead')] : []), cell(`<div class="request-text">${esc(item.text)}</div>`, isAdmin ? 'long-cell' : 'lead'),
    cell(formatDay(item.createdAt), 'nowrap'), cell(badge(requestStatuses[item.status], item.status)),
    ...(isAdmin ? [cell(item.status === 'NEW' ? button('Обработано', 'request-done', 'check', 'secondary compact', dataId(item.id)) : '—', 'actions-cell')] : []),
  ])) + pagination(data) : blank('Обращений нет', 'Новые сообщения будут видны в этом разделе.', params.size ? clear : create, 'message');
  return title('Обращения', create) +
    pane(selectFilter('status', qv(params, 'status'), 'Состояние обращения', Object.entries(requestStatuses), 'Все обращения'), results);
}

export function scheduleView(data: Lesson[], user: UserView, today: string, week: string, selectedDay: string) {
  const admin = user.role === 'ADMIN';
  const days = Array.from({ length: 7 }, (_, i) => offsetDay(week, i));
  const hoursUsed = data.map(lesson => Number(lesson.startTime.slice(0, 2)));
  const firstHour = Math.min(8, ...hoursUsed);
  const lastHour = Math.max(20, ...hoursUsed);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => String(firstHour + i).padStart(2, '0'));
  const cols = days.map(day => `<div role="columnheader" class="day-header${day === today ? ' is-today' : ''}${day === selectedDay ? ' is-selected' : ''}">
    <span>${formatDay(day, { weekday: 'short' })}</span><b>${Number(day.slice(8))}</b></div>`).join('');
  const rows = hours.map(hour => `<div role="row" class="calendar-row"><div role="rowheader" class="hour">${hour}:00</div>${days.map(day => {
    const lessons = data.filter(item => item.date === day && item.startTime.startsWith(hour + ':'));
    const create = admin ? iconButton(`Добавить занятие ${formatDay(day)} в ${hour}:00`, 'new-lesson', 'plus',
      `data-date="${day}" data-time="${hour}:00"`) : '';
    return `<div role="cell" class="slot${day === selectedDay ? ' is-selected' : ''}">${lessons.map(lesson =>
      `<button type="button" class="lesson-chip ${lesson.type === 'GROUP' ? 'group-lesson' : ''}" data-action="view-lesson" ${dataId(lesson.id)}>
        <span>${lesson.startTime} · ${lesson.durationMin} мин</span><b>${esc(lesson.topic)}</b><small>${esc(lessonWho(lesson))}</small></button>`).join('')}${create}</div>`;
  }).join('')}</div>`).join('');
  const end = days[6];
  const range = formatDay(week, { day: 'numeric', month: 'short' }) + ' — ' + formatDay(end, { day: 'numeric', month: 'short', year: 'numeric' });
  return title('Расписание', admin ? button('Новое занятие', 'new-lesson', 'plus', 'primary', `data-date="${selectedDay}"`) : '') +
    `<section class="panel calendar-panel"><div class="calendar-toolbar"><div class="week-nav">
    ${iconButton('Предыдущая неделя', 'week', 'left', `data-value="${offsetDay(week,-7)}"`)}<strong>${range}</strong>
    ${iconButton('Следующая неделя', 'week', 'right', `data-value="${offsetDay(week,7)}"`)}</div>
    ${button('Сегодня', 'week', '', 'secondary', `data-value="${today}"`)}</div>
    <div class="mobile-days" aria-label="День недели">${days.map(day => `<button type="button" class="${day === selectedDay ? 'selected' : ''}" data-action="calendar-day" data-value="${day}" aria-pressed="${day === selectedDay}"><span>${formatDay(day,{weekday:'short'})}</span><strong>${Number(day.slice(8))}</strong></button>`).join('')}</div>
    ${data.length ? '' : '<p class="calendar-empty">На этой неделе нет запланированных занятий.</p>'}
    <div class="calendar-grid" role="table" aria-label="Расписание на неделю"><div class="calendar-row days" role="row"><div role="columnheader" class="hour">Время</div>${cols}</div>${rows}</div></section>`;
}
export function receiptView(data: Payment) {
  return `<div class="receipt-controls"><a class="back text-link" href="/payments">${icon('left')} К оплатам</a>${button('Печать', 'print', 'print')}</div>
    <article class="receipt"><header><span class="receipt-brand">Автошкола PRO</span><h1>Чек об оплате</h1><p>№ ${receiptNumber(data.receiptNumber)} от ${formatDay(data.date)}</p></header>
    <dl><div><dt>Ученик</dt><dd>${esc(data.studentName)}</dd></div><div><dt>Услуга</dt><dd>Обучение вождению</dd></div>
    <div><dt>Способ оплаты</dt><dd>${methods[data.method]}</dd></div><div class="receipt-total"><dt>Итого</dt><dd>${money(data.amount)}</dd></div></dl>
    <div class="signature"><span>Подпись</span><span></span></div></article>`;
}
export function settingsView() {
  return title('Настройки') +
    `<div class="settings-grid"><section class="panel setting"><h2>Экспорт данных</h2>
    <p>Скачайте JSON со всеми записями, связями и данными аккаунтов. Храните файл в защищённом месте.</p>
    ${button('Скачать JSON', 'export', 'download')}</section><section class="panel setting"><h2>Импорт данных</h2>
    <p>Выберите JSON из этого приложения. Записи будут добавлены или обновлены по идентификатору.</p>
    <form id="import-form" novalidate><label class="field"><span>Резервная копия</span><input type="file" name="backup" accept=".json,application/json"><small data-error="backup"></small></label>
    <button class="button primary" type="submit">${icon('upload')} Импортировать</button></form></section></div><div id="import-report"></div>`;
}
