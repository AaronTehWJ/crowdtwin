import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function hosting(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000,http://127.0.0.1:4000').split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins');
  }
  if (production && (!env.ALLOWED_ORIGINS || !env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 16))
    throw new Error('Hosted mode requires ALLOWED_ORIGINS and a DEMO_PASSWORD of at least 16 characters');
  return { origins, password: env.DEMO_PASSWORD, host: env.HOST ?? '0.0.0.0', port: Number(env.PORT ?? 4000), production };
}
export type Hosting = ReturnType<typeof hosting>;
// One shared demo login protects paid provider actions; credentials never enter the Vite bundle.
export function demoAuth(password?: string): RequestHandler {
  return (req, res, next) => {
    if (!password || req.path === '/api/health') return next();
    const encoded = req.headers.authorization?.match(/^Basic ([A-Za-z0-9+/=]+)$/)?.[1];
    const credentials = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
    const expected = Buffer.from(`demo:${password}`);
    const actual = Buffer.from(credentials);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="CrowdTwin", charset="UTF-8"');
    res.status(401).json({ code: 'LOGIN_REQUIRED', message: 'Sign in with the demo credentials.' });
  };
}
