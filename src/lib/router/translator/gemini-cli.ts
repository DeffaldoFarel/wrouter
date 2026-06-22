/**
 * Gemini CLI (Cloud Code Assist) SSE stream translator.
 * Converts Gemini-native SSE format to OpenAI-compatible SSE format.
 *
 * Gemini SSE format:
 *   data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"}}],"usageMetadata":{...}}
 *
 * OpenAI SSE format:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"..."}}]}
 */

/**
 * Transform a Gemini SSE ReadableStream into an OpenAI-compatible SSE ReadableStream.
 */
export function translateGeminiCliStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const chatId = `chatcmpl-${Date.now()}`;
  let chunkIndex = 0;

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush remaining buffer
            if (buffer.trim()) {
              const translated = processLine(buffer, chatId, chunkIndex++);
              if (translated) controller.enqueue(encoder.encode(translated));
            }
            // Send [DONE]
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const translated = processLine(line, chatId, chunkIndex);
            if (translated) {
              controller.enqueue(encoder.encode(translated));
              chunkIndex++;
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

function processLine(line: string, chatId: string, _index: number): string | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6).trim();
  if (!payload || payload === "[DONE]") return "data: [DONE]\n\n";

  try {
    const json = JSON.parse(payload);
    return translateChunk(json, chatId);
  } catch {
    // Can't parse — pass through as-is
    return null;
  }
}

function translateChunk(json: Record<string, unknown>, chatId: string): string {
  // Extract text from candidates
  const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
  let content = "";
  let finishReason: string | null = null;

  if (Array.isArray(candidates) && candidates.length > 0) {
    const candidate = candidates[0];
    const candidateContent = candidate?.content as Record<string, unknown> | undefined;
    const parts = candidateContent?.parts as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(parts)) {
      content = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
    }

    // Check finish reason
    const rawReason = candidate?.finishReason as string | undefined;
    if (rawReason === "STOP") finishReason = "stop";
    else if (rawReason === "MAX_TOKENS") finishReason = "length";
    else if (rawReason === "SAFETY") finishReason = "content_filter";
  }

  // Build OpenAI-compatible chunk
  const chunk: Record<string, unknown> = {
    id: chatId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    choices: [{
      index: 0,
      delta: content ? { content } : {},
      finish_reason: finishReason,
    }],
  };

  // Include usage metadata if present (final chunk)
  const usageMeta = json.usageMetadata as Record<string, unknown> | undefined;
  if (usageMeta) {
    chunk.usage = {
      prompt_tokens: Number(usageMeta.promptTokenCount ?? 0),
      completion_tokens: Number(usageMeta.candidatesTokenCount ?? 0),
      total_tokens: Number(usageMeta.totalTokenCount ?? 0),
    };
  }

  return `data: ${JSON.stringify(chunk)}\n\n`;
}
