import type { StaleItem } from '@weiping/wingline-core'

/** 卡住原因的短标签（收件箱与任务板共用；node 侧的同一份在 core 的 STALE_REASON_LABEL）。 */
export const STALE_REASON: Record<StaleItem['reason'], string> = {
  done_unfinished: '已完成但未收尾',
  call_uncertain: '调用结果不确定',
  dead_assignee: '派发失主',
  owner_idle: '主人迟迟未开始',
  bypassed: '绕过闸门上报',
  blocked_waiting: '等待决策',
}
