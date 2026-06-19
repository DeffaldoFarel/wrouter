import { describe, it, expect } from "vitest";
import { responsesToChat, chatToResponses, translateChatStreamToResponses } from "../responses";

describe("responsesToChat()", () => {
  it("translates string input to single user message", () => {
    const result = responsesToChat({
      model: "gpt-4o",
      input: "Hello world",
    });
    expect(result.model).toBe("gpt-4o");
    expect(result.messages).toEqual([{ role: "user", content: "Hello world" }]);
  });

  it("translates array input to messages", () => {
    const result = responsesToChat({
      model: "gpt-4o",
      input: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "How are you?" },
      ],
    });
    expect(result.messages).toEqual([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "How are you?" },
    ]);
  });

  it("maps max_output_tokens to max_tokens", () => {
    const result = responsesToChat({
      model: "gpt-4o",
      input: "test",
      max_output_tokens: 100,
    });
    expect(result.max_tokens).toBe(100);
  });

  it("passes through temperature, top_p, stop, stream", () => {
    const result = responsesToChat({
      model: "gpt-4o",
      input: "test",
      temperature: 0.5,
      top_p: 0.9,
      stop: ["\n"],
      stream: true,
    });
    expect(result.temperature).toBe(0.5);
    expect(result.top_p).toBe(0.9);
    expect(result.stop).toEqual(["\n"]);
    expect(result.stream).toBe(true);
  });

  it("passes through tools", () => {
    const tools = [{ type: "function", function: { name: "get_weather", description: "Get weather" } }];
    const result = responsesToChat({
      model: "gpt-4o",
      input: "test",
      tools,
    });
    expect((result as Record<string, unknown>).tools).toEqual(tools);
  });

  it("ignores null max_output_tokens", () => {
    const result = responsesToChat({
      model: "gpt-4o",
      input: "test",
      max_output_tokens: null,
    });
    expect(result.max_tokens).toBeUndefined();
  });
});

describe("chatToResponses()", () => {
  it("translates simple text response", () => {
    const result = chatToResponses({
      id: "chatcmpl-abc123",
      object: "chat.completion",
      created: 1234567890,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Paris is the capital." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    expect(result.id).toBe("resp_abc123");
    expect(result.object).toBe("response");
    expect(result.status).toBe("completed");
    expect(result.model).toBe("gpt-4o");
    expect(result.output).toEqual([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Paris is the capital." }],
      },
    ]);
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    });
  });

  it("translates tool_call response", () => {
    const result = chatToResponses({
      id: "chatcmpl-def456",
      object: "chat.completion",
      created: 1234567890,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_xyz",
                type: "function",
                function: { name: "get_weather", arguments: '{"city":"Paris"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    expect(result.id).toBe("resp_def456");
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toEqual({
      type: "function_call",
      id: "call_xyz",
      name: "get_weather",
      arguments: '{"city":"Paris"}',
      call_id: "call_xyz",
    });
  });

  it("handles empty text + tool_calls", () => {
    const result = chatToResponses({
      id: "resp_already",
      object: "chat.completion",
      created: 1234567890,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "fn", arguments: "{}" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    // Empty content should not create a message output item
    expect(result.output).toHaveLength(1);
    expect(result.output[0].type).toBe("function_call");
  });

  it("preserves resp_ prefix if already present", () => {
    const result = chatToResponses({
      id: "resp_custom123",
      object: "chat.completion",
      created: 1234567890,
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hi" },
          finish_reason: "stop",
        },
      ],
    });
    expect(result.id).toBe("resp_custom123");
  });
});

describe("translateChatStreamToResponses()", () => {
  function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      },
    });
  }

  async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }
    return result;
  }

  it("translates streaming chat response to responses format", async () => {
    const chatStream = createSSEStream([
      'data: {"id":"chatcmpl-test123","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-test123","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Par"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-test123","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"is"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-test123","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"id":"chatcmpl-test123","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const responsesStream = translateChatStreamToResponses(chatStream);
    const output = await readStream(responsesStream);

    // Should contain response.created
    expect(output).toContain('"type":"response.created"');
    // Should contain output_item.added
    expect(output).toContain('"type":"response.output_item.added"');
    // Should contain content_part.added
    expect(output).toContain('"type":"response.content_part.added"');
    // Should contain text deltas
    expect(output).toContain('"type":"response.output_text.delta"');
    expect(output).toContain('"delta":"Par"');
    expect(output).toContain('"delta":"is"');
    // Should contain output_item.done
    expect(output).toContain('"type":"response.output_item.done"');
    // Should contain response.completed
    expect(output).toContain('"type":"response.completed"');
    expect(output).toContain('"status":"completed"');
  });

  it("handles response.completed with usage data", async () => {
    const chatStream = createSSEStream([
      'data: {"id":"chatcmpl-u1","object":"chat.completion.chunk","created":5678,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-u1","object":"chat.completion.chunk","created":5678,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-u1","object":"chat.completion.chunk","created":5678,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"id":"chatcmpl-u1","object":"chat.completion.chunk","created":5678,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const responsesStream = translateChatStreamToResponses(chatStream);
    const output = await readStream(responsesStream);

    // Verify response.completed event is present and contains usage info
    expect(output).toContain('"type":"response.completed"');
    expect(output).toContain('"input_tokens":5');
    expect(output).toContain('"output_tokens":1');
    expect(output).toContain('"total_tokens":6');
  });
});
