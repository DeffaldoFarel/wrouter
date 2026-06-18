/**
 * OpenAI ⇄ Anthropic translator.
 *
 * WRouter speaks OpenAI internally. When a provider's `format` column is
 * "anthropic" we route the request through these helpers so:
 *   - request body & URL & headers match Anthropic's `/v1/messages` schema
 *   - response body / SSE stream is converted back to OpenAI shape so the
 *     client (which called WRouter at /v1/chat/completions) sees an OpenAI
 *     response — regardless of the upstream dialect.
 *
 * References:
 *   - https://docs.anthropic.com/en/api/messages
 *   - https://docs.anthropic.com/en/api/messages-streaming
 *
 * Scope (v1):
 *   - text-only messages (multimodal/vision left for a follow-up)
 *   - max_tokens defaulted to 4096 if caller omits it (Anthropic requires it)
 *   - tool_use / tool_result passthrough (best-effort)
 *   - usage extraction handled by usage-extractor.ts (already multi-format)
 */

import type { ChatCompletionRequest } from "../proxy-types";

// ── REQUEST: OpenAI → Anthropic ──────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
}

/**
 * Translate OpenAI chat-completions request → Anthropic /v1/messages request.
 *
 * Notable transforms:
 *   - role:"system" message → top-level `system` string (Anthropic doesn't put it in messages)
 *   - max_tokens defaults to 4096 (Anthropic REQUIRES this field; OpenAI doesn't)
 *   - stop → stop_sequences (rename, accept string or array)
 *   - presence_penalty / frequency_penalty have no Anthropic equivalent → dropped
 *   - tools: OpenAI function-calling shape → Anthropic tools shape
 */
export function openaiToAnthropicRequest(req: ChatCompletionRequest): AnthropicRequest {
  const systemParts: string[] = [];
  const messages: AnthropicMessage[] = [];

  for (const msg of req.messages ?? []) {
    if (msg.role === "system") {
      const text = coerceContentToString(msg.content);
      if (text) systemParts.push(text);
      continue;
    }
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({
        role: msg.role,
        content: coerceContentForAnthropic(msg.content),
      });
      continue;
    }
    if (msg.role === "tool") {
      // OpenAI tool result → Anthropic user message with tool_result block
      const toolUseId = (msg as Record<string, unknown>).tool_call_id as string | undefined;
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId ?? "unknown",
            content: coerceContentToString(msg.content),
          },
        ],
      });
      continue;
    }
    // Unknown role — skip silently rather than fail the call
  }

  const out: AnthropicRequest = {
    model: req.model,
    messages,
    max_tokens: typeof req.max_tokens === "number" && req.max_tokens > 0 ? req.max_tokens : 4096,
  };

  if (systemParts.length > 0) out.system = systemParts.join("\n\n");
  if (typeof req.temperature === "number") out.temperature = req.temperature;
  if (typeof req.top_p === "number") out.top_p = req.top_p;
  if (typeof req.stream === "boolean") out.stream = req.stream;

  if (req.stop !== undefined) {
    out.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  }

  // Translate OpenAI function-calling tools → Anthropic tools
  const tools = (req as Record<string, unknown>).tools;
  if (Array.isArray(tools) && tools.length > 0) {
    out.tools = tools.map((t) => {
      const tool = t as Record<string, unknown>;
      // OpenAI: { type: "function", function: { name, description, parameters } }
      if (tool.type === "function" && tool.function && typeof tool.function === "object") {
        const fn = tool.function as Record<string, unknown>;
        return {
          name: fn.name,
          description: fn.description,
          input_schema: fn.parameters ?? { type: "object", properties: {} },
        };
      }
      // Already Anthropic shape — pass through
      return tool;
    });
  }

  return out;
}

function coerceContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const part = p as Record<string, unknown>;
          if (typeof part.text === "string") return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function coerceContentForAnthropic(content: unknown): string | Array<Record<string, unknown>> {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return coerceContentToString(content);

  const blocks: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (typeof part === "string") {
      blocks.push({ type: "text", text: part });
      continue;
    }
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      // OpenAI text part
      if (p.type === "text" && typeof p.text === "string") {
        blocks.push({ type: "text", text: p.text });
        continue;
      }
      // OpenAI image_url part → Anthropic image block (URL form)
      if (p.type === "image_url") {
        const url = (p.image_url as Record<string, unknown> | undefined)?.url as string | undefined;
        if (typeof url === "string") {
          // Anthropic supports "url" source for newer models; fall back gracefully
          blocks.push({
            type: "image",
            source: url.startsWith("data:")
              ? parseDataUrlToAnthropicSource(url)
              : { type: "url", url },
          });
        }
        continue;
      }
      // Already Anthropic-shape block — pass through
      if (typeof p.type === "string") {
        blocks.push(p);
      }
    }
  }
  // If everything collapsed to a single text block, downgrade to plain string
  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text as string;
  }
  return blocks;
}

function parseDataUrlToAnthropicSource(dataUrl: string): Record<string, unknown> {
  // data:image/png;base64,XXXX
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { type: "url", url: dataUrl };
  return {
    type: "base64",
    media_type: match[1],
    data: match[2],
  };
}

// ── RESPONSE (non-stream): Anthropic → OpenAI ────────────────────────

/**
 * Translate Anthropic non-stream response → OpenAI chat.completion shape.
 *
 * Anthropic shape:
 *   {
 *     id, type:"message", role:"assistant",
 *     content: [{type:"text", text:"..."}, ...],
 *     model, stop_reason, usage:{ input_tokens, output_tokens }
 *   }
 *
 * OpenAI target shape:
 *   {
 *     id, object:"chat.completion", created, model,
 *     choices:[{ index:0, message:{ role:"assistant", content:"..." }, finish_reason }],
 *     usage:{ prompt_tokens, completion_tokens, total_tokens }
 *   }
 */
