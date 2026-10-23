import { z } from 'zod'

const ID = /^[a-z0-9-]+$/
const idMessage = '只能用小写字母、数字、连字符'

const pos = z.number().int().positive()

const linksSchema = z
  .object({
    reviewed_by: z.array(z.string()).optional(),
    hands_to: z.array(z.string()).optional(),
    consults: z.array(z.string()).optional(),
  })
  .strict()

const budgetsSchema = z
  .object({
    team: z.unknown().optional(),
    task: z
      .object({
        max_gate_failures: pos.default(3),
        gate_timeout_seconds: pos.default(600),
        max_minutes: pos.optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .default({})

const notifySchema = z
  .object({
    webhook: z.string().url().refine((u) => /^https?:/.test(u), 'webhook 必须是 http: 或 https: URL').optional(),
    command: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()

const patrolSchema = z
  .object({
    no_progress_minutes: pos.default(20),
    prompt_minutes: pos.default(5),
    owner_idle_minutes: pos.default(30),
    post_failure_streak: pos.default(3),
    freeze_lead: z.boolean().default(false),
    auto_recover: z.boolean().default(false),
    worktree_comment: z.boolean().default(false),
    workspace_status: z.boolean().default(true),
    unread_mark: z.boolean().default(true),
    notify: notifySchema.optional(),
  })
  .strict()
  .default({})

export const postSchema = z
  .object({
    id: z.string().regex(ID, idMessage),
    agent: z.string().min(1),
    model: z.string().min(1).optional(),
    launch: z.string().min(1).optional(),
    worktree: z.string().min(1).default('current'),
    brief: z.array(z.string().min(1)).default([]),
    self_claim: z.boolean().default(false),
    tags: z.array(z.string().regex(ID, idMessage)).default([]),
    plan_first: z.boolean().default(false),
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
    links: z.record(z.string(), linksSchema).default({}),
    gates: z.record(z.string(), z.string().min(1)).default({}),
    budgets: budgetsSchema,
    patrol: patrolSchema,
  })
  .strict()

export type RawTeam = z.infer<typeof teamSchema>
