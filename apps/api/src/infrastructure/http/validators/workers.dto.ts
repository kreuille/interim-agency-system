import { z } from 'zod';

export const registerWorkerDto = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  avs: z.string(),
  iban: z.string(),
  residenceCanton: z.string().length(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export type RegisterWorkerDto = z.infer<typeof registerWorkerDto>;

export const updateWorkerDto = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  iban: z.string().optional(),
  residenceCanton: z.string().length(2).optional(),
  email: z.union([z.string().email(), z.null()]).optional(),
  phone: z.union([z.string(), z.null()]).optional(),
});

export type UpdateWorkerDto = z.infer<typeof updateWorkerDto>;

export const listWorkersQueryDto = z.object({
  search: z.string().optional(),
  includeArchived: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export type ListWorkersQueryDto = z.infer<typeof listWorkersQueryDto>;
