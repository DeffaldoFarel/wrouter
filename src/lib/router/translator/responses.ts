/**
 * OpenAI Chat Completions ⇄ OpenAI Responses translator.
 *
 * WRouter speaks OpenAI Chat Completions internally. When a client calls
 * the `/v1/responses` endpoint (OpenAI Responses API format) we route
 * through these helpers so:
 *   - request body is translated to Chat Completions format for the
 *     internal routing engine and proxy
 *   - response body / SSE stream is converted back to Responses format
 *     so the client sees the expected shape
 *
 * References:
 *   - https://platform.openai.com/docs/api-reference/responses/create
 *   - https://platform.openai.com/docs/api-reference/responses/streaming
 *
 * Key mapping differences:
 *   Request:
 *     - `input` (string | array) → `messages` array
 *     - `max_output_tokens` → `max_tokens`
 *     - `top_p`, `temperature` → same
 *     - `tools` → same (shape is compatible)
 *     - `stream` → same
 *
 *   Response (non-stream):
 *     - `id` → same (prefixed with "resp_")
 *     - `object: "response"` (not "chat.completion")
 *     - `output` array (not `choices`)
 *     - `status: "completed"`
 *     - `usage` → same field names but slightly different structure
 *
 *   Response (streaming):
 *     - Event names: `response.created`, `response.output_text.delta`, etc.
 *     - Final event: `response.completed` (not `data: [DONE]`)
 */

import type { ChatCompletionRequest } from "../proxy-types";

// ── REQUEST: Responses → Chat Completions ───────────────────────────

interface ResponsesRequest {
  model: string;
  input: string | Array<Record<string, unknown>>;
  max_output_tokens?: number | null;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Translate OpenAI Responses API request → Chat Completions request.
 *
 * This allows WRouter to process Responses-format requests through its
 * existing routing engine and proxy (which speak Chat Completions).
 */
export function responsesToChat(req: ResponsesRequest): ChatCompletionRequest {
  const messages: Array<{ role: string; content: unknown }> = [];

  if (typeof req.input === "string") {
    // Simple string input → single user message
    messages.push({ role: "user", content: req.input });
  } else if (Array.isArray(req.input)) {
    for (const item of req.input) {
      if (item.role === "system") {
        messages.push({ role: "system", content: item.content ?? "" });
      } else if (item.role === "user") {
        messages.push({ role: "user", content: item.content ?? "" });
      } else if (item.role === "assistant") {
        messages.push({ role: "assistant", content: item.content ?? "" });
      }
      // Other roles (tool, etc.) — normalize to {role, content}
      else if (typeof item.role === "string") {
        messages.push({ role: item.role, content: item.content ?? "" });
      }
    }
  }

  const out: ChatCompletionRequest = {
    model: req.model,
    messages,
  };

  if (typeof req.max_output_tokens === "number" && req.max_output_tokens > 0) {
    out.max_tokens = req.max_output_tokens;
  }
  if (typeof req.temperature === "number") out.temperature = req.temperature;
  if (typeof req.top_p === "number") out.top_p = req.top_p;
  if (req.stop !== undefined) out.stop = req.stop;
  if (typeof req.stream === "boolean") out.stream = req.stream;
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    (out as Record<string, unknown>).tools = req.tools;
  }

  return out;
}

// ── RESPONSE (non-stream): Chat Completions → Responses ─────────────

/**
 * Translate OpenAI chat.completion response → Responses API response.
 *
 * Chat completion shape:
 *   { id, object:"chat.completion", model, choices:[{message:{role,content,tool_calls}, finish_reason}], usage }
 *
 * Responses target shape:
 *   { id, object:"response", model, status:"completed", output:[{type:"message",role,content:[{type:"output_text",text}]}], usage }
 */
export function chatToResponses(chat: Record<string, unknown>): Record<string, unknown> {
  const choices = (chat.choices as Array<Record<string, unknown>>) ?? [];
  const output: Array<Record<string, unknown>> = [];

  for (const choice of choices) {
    const message = choice.message as Record<string, unknown> | undefined;
    if (!message) continue;

    const contentBlocks: Array<Record<string, unknown>> = [];

    // Text content
    if (typeof message.content === "string" && message.content) {
      contentBlocks.push({ type: "output_text", text: message.content });
    }

    // Tool calls → function_call output items
    const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fn = (tc.function as Record<string, unknown>) ?? {};
        output.push({
          type: "function_call",
          id: tc.id ?? `fc_${Math.random().toString(36).slice(2, 10)}`,
          name: fn.name ?? "",
          arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
          call_id: tc.id,
        });
      }
    }

    if (contentBlocks.length > 0) {
      output.push({
        type: "message",
        role: message.role ?? "assistant",
        content: contentBlocks,
      });
    }
  }

  const usage = chat.usage as Record<string, unknown> | undefined;
  const usageOut = usage
    ? {
        input_tokens: numOrZero(usage.prompt_tokens ?? usage.input_tokens),
        output_tokens: numOrZero(usage.completion_tokens ?? usage.output_tokens),
        total_tokens: numOrZero(usage.total_tokens),
      }
    : undefined;

  const respId = typeof chat.id === "string" ? chat.id : `resp_${Date.now()}`;
  // Ensure the response ID has the "resp_" prefix
  const finalId = respId.startsWith("resp_") ? respId : `resp_${respId.replace(/^chatcmpl-/, "")}`;

  return {
    id: finalId,
    object: "response",
    created_at: typeof chat.created === "number" ? chat.created : Math.floor(Date.now() / 1000),
    model: chat.model ?? "unknown",
    status: "completed",
    output,
    ...(usageOut ? { usage: usageOut } : {}),
  };
}

