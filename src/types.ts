export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  /** Opaque provider data that must round-trip (e.g. Gemini thought signatures). */
  meta?: unknown
}

export type Msg =
  /** `display` is what the chat shows when it differs from what the model got (e.g. "/init"). */
  | { role: 'user'; content: string; display?: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[]; thinking?: string; /** Provider data that must round-trip, e.g. Anthropic's signed thinking blocks. */ meta?: unknown }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean }

export interface ToolSpec {
  name: string
  description: string
  /** JSON schema (kept to the common subset: type/properties/required/description/enum/items). */
  parameters: Record<string, any>
}

export interface Usage {
  input: number
  output: number
}

export interface ChatRequest {
  /** Reasoning effort; omitted or "auto" lets the provider decide. */
  effort?: import('./effort.js').Effort
  system: string
  messages: Msg[]
  tools: ToolSpec[]
  signal?: AbortSignal
}

export interface ChatResult {
  text: string
  thinking?: string
  meta?: unknown
  toolCalls: ToolCall[]
  usage: Usage
}

export interface Provider {
  chat(req: ChatRequest, onText: (delta: string) => void, onThinking?: (delta: string) => void): Promise<ChatResult>
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini'

export interface Profile {
  type: ProviderType
  model: string
  baseUrl?: string
  apiKey?: string
  /** The key encrypted with the OS keychain (written by the desktop app instead of apiKey). */
  apiKeyEnc?: string
  /** Optional USD per million tokens, for the cost estimate in the status line. */
  inputPerMTok?: number
  outputPerMTok?: number
}

/** manual: ask for everything · auto: ask only when it matters · bypass: never ask */
export type PermissionMode = 'manual' | 'auto' | 'bypass'

export interface Config {
  activeProfile: string
  profiles: Record<string, Profile>
  pet: boolean
  animations: boolean
  permissionMode: PermissionMode
  effort: import('./effort.js').Effort
}
