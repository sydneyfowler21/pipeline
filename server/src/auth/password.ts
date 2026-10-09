import { hash, verify, type Options } from '@node-rs/argon2';

/** Argon2id. The napi const enum cannot be imported under isolatedModules; 2 is Algorithm.Argon2id. */
const ARGON2ID = 2 as NonNullable<Options['algorithm']>;

/** OWASP argon2id: m=19456 KiB, t=2, p=1. */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword('not-a-real-account-password');
  return dummy;
}
