import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import axios, { AxiosError, AxiosInstance } from "axios";
import { EnvService } from "../../config/env.service";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "json" | "text";
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  latencyMs: number;
}

/**
 * Thin wrapper around xAI's OpenAI-compatible `/chat/completions` endpoint.
 * Knows nothing about domain logic — it only formats a chat request, calls
 * Grok, and returns the raw text content (plus usage + latency for audit).
 */
@Injectable()
export class GrokClient {
  private readonly logger = new Logger(GrokClient.name);
  private readonly http: AxiosInstance;
  private readonly model: string;

  constructor(env: EnvService) {
    this.model = env.get("GROK_MODEL");
    this.http = axios.create({
      baseURL: env.get("GROK_API_URL"),
      timeout: 20_000,
      headers: {
        authorization: `Bearer ${env.get("GROK_API_KEY")}`,
        "content-type": "application/json",
      },
    });
  }

  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const started = Date.now();
    try {
      const { data } = await this.http.post("/chat/completions", {
        model: this.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        ...(req.responseFormat === "json"
          ? { response_format: { type: "json_object" } }
          : {}),
      });

      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string") {
        throw new Error(`unexpected chat completion shape: ${JSON.stringify(data)}`);
      }

      return {
        content,
        model: data.model ?? this.model,
        usage: data.usage,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = err.response?.data ?? err.message;
        this.logger.error(`grok chat failed: ${JSON.stringify(detail)}`);
        throw new InternalServerErrorException({
          error: "grok_unavailable",
          message: "AI advisor unavailable",
          details: detail,
        });
      }
      throw err as Error;
    }
  }
}
