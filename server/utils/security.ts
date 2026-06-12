const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type LoginAttempt = {
  count: number;
  firstFailedAt: number;
  lockedUntil?: number;
};

const attempts = new Map<string, LoginAttempt>();

export function validatePasswordStrength(password: string) {
  const issues = [
    password.length < 8 ? "Use at least 8 characters." : "",
    !/[a-z]/.test(password) ? "Add a lowercase letter." : "",
    !/[A-Z]/.test(password) ? "Add an uppercase letter." : "",
    !/\d/.test(password) ? "Add a number." : ""
  ].filter(Boolean);

  return { valid: issues.length === 0, issues };
}

export function loginAttemptKey(identifier: string, ip: string) {
  return `${identifier.toLowerCase()}|${ip}`;
}

export function getLoginLockSeconds(key: string, now = Date.now()) {
  const attempt = attempts.get(key);
  if (!attempt?.lockedUntil || attempt.lockedUntil <= now) {
    return 0;
  }
  return Math.ceil((attempt.lockedUntil - now) / 1000);
}

export function recordFailedLogin(key: string, now = Date.now()) {
  const current = attempts.get(key);
  const attempt = !current || now - current.firstFailedAt > WINDOW_MS
    ? { count: 0, firstFailedAt: now }
    : current;

  attempt.count += 1;
  if (attempt.count >= MAX_FAILURES) {
    attempt.lockedUntil = now + LOCK_MS;
  }
  attempts.set(key, attempt);
  return getLoginLockSeconds(key, now);
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
