// Model-provider boundary. The agent is provider-agnostic: DeepSeek now, Agnes
// later — switch via MODEL_BASE_URL / MODEL_NAME / MODEL_API_KEY only.

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface ToolDef {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ChatResponse {
  content: string | null
  tool_calls: ToolCall[]
}

export interface ModelProvider {
  chat(messages: ChatMessage[], tools: ToolDef[]): Promise<ChatResponse>
}

export interface ModelConfig {
  baseUrl: string
  model: string
  apiKey: string
}

/** OpenAI-compatible chat-completions client (DeepSeek, Agnes, OpenAI, ...). */
export class OpenAICompatibleProvider implements ModelProvider {
  constructor(private readonly cfg: ModelConfig) {}

  async chat(messages: ChatMessage[], tools: ToolDef[]): Promise<ChatResponse> {
    const base = this.cfg.baseUrl.replace(/\/+$/, "")
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        tools,
        tool_choice: "auto",
      }),
    })
    if (!res.ok) {
      throw new Error(`Model request failed (HTTP ${res.status}). Check the server-side Agnes configuration.`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>
    }
    const message = data.choices?.[0]?.message ?? {}
    return { content: message.content ?? null, tool_calls: message.tool_calls ?? [] }
  }
}

/** Deterministic stub for offline tests; cannot satisfy the live demo gate. */
export class StubProvider implements ModelProvider {
  private readonly responses: ChatResponse[]
  constructor(responses: ChatResponse[]) {
    this.responses = [...responses]
  }

  async chat(): Promise<ChatResponse> {
    return this.responses.shift() ?? { content: "", tool_calls: [] }
  }
}
