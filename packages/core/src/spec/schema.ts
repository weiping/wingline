import { z } from 'zod'

const ID = /^[a-z0-9-]+$/
const idMessage = '只能用小写字母、数字、连字符'

export const postSchema = z
  .object({
    id: z.string().regex(ID, idMessage),
    agent: z.string().min(1),
    model: z.string().min(1).optional(),
    launch: z.string().min(1).optional(),
    worktree: z.string().min(1).default('current'),
    brief: z.array(z.string().min(1)).default([]),
  })
  .strict()

export const teamSchema = z
  .object({
    version: z.literal(1),
    name: z.string().regex(ID, idMessage),
    repo: z.string().min(1),
    norms: z.string().min(1),
    lead: z.string().min(1),
    posts: z.array(postSchema).min(1),
  })
  .strict()

export type RawTeam = z.infer<typeof teamSchema>

/** 首期保留但拒绝的字段 → 开放阶段。 */
export const RESERVED_TOP = { links: 2, gates: 2, budgets: 2 } as const
export const RESERVED_POST = { self_claim: 2, tags: 2, plan_first: 2 } as const
