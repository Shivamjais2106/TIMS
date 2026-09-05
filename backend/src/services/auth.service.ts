import { env } from '../config/env';
import { prisma } from '../config/prisma';
import type { Role } from '../generated/prisma/enums';
import { ApiError } from '../utils/ApiError';
import { signAccessToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import type { LoginInput, SignupInput } from '../validators/auth.schema';

/** Shape returned to clients. `passwordHash` is never part of it. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** bcrypt hash of a value nobody knows, used only to equalise login timing. */
const TIMING_DECOY_HASH = '$2b$12$K8H1s5Ux0k9m3QpJ6wYbUu4nJ1o0LZ2sVYt1a0Pq9RcS3vNwXeCzO';

export interface AuthResult {
  user: PublicUser;
  token: string;
  expiresIn: string;
}

export async function signup(input: SignupInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: publicUserSelect,
  });

  return buildAuthResult(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same message for "no such user" and "wrong password" so the endpoint
  // cannot be used to enumerate registered addresses.
  const invalid = ApiError.unauthorized('Invalid email or password');
  if (!user) {
    // Burn a comparable amount of time so the endpoint cannot be used as an
    // account-existence oracle by measuring response latency.
    await verifyPassword(input.password, TIMING_DECOY_HASH).catch(() => false);
    throw invalid;
  }

  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) throw invalid;

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return buildAuthResult(publicUser);
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

function buildAuthResult(user: PublicUser): AuthResult {
  const token = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  return { user, token, expiresIn: env.JWT_EXPIRES_IN };
}
