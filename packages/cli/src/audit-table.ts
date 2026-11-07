import type { AuditTable } from '@weiping/wingline-core'
import { coreAuditTable } from '@weiping/wingline-core'

import type { Commands } from './cli.js'

/**
 * CLI 的审计表就是 core 那一张（core/src/audit-table.ts）：CLI、控制台（3B）与 Orca 插件
 * 共用同一批审计行，谁调用都不会写出另一种形状的记录。
 */
export const AUDIT: AuditTable<Commands> = coreAuditTable<Commands>()
