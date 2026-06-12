import assert from "node:assert/strict";
import {
  clearLoginFailures,
  getLoginLockSeconds,
  loginAttemptKey,
  recordFailedLogin,
  validatePasswordStrength
} from "../server/utils/security.js";

assert.equal(validatePasswordStrength("password").valid, false, "weak lowercase-only passwords should fail");
assert.equal(validatePasswordStrength("Password1").valid, true, "mixed-case password with a number should pass");

const key = loginAttemptKey("Manager@StoreOps.com", "127.0.0.1");
clearLoginFailures(key);
assert.equal(getLoginLockSeconds(key, 1_000), 0, "fresh login key should not be locked");

for (let attempt = 0; attempt < 4; attempt += 1) {
  recordFailedLogin(key, 1_000 + attempt);
}
assert.equal(getLoginLockSeconds(key, 2_000), 0, "four failed attempts should not lock the account");

recordFailedLogin(key, 3_000);
assert.ok(getLoginLockSeconds(key, 4_000) > 0, "five failed attempts should create a temporary lock");

clearLoginFailures(key);
assert.equal(getLoginLockSeconds(key, 5_000), 0, "clearing login failures should remove the lock");

console.log("security tests passed");
