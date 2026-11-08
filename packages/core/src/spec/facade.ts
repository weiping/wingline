/**
 * 插件与控制台的规格编辑门面：只暴露编辑器需要的读写与预演，不重复实现业务。
 * 写操作经 `auditedCommands` + core 审计表，默认 actor 为 `human`（与 CLI / 旧 console 一致）。
 */
import fs from 'node:fs'
import path from 'node:path'

import { auditedCommands } from '../audit.js'
import { coreAuditTable } from '../audit-table.js'
import {
  discardDraftCmd,
  readSpecForEdit,
  saveSpecCmd,
  validateSpecEdit,
  type SaveSpecArgs,
  type SpecEditResult,
  type SpecForEdit,
} from '../commands/spec.js'
import type { CommandDeps } from '../commands/deps.js'
import { readDocText, resolveDocPath, writeDocAtomic } from '../spec/doc.js'
import type { SpecEditOp } from '../spec/edit.js'
import type { SpecPlan } from '../spec/plan-change.js'

export type { SpecEditResult, SpecForEdit, SpecEditOp, SpecPlan, SaveSpecArgs }

/** 一次 validate 的入参（不含 team，由调用方传入团队名）。 */
export interface SpecValidateInput {
  yaml: string
  set?: SpecEditOp
  files?: Record<string, string>
}

/** 一次 save 的入参（不含 team）；审计走 audited save。 */
export interface SpecSaveInput extends Omit<SaveSpecArgs, 'team'> {}

const facaded = (deps: CommandDeps) =>
  auditedCommands(
    { saveSpecCmd, discardDraftCmd },
    coreAuditTable(),
    { actor: 'human' },
  )

/**
 * 团队规格编辑门面：读盘走现有 command，写操作走审计包装。
 * 由插件 worker、测试与后续 Phase 3 面板共用。
 */
export function createSpecFacade(deps: CommandDeps) {
  const audited = facaded(deps)

  function specDir(team: string): string | null {
    const row = deps.registry.getTeam(team)
    if (!row) return null
    return path.dirname(row.specPath)
  }

  return {
    /** 加载编辑器：YAML、草稿、哈希、引用文档正文。 */
    readForEdit(team: string): SpecForEdit {
      return readSpecForEdit(deps, team)
    },

    /** 校验并预演；不写任何文件。 */
    validate(team: string, input: SpecValidateInput): SpecEditResult {
      return validateSpecEdit(deps, { team, ...input })
    },

    /** 保存规格（及文档）；写入审计（command: spec save）。 */
    async save(team: string, input: SpecSaveInput) {
      return audited.saveSpecCmd(deps, { team, ...input })
    },

    /** 丢弃草稿。 */
    async discardDraft(team: string, retryRequest?: string) {
      return audited.discardDraftCmd(deps, { team, retryRequest })
    },

    /** 规格目录下某引用文档的绝对路径（越界路径会被 core 拒绝）。 */
    resolveDoc(team: string, rel: string): string | null {
      const dir = specDir(team)
      if (!dir) return null
      try {
        return resolveDocPath(dir, rel)
      } catch {
        return null
      }
    },

    /** 读取 NORMS / brief 等引用文档正文。 */
    readDoc(team: string, rel: string): string | null {
      const dir = specDir(team)
      if (!dir) return null
      try {
        return readDocText(resolveDocPath(dir, rel))
      } catch {
        return null
      }
    },

    /** 写入引用文档（原子写）；一般由 save 一并处理。 */
    writeDoc(team: string, rel: string, content: string): void {
      const dir = specDir(team)
      if (!dir) throw new Error(`团队 ${team} 未登记`)
      writeDocAtomic(resolveDocPath(dir, rel), content)
    },
  }
}
