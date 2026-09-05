import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** Hashes a plaintext password. Cost factor is configurable via BCRYPT_SALT_ROUNDS. */
export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.BCRYPT_SALT_ROUNDS);
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, passwordHash);
}
