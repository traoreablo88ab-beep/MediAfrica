// Source: RESEARCH.md Pattern 20 — sets env BEFORE any module imports auth.ts
// (auth.ts:13–25 throws if JWT_SECRET is missing or < 32 chars).
// Must run as setupFile (not inside a test) because module-level imports
// resolve before any test code.
//
// Per D-27: Vitest setup-files for JWT_SECRET / ENCRYPTION_KEY fixtures lands
// in Phase 1 (auth route tests cannot run without these).
//
// IMPORTANT: must NOT begin with one of the auth.ts placeholder words
// (`change-me|secret|password|test|dev|todo|placeholder`) — auth.ts:21–25
// throws when the secret matches that anchored regex. Prefix with
// `vitest-fixture-` to satisfy length + entropy while bypassing the regex.
process.env.JWT_SECRET ||= 'vitest-fixture-jwt-secret-with-enough-entropy-for-tests';
// Must decode to exactly 32 bytes (crypto.ts KEY_LENGTH) — the previous
// fixture decoded to 33 and only worked because nothing called encrypt()/
// decrypt() with it yet (crypto.test.ts generates its own key instead).
process.env.ENCRYPTION_KEY ||= 'afsRgChLJZ2O1dLN6+TxZTzRSp7ylzUgVTTgVt6SQ68=';
process.env.COOKIE_PREFIX ||= 'app';
process.env.NODE_ENV ||= 'test';
