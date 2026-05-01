import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1).trim(),
  password: z.string().min(1),
});

export const deviceSchema = z.object({
  alias: z.string().min(1, '기기 별명은 필수입니다.').trim(),
  deviceName: z.string().trim().default(''),
  qrPayload: z.string().min(1, 'QR 인식값은 필수입니다.').trim(),
  numericCode: z.string().min(1, '숫자 코드는 필수입니다.').trim(),
  manufacturer: z.string().trim().default(''),
  model: z.string().trim().default(''),
  location: z.string().trim().default(''),
  notes: z.string().trim().default(''),
  tagIds: z.array(z.string().min(1)).default([]),
});

export const tagSchema = z.object({
  name: z.string().min(1, '태그 이름은 필수입니다.').trim(),
});

export function parseJson<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    return {
      ok: false as const,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}
