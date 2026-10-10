import { z } from 'zod';
import { STAGES } from './stages.js';
import { isValidTimeZone } from './time.js';

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return (
      utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
    );
  }, 'is not a real date');

function checkHttpUrl(value: string, ctx: z.RefinementCtx) {
  const trimmed = value.trim();
  if (trimmed === '') return;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'url must be http or https' });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'url must be http or https' });
  }
}

/** Absent stays absent (patch). Null or blank clears. http and https only. */
export const optionalHttpUrl = z
  .union([z.string().max(2000), z.null()])
  .optional()
  .superRefine((value, ctx) => {
    if (typeof value === 'string') checkHttpUrl(value, ctx);
  })
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

export const signupSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(12, 'password must be at least 12 characters').max(128),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine(isValidTimeZone, 'timeZone must be an IANA time zone')
      .optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

export const requestResetSchema = z
  .object({
    email: z.string().trim().email().max(320),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z.string().min(12, 'password must be at least 12 characters').max(128),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string().min(20).max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12, 'password must be at least 12 characters').max(128),
  })
  .strict();

export const createApplicationSchema = z
  .object({
    company: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(120),
    url: optionalHttpUrl,
    notes: z.string().max(5000).optional().default(''),
    applied_on: dateField,
  })
  .strict();

export const updateApplicationSchema = z
  .object({
    company: z.string().trim().min(1).max(120).optional(),
    role: z.string().trim().min(1).max(120).optional(),
    url: optionalHttpUrl,
    notes: z.string().max(5000).optional(),
  })
  .strict();

export const moveStageSchema = z
  .object({
    stage: z.enum(STAGES),
    occurred_at: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(5000).nullable().optional(),
  })
  .strict();

export type SignupInput = z.infer<typeof signupSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
