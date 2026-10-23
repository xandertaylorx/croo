export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  /** Opaque provider data that must round-trip (e.g. Gemini thought signatures). */
  meta?: unknown
}

export type Msg = (
  /** `display` is what the chat shows when it differs from what the model got (e.g. "/init"). */
  | {
      role: 'user'
      content: string
      display?: string
      images?: ImageAtt[]
      attached?: AttachedFile[]
      /** Written by Croo, not typed (e.g. a Stop hook's feedback). Shown as a note and not counted as a turn. */
      auto?: boolean
    }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[]; thinking?: string; /** Provider data that must round-trip, e.g. Anthropic's signed thinking blocks. */ meta?: unknown }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean; /** e.g. a browser screenshot, for models that can see. */ images?: ImageAtt[] }
) & {
  /**
   * Set when the conversation was compacted: a summary of every message before this one. The model is sent
   * the summary and the messages from here on; the chat still shows everything.
   */
  summaryBefore?: string
}

/** An image sent with a message, as base64 (no data: prefix). */
export interface ImageAtt {
  name: string
  mime: string
  data: string
}

/** A text file sent with a message. Its text is already part of `content`; this keeps it for editing and display. */
export interface AttachedFile {
  name: string
  text: string
}

export interface ToolSpec {
  name: string
  description: string
  /** JSON schema (kept to the common subset: type/properties/required/description/enum/items). */
  parameters: Record<string, any>
}

export interface Usage {
  /** Uncached input tokens. */
  input: number
  output: number
  /** Input tokens read from the provider's prompt cache (billed at a fraction of the input price). */
  cacheRead?: number
  /** Input tokens written to the prompt cache (Anthropic bills these at a premium). */
  cacheWrite?: number
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
  /** Set for the model Croo runs itself: the LOCAL_MODELS id. The base URL is filled in when the engine starts. */
  engine?: string
  apiKey?: string
  /** The key encrypted with the OS keychain (written by the desktop app instead of apiKey). */
  apiKeyEnc?: string
  /** Optional USD per million tokens, for the cost estimate in the status line. */
  inputPerMTok?: number
  outputPerMTok?: number
}

/** An MCP server: a command Croo starts (stdio) or a remote URL (Streamable HTTP). */
export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  disabled?: boolean
  /** env and headers encrypted with the OS keychain (written by the desktop app in their place). */
  secretsEnc?: string
}

/** manual: ask for everything · auto: ask only when it matters · plan: look but don't touch · bypass: never ask */
export type PermissionMode = 'manual' | 'auto' | 'plan' | 'bypass'

export interface Config {
  activeProfile: string
  profiles: Record<string, Profile>
  pet: boolean
  animations: boolean
  permissionMode: PermissionMode
  /** System notification when a turn finishes or needs approval while the window is in the background. */
  notify: boolean
  effort: import('./effort.js').Effort
  /** Shown bottom left; both optional. `avatar` is a small image data URL. */
  /** Croo remembers things about you across chats (Chat mode). */
  memory?: boolean
  /** MCP servers whose tools the agent can use in Code mode, by name. */
  mcpServers?: Record<string, McpServerConfig>
  userName?: string
  avatar?: string
  /** Check edited files with the project's type checker or a syntax check and tell the agent about errors. */
  diagnostics?: boolean
  /** Folders whose .croo/hooks.json the user trusted, as "folder#fingerprint". */
  trustedHooks?: string[]
}
