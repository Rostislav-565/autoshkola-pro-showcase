export const roles = { ADMIN: 'Администратор', INSTRUCTOR: 'Инструктор', STUDENT: 'Ученик' } as const;
export const studentStatuses = { ACTIVE: 'Активен', GRADUATED: 'Выпустился', EXPELLED: 'Отчислен' } as const;
export const lessonStatuses = { PLANNED: 'Запланировано', DONE: 'Проведено', CANCELLED: 'Отменено' } as const;
export const methods = { CASH: 'Наличные', CARD: 'Карта', TRANSFER: 'Перевод' } as const;
export const requestStatuses = { NEW: 'Новое', DONE: 'Обработано' } as const;
export const lessonTypes = { GROUP: 'Групповое', INDIVIDUAL: 'Индивидуальное' } as const;
export type Role = keyof typeof roles;
export type StudentStatus = keyof typeof studentStatuses;
export type LessonStatus = keyof typeof lessonStatuses;
export type LessonType = keyof typeof lessonTypes;
export type Method = keyof typeof methods;
export type RequestStatus = keyof typeof requestStatuses;
export type Item = { id: string; name: string };
export type UserView = Item & { role: Role; login: string; profileId: string | null };
export type Student = Item & { phone: string; birthDate: string; groupId: string | null; groupName: string | null; status: StudentStatus; theoryProgress: number; login: string | null };
export type Instructor = Item & { phone: string; car: string; login: string | null; groupCount: number };
export type Group = Item & { instructorId: string; instructorName: string; studentCount: number };
export type Lesson = { id: string; type: LessonType; date: string; startTime: string; durationMin: number; groupId: string | null; studentId: string | null; instructorId: string; topic: string; status: LessonStatus; instructorName: string; groupName: string | null; studentName: string | null };
export type Payment = { id: string; studentId: string; studentName: string; amount: number; date: string; method: Method; receiptNumber: number; comment: string };
export type Inquiry = { id: string; userId: string; name: string; text: string; status: RequestStatus; createdAt: string };
export type Page<T> = { items: T[]; page: number; pages: number; count: number; total?: number };
export type StudentDetail = Student & { lessons: Page<Lesson>; payments: Page<Payment> };
export type Options = { students: Item[]; activeStudents: Item[]; instructors: Item[]; groups: (Item & { instructorId: string })[] };
export type Dashboard = {
  students: number; instructors: number; groups: number; revenue: number; today: string;
  monthly: { month: string; amount: number }[]; upcoming: Lesson[]; requests: Inquiry[];
};
export const pageSize = 50;
export const normalize = (value: string) => value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
export const digits = (value: string) => value.replace(/\D/g, '');
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export const asDate = (value: string) => new Date(value.length === 10 ? value + 'T00:00:00Z' : value);
export const dateInZone = (zone = 'Europe/Saratov', date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(date);
export const timeInZone = (zone = 'Europe/Saratov') => new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format();
export function offsetDay(day: string, offset: number) {
  const date = asDate(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return isoDay(date);
}
export const monday = (day: string) => offsetDay(day, -((asDate(day).getUTCDay() + 6) % 7));
export const formatDay = (day: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(asDate(day));
export const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: kopecks % 100 ? 2 : 0,
}).format(kopecks / 100);
export const receiptNumber = (serial: number) => String(serial).padStart(6, '0');
export const phonePattern = /^[+]?\d[\d ()-]{8,22}$/;
export const loginPattern = /^[a-z0-9._-]{3,40}$/;
export function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(asDate(value).getTime()) && isoDay(asDate(value)) === value;
}