export function anthropicToOpenaiResponse(anthropic: Record<string, unknown>): Record<string, unknown> {
  const contentArr = Array.isArray(anthropic.content) ? (anthropic.content as Array<Record<string, unknown>>) : [];

  // Collect text parts
  let text = "";
  const toolCalls: Array<Record<string, unknown>> = [];
  for (const block of contentArr) {
    if (block.type === "text" && typeof block.text === "string") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function",
        function: {
          name: block.name,
          arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? {}),
        },
      });
    }
  }

  const message: Record<string, unknown> = {
    role: "assistant",
    content: text || null,
  };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  const usage = anthropic.usage as Record<string, unknown> | undefined;
  const usageOut: Record<string, unknown> | undefined = usage
    ? {
        prompt_tokens: numOrZero(usage.input_tokens),
        completion_tokens: numOrZero(usage.output_tokens),
        total_tokens: numOrZero(usage.input_tokens) + numOrZero(usage.output_tokens),
      }
    : undefined;
  if (usageOut && usage?.cache_read_input_tokens !== undefined) {
    usageOut.cached_tokens = numOrZero(usage.cache_read_input_tokens);
  }

  return {
    id: anthropic.id ?? `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: anthropic.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: mapStopReason(anthropic.stop_reason),
      },
    ],
    ...(usageOut ? { usage: usageOut } : {}),
  };
}

function mapStopReason(reason: unknown): string {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    default:
      return "stop";
  }
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── RESPONSE (streaming): Anthropic SSE → OpenAI SSE ─────────────────

/**
 * Translate an Anthropic SSE stream into an OpenAI-compatible SSE stream.
 *
 * Anthropic streaming events (`event: <name>` + `data: <json>` lines):
 *   message_start          → { message: { id, model, usage } }
 *   content_block_start    → { index, content_block: {type, text|name|input} }
 *   content_block_delta    → { index, delta: {type:"text_delta", text} }
 *                           or {type:"input_json_delta", partial_json}
 *   content_block_stop     → { index }
 *   message_delta          → { delta: {stop_reason}, usage: {output_tokens} }
 *   message_stop           → {}
 *
 * We emit the equivalent OpenAI chunks:
 *   first chunk:  { choices:[{delta:{role:"assistant"}}] }
 *   per text:     { choices:[{delta:{content:"..."}}] }
 *   per tool:     { choices:[{delta:{tool_calls:[{index, id, function:{name|arguments}}]}}] }
 *   final:        { choices:[{delta:{}, finish_reason:"stop"}] }
 *   usage chunk:  { choices:[], usage:{...} }
 *   then `data: [DONE]\n\n`
 */
export function translateAnthropicStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.getReader();

  let messageId = `chatcmpl-${Date.now()}`;
  let model = "";
  let buffer = "";
  let roleEmitted = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason: string | null = null;
  // Track partial tool_use blocks: anthropicIndex → { openaiIndex, id, name }
  const toolBlocks = new Map<number, { openaiIndex: number; id: string; name: string }>();
  let nextToolOpenaiIndex = 0;

  function emit(controller: ReadableStreamDefaultController<Uint8Array>, payload: Record<string, unknown>) {
    const wrapped = {
      id: messageId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      ...payload,
    };
    controller.enqueue(encoder.encode("data: " + JSON.stringify(wrapped) + "\n\n"));
  }

  function emitRoleIfNeeded(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (roleEmitted) return;
    roleEmitted = true;
    emit(controller, {
      choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
    });
  }

  function handleEvent(eventName: string, dataJson: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataJson);
    } catch {
      return;
    }

    if (eventName === "message_start") {
      const message = data.message as Record<string, unknown> | undefined;
      if (message) {
        if (typeof message.id === "string") messageId = message.id;
        if (typeof message.model === "string") model = message.model;
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage.input_tokens === "number") inputTokens = usage.input_tokens;
      }
      emitRoleIfNeeded(controller);
      return;
    }

    if (eventName === "content_block_start") {
      const block = data.content_block as Record<string, unknown> | undefined;
      const idx = numOrZero(data.index);
      if (block?.type === "tool_use") {
        const openaiIndex = nextToolOpenaiIndex++;
        const id = (block.id as string) ?? `call_${Math.random().toString(36).slice(2, 10)}`;
        const name = (block.name as string) ?? "";
        toolBlocks.set(idx, { openaiIndex, id, name });
        emitRoleIfNeeded(controller);
        emit(controller, {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: openaiIndex, id, type: "function", function: { name, arguments: "" } },
                ],
              },
              finish_reason: null,
            },
          ],
        });
      }
      return;
    }

    if (eventName === "content_block_delta") {
      const delta = data.delta as Record<string, unknown> | undefined;
      const idx = numOrZero(data.index);
      if (!delta) return;

      if (delta.type === "text_delta" && typeof delta.text === "string") {
        emitRoleIfNeeded(controller);
        emit(controller, {
          choices: [{ index: 0, delta: { content: delta.text }, finish_reason: null }],
        });
        return;
      }

      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const tool = toolBlocks.get(idx);
        if (tool) {
          emit(controller, {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: tool.openaiIndex,
                      function: { arguments: delta.partial_json },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          });
        }
        return;
      }
    }

    if (eventName === "message_delta") {
      const delta = data.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.stop_reason === "string") {
        finishReason = mapStopReason(delta.stop_reason);
      }
      const usage = data.usage as Record<string, unknown> | undefined;
      if (usage && typeof usage.output_tokens === "number") outputTokens = usage.output_tokens;
      return;
    }

    if (eventName === "message_stop") {
      // Final chunk with finish_reason
      emit(controller, {
        choices: [{ index: 0, delta: {}, finish_reason: finishReason ?? "stop" }],
      });
      // Usage chunk (mirror OpenAI's `stream_options: {include_usage: true}`)
      emit(controller, {
        choices: [],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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

          // SSE events are separated by blank lines (\n\n)
          let sepIdx;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);

            let eventName = "message";
            let dataJson = "";
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("event: ")) {
                eventName = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataJson += line.slice(6);
              }
            }
            if (dataJson) handleEvent(eventName, dataJson, controller);
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        try {
          reader.releaseLock();
        } catch { /* ignore */ }
      }
      controller.close();
    },
  });
}
