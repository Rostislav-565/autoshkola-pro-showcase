import { digits, loginPattern, normalize, phonePattern, validDay } from './shared.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
export function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Ожидался объект JSON.');
  return value as Record<string, unknown>;
}
export function found<T>(value: T | undefined): T {
  if (!value) throw new ApiError(404, 'Запись не найдена.');
  return value;
}
export class Form {
  private readonly data: Record<string, unknown>;
  private readonly errors: Record<string, string> = {};
  constructor(value: unknown) {
    this.data = requireRecord(value);
  }
  text(key: string, label: string, max = 120, required = true) {
    const value = this.data[key];
    const clean = typeof value === 'string' ? value.trim() : '';
    if (typeof value !== 'string' && (required || value != null)) this.errors[key] = label;
    else if ((required && !clean) || clean.length > max) this.errors[key] = label;
    return clean;
  }
  choice<T extends string>(key: string, choices: readonly T[], message = 'Выберите значение.') {
    const value = this.data[key];
    const result = choices.find(choice => choice === value);
    if (!result) this.errors[key] = message;
    return result ?? choices[0];
  }
  integer(key: string, min: number, max: number, message: string) {
    const value = this.data[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
      this.errors[key] = message;
      return min;
    }
    return value;
  }
  date(key: string, max?: string) {
    const value = this.text(key, 'Укажите корректную дату.', 10);
    if (!validDay(value) || (max && value > max)) this.errors[key] = max ? 'Укажите дату не позднее сегодняшней.' : 'Укажите корректную дату.';
    return value;
  }
  phone() {
    const message = 'Укажите номер телефона с 10–15 цифрами.';
    const value = this.text('phone', message, 24);
    if (!phonePattern.test(value) || !/^\d{10,15}$/.test(digits(value))) this.errors.phone = message;
    return value;
  }
  login() {
    const message = 'От 3 до 40 символов: латинские буквы, цифры, точка, дефис или подчёркивание.';
    const value = normalize(this.text('login', message, 40, false));
    if (value && !loginPattern.test(value)) this.errors.login = message;
    return value;
  }
  password(required: boolean, minimum = 8) {
    const value = this.data.password;
    if (typeof value === 'string' && value.length >= minimum && value.length <= 128) return value;
    if (required || (typeof value === 'string' && value.length)) {
      this.errors.password = minimum === 1 ? 'Введите пароль.' : 'Введите пароль длиной от 8 до 128 символов.';
    }
    return '';
  }
  error(key: string, message: string) { this.errors[key] = message; }
  done() {
    if (Object.keys(this.errors).length) throw new ApiError(422, 'Проверьте заполнение полей.', this.errors);
  }
}
