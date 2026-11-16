export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlanStatus = 'pending' | 'in_progress' | 'completed'

export type PlanStep = {
  text: string
  status: PlanStatus
  /** TaskCreate's id, which TaskUpdate names the step by. */
  id?: string
}

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** What the subagent is doing now, read from its latest tool call. */
  stepNote?: string
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
}

declare module 'claude-code' {
  interface PluginState {
    'progress-desk': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      plan: PlanStep[]
      /**
       * Inside Le Fluff, where the panel is handed over as drawings instead of opened as a pane:
       * when it was opened, so each opening has its own number; 0 while it is closed.
       */
      shownInLeFluff: number
    }
  }
}
