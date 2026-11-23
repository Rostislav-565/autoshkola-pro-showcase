import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { one, run } from './db.ts';
import type { UserView } from './shared.ts';

const scryptKey = promisify(scrypt);
const lifetime = 12 * 60 * 60;
const cookieName = 'autoshkola_sid';
const missingAccount = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptKey(password, salt, 64) as Buffer;
  return ['scrypt', salt, key.toString('hex')].join('$');
}
export async function checkPassword(password: string, hash = missingAccount) {
  const [, salt, stored] = hash.split('$');
  const derived = await scryptKey(password, salt, 64) as Buffer;
  return timingSafeEqual(Buffer.from(stored, 'hex'), derived);
}
function sessionToken(req: IncomingMessage) {
  return req.headers.cookie?.match(/(?:^|;\s*)autoshkola_sid=([a-f0-9]{64})(?=;|$)/)?.[1];
}
export function userFor(req: IncomingMessage): UserView | undefined {
  const token = sessionToken(req);
  if (!token) return;
  return one<UserView>(`SELECT u.id, u.name, u.login, u.role,
      CASE u.role WHEN 'STUDENT' THEN s.id WHEN 'INSTRUCTOR' THEN i.id END AS profileId
    FROM sessions t JOIN users u ON u.id = t.userId
    LEFT JOIN students s ON s.userId = u.id AND s.deletedAt IS NULL
    LEFT JOIN instructors i ON i.userId = u.id
    WHERE t.tokenHash = ? AND t.expiresAt > ?
      AND (u.role = 'ADMIN' OR s.id IS NOT NULL OR i.id IS NOT NULL)`, hashToken(token), Date.now());
}
function setCookie(res: ServerResponse, token: string, age: number) {
  const security = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${security}`);
}
export function login(res: ServerResponse, userId: string) {
  const token = randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expiresAt <= ?', Date.now());
  run('INSERT INTO sessions VALUES (?, ?, ?)', hashToken(token), userId, Date.now() + lifetime * 1000);
  setCookie(res, token, lifetime);
}
export function logout(req: IncomingMessage, res: ServerResponse) {
  const token = sessionToken(req);
  if (token) run('DELETE FROM sessions WHERE tokenHash = ?', hashToken(token));
  setCookie(res, '', 0);
}
const attempts = new Map<string, { count: number; until: number }>();
export function limitLogin(req: IncomingMessage) {
  const now = Date.now();
  if (attempts.size > 1000) for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
  const address = req.socket.remoteAddress || 'local';
  const entry = attempts.get(address);
  if (!entry || entry.until <= now) {
    attempts.set(address, { count: 1, until: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 20;
}
