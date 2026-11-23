import { hashPassword } from './auth.ts';
import { atomic, migrate, one, run, zone } from './db.ts';
import { dateInZone, digits, minutes, normalize, offsetDay } from './shared.ts';

const instructorNames = ['Иванов Сергей Андреевич', 'Смирнова Ольга Викторовна', 'Кузнецов Дмитрий Павлович', 'Волков Алексей Игоревич'];
const cars = ['Hyundai Solaris · А123ВС', 'Kia Rio · В458МН', 'Lada Vesta · М714ОТ', 'Volkswagen Polo · Р387ЕК'];
const groups = ['Вечерняя', 'Утренняя', 'Выходного дня'];
const names = ['Петрова Анна Максимовна', 'Соколов Михаил Ильич', 'Морозова Дарья Олеговна', 'Новиков Артём Денисович', 'Лебедева Софья Никитична', 'Зайцев Иван Антонович', 'Козлова Полина Андреевна', 'Орлов Николай Евгеньевич', 'Васильева Екатерина Ильинична', 'Попов Павел Романович', 'Фёдорова Валерия Сергеевна', 'Макаров Андрей Игоревич', 'Никитина Мария Алексеевна', 'Ильин Денис Валерьевич', 'Романова Алина Викторовна'];
const topics = ['Основы ПДД', 'Парковка задним ходом', 'Проезд перекрёстков', 'Маневрирование в городе', 'Начало движения и остановка', 'Подготовка к экзамену', 'Дорожные знаки'];
const requestTexts = ['Подскажите, можно ли перенести практику со среды на пятницу?\nВ среду у меня смена до 19:00.', 'Подскажите, пожалуйста, где находится площадка для практики? Нужен ориентир у въезда.', 'Прошу выдать справку об обучении для работодателя.', 'Можно ли добавить ещё одно занятие по парковке параллельно бордюру?', 'Спасибо за консультацию по экзамену. Записалась на предложенную дату.'];
const today = dateInZone(zone);

migrate();
if (one('SELECT id FROM users LIMIT 1')) {
  console.log('В базе уже есть пользователи. Данные сохранены.');
} else {
  const hashes = await Promise.all(['admin123', 'instructor123', 'student123'].map(hashPassword));
  atomic(() => {
    if (one('SELECT id FROM users LIMIT 1')) return;
    const logins = ['admin', 'instructor', 'student'];
    const actors = ['Марина Белова', instructorNames[0], names[0]];
    const accountRoles = ['ADMIN', 'INSTRUCTOR', 'STUDENT'];
    logins.forEach((login, i) => run('INSERT INTO users VALUES (?,?,?,?,?,?)', 'u-' + login, login, hashes[i], actors[i], `+7 (900) 100-00-0${i + 1}`, accountRoles[i]));
    instructorNames.forEach((name, i) => run('INSERT INTO instructors VALUES (?,?,?,?,?)', 'i-' + (i + 1), name, '+7 (917) 400-10-0' + (i + 1), cars[i], i === 0 ? 'u-instructor' : null));
    groups.forEach((name, i) => run('INSERT INTO groups VALUES (?,?,?,?)', 'g-' + (i + 1), name, normalize(name), 'i-' + (i + 1)));
    names.forEach((name, i) => {
      const phone = '+7 (927) 310-45-' + String(i + 10);
      run('INSERT INTO students VALUES (?,?,?,?,?,?,?,?,?,?,NULL)', 's-' + (i + 1), name, normalize(name), phone, digits(phone),
        `${1994 + i}-${String(i % 12 + 1).padStart(2, '0')}-${String(i + 8).padStart(2, '0')}`,
        'g-' + (i % 3 + 1), i === 14 ? 'EXPELLED' : i === 13 ? 'GRADUATED' : 'ACTIVE',
        i === 0 ? 64 : i === 13 ? 100 : 18 + (i * 11) % 78, i === 0 ? 'u-student' : null);
    });
    const offsets = [-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,-1,0,0,0,1,1,2,2,3,3,4,5,7,9];
    offsets.forEach((offset, i) => {
      const group = i % 3 + 1;
      const individual = i % 2 === 0;
      const clock = ['09:00', '11:00', '13:00', '15:00', '17:00', '18:00', '19:00'][i % 7];
      const student = [1, 4, 7, 10, 13, 2, 3, 1, 5, 6, 9, 12, 1][Math.floor(i / 2)];
      const status = i % 7 === 4 ? 'CANCELLED' : offset < 0 ? 'DONE' : 'PLANNED';
      run('INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?,?,?,?)', 'l-' + (i + 1), individual ? 'INDIVIDUAL' : 'GROUP', offsetDay(today, offset), clock,
        minutes(clock), individual ? 60 : 90, individual ? null : 'g-' + group, individual ? 's-' + student : null,
        'i-' + (individual ? (student - 1) % 3 + 1 : group), topics[i % topics.length], status);
    });
    Array.from({ length: 12 }, (_, i) => {
      const date = new Date(today.slice(0, 7) + '-01T00:00:00Z');
      date.setUTCMonth(date.getUTCMonth() - (i % 3));
      const dateKey = date.toISOString().slice(0, 10);
      const day = i % 3 === 0 ? offsetDay(dateKey, Math.min(i, Number(today.slice(-2)) - 1)) : offsetDay(dateKey, i + 4);
      run('INSERT INTO payments (id,studentId,studentName,amount,date,method,comment) VALUES (?,?,?,?,?,?,?)',
        'p-' + (i + 1), 's-' + (i + 1), names[i], [1650000, 1200000, 1850000, 850000, 2400000, 1950000][i % 6],
        day, ['CARD', 'TRANSFER', 'CASH'][i % 3], i % 3 === 1 ? 'Второй взнос за обучение' : 'Оплата обучения');
    });
    requestTexts.forEach((message, i) => run('INSERT INTO requests VALUES (?,?,?,?,?)',
      'r-' + (i + 1), 'u-student', message, i < 2 ? 'NEW' : 'DONE', offsetDay(today, -i) + 'T08:15:00.000Z'));
  });
  console.log('Демо-данные созданы: 3 аккаунта, 4 инструктора, 3 группы, 15 учеников, 25 занятий, 12 оплат, 5 обращений.');
}
