export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  /** Opaque provider data that must round-trip (e.g. Gemini thought signatures). */
  meta?: unknown
}

export type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
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
  system: string
  messages: Msg[]
  tools: ToolSpec[]
  signal?: AbortSignal
}

export interface ChatResult {
  text: string
  toolCalls: ToolCall[]
  usage: Usage
}

export interface Provider {
  chat(req: ChatRequest, onText: (delta: string) => void): Promise<ChatResult>
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini'

export interface Profile {
  type: ProviderType
  model: string
  baseUrl?: string
  apiKey?: string
  /** Optional USD per million tokens, for the cost estimate in the status line. */
  inputPerMTok?: number
  outputPerMTok?: number
}

export interface Config {
  activeProfile: string
  profiles: Record<string, Profile>
  pet: boolean
  animations: boolean
}
