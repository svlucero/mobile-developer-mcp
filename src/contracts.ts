import { z } from 'zod';

export const providerSchema = z.enum(['google-play', 'app-store']);
export type Provider = z.infer<typeof providerSchema>;

export const periodSchema = z
  .object({
    start: z.string().date(),
    end: z.string().date()
  })
  .refine(({ start, end }) => start <= end, {
    message: 'start must be on or before end'
  });
export type Period = z.infer<typeof periodSchema>;

export const unitSchema = z.enum(['count', 'percentage', 'bytes', 'seconds']);
export type Unit = z.infer<typeof unitSchema>;

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(1_024).optional()
});
export type Pagination = z.infer<typeof paginationSchema>;

export const queryMetadataSchema = z.object({
  source: providerSchema,
  period: periodSchema.optional(),
  unit: unitSchema,
  pagination: paginationSchema.optional(),
  limits: z.object({
    maxItems: z.number().int().positive().max(100),
    truncated: z.boolean()
  })
});
export type QueryMetadata = z.infer<typeof queryMetadataSchema>;
