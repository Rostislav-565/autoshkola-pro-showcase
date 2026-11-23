import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.ts';
import { atomic, migrate, one, run } from './db.ts';
import { Form } from './validation.ts';

try {
  const form = new Form({ login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD, name: process.env.ADMIN_NAME, phone: process.env.ADMIN_PHONE });
  const login = form.login();
  const password = form.password(true);
  const name = form.text('name', 'Укажите имя администратора.');
  const phone = form.phone();
  if (!login) form.error('login', 'Укажите ADMIN_LOGIN.');
  if (password.length < 12) form.error('password', 'Для администратора задайте пароль длиной от 12 символов.');
  form.done();
  const hash = await hashPassword(password);
  migrate();
  atomic(() => {
    const existing = one<{ id: string; role: string }>('SELECT id,role FROM users WHERE login=?', login);
    if (existing?.role && existing.role !== 'ADMIN') throw new Error('Логин уже занят другой ролью.');
    if (existing) {
      run('UPDATE users SET passwordHash=?,name=?,phone=? WHERE id=?', hash, name, phone, existing.id);
      run('DELETE FROM sessions WHERE userId=?', existing.id);
    } else {
      run("INSERT INTO users VALUES (?,?,?,?,?,'ADMIN')", randomUUID(), login, hash, name, phone);
    }
  });
  console.log('Аккаунт администратора сохранён.');
} catch (error) {
  const fields = error && typeof error === 'object' && 'fields' in error && error.fields && typeof error.fields === 'object'
    ? ' ' + Object.values(error.fields).join(' ') : '';
  console.error((error instanceof Error ? error.message : 'Не удалось сохранить аккаунт.') + fields);
  process.exitCode = 1;
}
