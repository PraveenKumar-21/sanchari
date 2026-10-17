// Argon2id password hashing (backend-spec §7). The library defaults are Argon2id, 19 MiB, 2 passes.
import { hash, verify } from '@node-rs/argon2';

const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. With no stored hash (unknown username), verifies against a dummy hash
 * anyway, so response timing doesn't reveal which usernames exist.
 */
export async function verifyPassword(storedHash: string | undefined, password: string) {
  if (storedHash === undefined) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await verify(await dummyHash, password);
    return false;
  }
  return verify(storedHash, password);
}