// ── RESPONSE (streaming): Chat SSE → Responses SSE ──────────────────

/**
 * Translate an OpenAI Chat Completions SSE stream into a Responses API SSE stream.
 *
 * OpenAI chat streaming events:
 *   data: { choices:[{delta:{role:"assistant"}}] }
 *   data: { choices:[{delta:{content:"..."}}] }
 *   data: { choices:[{delta:{}, finish_reason:"stop"}] }
 *   data: { choices:[], usage:{...} }   (when stream_options.include_usage: true)
 *   data: [DONE]
 *
 * Responses streaming events:
 *   event: response.created     data: { type:"response.created", response:{id,model,...} }
 *   event: response.output_item.added   data: { type:"response.output_item.added", output_index:0, item:{type:"message",...} }
 *   event: response.content_part.added  data: { type:"response.content_part.added", output_index:0, content_index:0, part:{type:"output_text",text:""} }
 *   event: response.output_text.delta   data: { type:"response.output_text.delta", output_index:0, content_index:0, delta:"..." }
 *   event: response.output_item.done    data: { type:"response.output_item.done", output_index:0, item:{type:"message",...} }
 *   event: response.completed     data: { type:"response.completed", response:{id,model,output,usage,...} }
 */
export function translateChatStreamToResponses(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.getReader();

  let responseId = `resp_${Date.now()}`;
  let model = "";
  let buffer = "";
  let roleEmitted = false;
  let outputItemEmitted = false;
  let contentPartEmitted = false;
  let accumulatedText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let finishReason: string | null = null;
  let createdAt = Math.floor(Date.now() / 1000);

  function emit(
    controller: ReadableStreamDefaultController<Uint8Array>,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const data = { type: eventType, ...payload };
    controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`));
  }

  function emitResponseCreated(controller: ReadableStreamDefaultController<Uint8Array>) {
    emit(controller, "response.created", {
      response: {
        id: responseId,
        object: "response",
        created_at: createdAt,
        model,
        status: "in_progress",
        output: [],
      },
    });
  }

  function emitOutputItemAdded(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (outputItemEmitted) return;
    outputItemEmitted = true;
    emit(controller, "response.output_item.added", {
      output_index: 0,
      item: {
        type: "message",
        role: "assistant",
        content: [],
      },
    });
  }

  function emitContentPartAdded(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (contentPartEmitted) return;
    contentPartEmitted = true;
    emit(controller, "response.content_part.added", {
      output_index: 0,
      content_index: 0,
      part: {
        type: "output_text",
        text: "",
      },
    });
  }

  function handleEvent(eventName: string, dataJson: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataJson);
    } catch {
      return;
    }

    // Extract model and id from first chunk
    if (typeof data.model === "string") model = data.model;
    if (typeof data.id === "string") {
      const rawId = data.id;
      responseId = rawId.startsWith("resp_") ? rawId : `resp_${rawId.replace(/^chatcmpl-/, "")}`;
    }
    if (typeof data.created === "number") createdAt = data.created;

    const choices = (data.choices as Array<Record<string, unknown>>) ?? [];
    const choice = choices[0];

    if (choice) {
      const delta = choice.delta as Record<string, unknown> | undefined;

      // Role delta — emit response.created and output_item.added
      if (delta && typeof delta.role === "string" && !roleEmitted) {
        roleEmitted = true;
        emitResponseCreated(controller);
        emitOutputItemAdded(controller);
        emitContentPartAdded(controller);
        return;
      }

      // Content delta
      if (delta && typeof delta.content === "string" && delta.content) {
        if (!roleEmitted) {
          roleEmitted = true;
          emitResponseCreated(controller);
          emitOutputItemAdded(controller);
          emitContentPartAdded(controller);
        }
        accumulatedText += delta.content;
        emit(controller, "response.output_text.delta", {
          output_index: 0,
          content_index: 0,
          delta: delta.content,
        });
        return;
      }

      // Finish reason
      if (choice.finish_reason) {
        finishReason = String(choice.finish_reason);
        // Emit output_item.done
        emit(controller, "response.output_item.done", {
          output_index: 0,
          item: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: accumulatedText }],
          },
        });
        return;
      }
    }

    // Usage chunk (empty choices with usage)
    if (choices.length === 0 && data.usage) {
      const usage = data.usage as Record<string, unknown>;
      inputTokens = numOrZero(usage.prompt_tokens ?? usage.input_tokens);
      outputTokens = numOrZero(usage.completion_tokens ?? usage.output_tokens);
      totalTokens = numOrZero(usage.total_tokens);
      return;
    }
  }

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIdx;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);

            let dataJson = "";
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("data: ")) {
                dataJson += line.slice(6);
              }
            }

            if (dataJson.trim() === "[DONE]") {
              // Emit response.completed with final state
              emit(controller, "response.completed", {
                response: {
                  id: responseId,
                  object: "response",
                  created_at: createdAt,
                  model,
                  status: "completed",
                  output: [
                    {
                      type: "message",
                      role: "assistant",
                      content: [{ type: "output_text", text: accumulatedText }],
                    },
                  ],
                  usage: {
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: totalTokens || inputTokens + outputTokens,
                  },
                },
              });
              break;
            }

            if (dataJson) {
              handleEvent("", dataJson, controller);
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
      }
      controller.close();
    },
  });
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
