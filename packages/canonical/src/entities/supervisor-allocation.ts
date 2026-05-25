import { z } from 'zod';

/**
 * SupervisorAllocation — mapping between a doctoral student's Instance and
 * one or more academic supervisors (HESA Data Futures SupervisorAllocation
 * entity). Required for F03-08 when the qualification aim is doctoral
 * (QUALCAT = D). Multiple allocations per Instance are common.
 */
export const SupervisorAllocationZ = z.object({
  id: z.string().uuid(),
  sourceId: z.string(),
  /** Foreign key to canonical Instance.id. */
  instanceId: z.string().uuid(),
  /** Identifier for the supervisor in the source system. */
  supervisorSourceId: z.string(),
  /** Display name (PII — redact in logs). */
  supervisorName: z.string().optional(),
  /** HESA SUPROLE — supervisory role (e.g. lead, second, external). */
  role: z.enum(['lead', 'second', 'external', 'other']),
  /** Allocation start/end dates. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export type SupervisorAllocation = z.infer<typeof SupervisorAllocationZ>;
