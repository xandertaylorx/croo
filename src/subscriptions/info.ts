// Kept apart from the model catalog so the renderer can use it: no file access in here.

/** The coding agents you can sign in to with a subscription instead of an API key. */
export type SubscriptionId = 'claude-code' | 'codex'

export interface SubscriptionInfo {
  id: SubscriptionId
  label: string
  /** The command the CLI installs. */
  binary: string
  /** The plan that includes it, for the button. */
  plan: string
  install: string
  login: string
}

export const SUBSCRIPTIONS: Record<SubscriptionId, SubscriptionInfo> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude subscription',
    binary: 'claude',
    plan: 'Pro, Max or Team',
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude auth login',
  },
  codex: {
    id: 'codex',
    label: 'ChatGPT subscription',
    binary: 'codex',
    plan: 'Plus, Pro, Business or Edu',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
  },
}

export const isSubscription = (type: string): type is SubscriptionId => type === 'claude-code' || type === 'codex'
