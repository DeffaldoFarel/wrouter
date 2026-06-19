import { describe, it, expect } from 'vitest';
import {
  validateChatRequest,
  validateProvider,
  validateProviderUpdate,
} from '../validation';

// ── validateChatRequest ────────────────────────────────────────────
describe('validateChatRequest()', () => {
  const validRequest = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello' }],
  };

  it('accepts a valid minimal request', () => {
    const result = validateChatRequest(validRequest);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('accepts a request with all optional fields', () => {
    const result = validateChatRequest({
      ...validRequest,
      temperature: 0.7,
      max_tokens: 500,
      stream: true,
    });
    expect(result.valid).toBe(true);
  });

  // ── model ─────────────────────────────────────────────
  it('fails when model is missing', () => {
    const { model, ...body } = validRequest;
    const result = validateChatRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/model/i),
    ]));
  });

  it('fails when model is not a string', () => {
    const result = validateChatRequest({ ...validRequest, model: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /model.*string/i.test(e))).toBe(true);
  });

  it('fails when model exceeds 100 characters', () => {
    const result = validateChatRequest({ ...validRequest, model: 'x'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /model.*100/i.test(e))).toBe(true);
  });

  // ── messages ──────────────────────────────────────────
  it('fails when messages is missing', () => {
    const { messages, ...body } = validRequest;
    const result = validateChatRequest(body);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/messages/i),
    ]));
  });

  it('fails when messages is not an array', () => {
    const result = validateChatRequest({ ...validRequest, messages: 'hello' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /messages.*array/i.test(e))).toBe(true);
  });

  it('fails when messages array is empty', () => {
    const result = validateChatRequest({ ...validRequest, messages: [] });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /at least 1/i.test(e))).toBe(true);
  });

  it('fails when messages has more than 1000 items', () => {
    const msgs = Array.from({ length: 1001 }, () => ({ role: 'user', content: 'hi' }));
    const result = validateChatRequest({ ...validRequest, messages: msgs });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /max 1000/i.test(e))).toBe(true);
  });

  it('fails when a message has an invalid role', () => {
    const result = validateChatRequest({
      ...validRequest,
      messages: [{ role: 'hacker', content: 'hi' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /role.*system.*user.*assistant/i.test(e))).toBe(true);
  });

  it('fails when a message is missing content', () => {
    const result = validateChatRequest({
      ...validRequest,
      messages: [{ role: 'user' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /content.*required/i.test(e))).toBe(true);
  });

  it('fails when content exceeds 100000 characters', () => {
    const result = validateChatRequest({
      ...validRequest,
      messages: [{ role: 'user', content: 'a'.repeat(100_001) }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /100000/i.test(e))).toBe(true);
  });

  // ── multimodal / vision content ────────────────────────
  it('accepts multimodal content with text and image_url', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'https://example.com/img.jpg' } },
        ],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts multimodal content with base64 image', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ...' } },
        ],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts image_url with detail option', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe' },
          { type: 'image_url', image_url: { url: 'https://example.com/img.jpg', detail: 'high' } },
        ],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts multiple images in one message', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Compare these' },
          { type: 'image_url', image_url: { url: 'https://example.com/a.jpg' } },
          { type: 'image_url', image_url: { url: 'https://example.com/b.jpg' } },
        ],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts Anthropic-style tool_result blocks in content array', () => {
    const result = validateChatRequest({
      model: 'claude-3',
      messages: [{
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_abc', content: 'result text' },
        ],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts unknown content part types (forward compatibility)', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'future_format', data: 'something' },
        ],
      }],
    });
    expect(result.valid).toBe(true);
  });

  it('fails when content array is empty', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /at least 1/i.test(e))).toBe(true);
  });

  it('fails when content array has more than 50 items', () => {
    const parts = Array.from({ length: 51 }, () => ({ type: 'text', text: 'hi' }));
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: parts }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /max 50/i.test(e))).toBe(true);
  });

  it('fails when image_url is missing url', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: {} },
        ],
      }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /image_url\.url.*string/i.test(e))).toBe(true);
  });

  it('fails when image_url detail is invalid', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'https://example.com/img.jpg', detail: 'ultra' } },
        ],
      }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /detail.*low.*high.*auto/i.test(e))).toBe(true);
  });

  it('fails when content part is missing type', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [{ text: 'no type field' }],
      }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /type.*required/i.test(e))).toBe(true);
  });

  it('fails when content is a number (not string or array)', () => {
    const result = validateChatRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 42 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /string or an array/i.test(e))).toBe(true);
  });

  // ── temperature ───────────────────────────────────────
  it('fails when temperature is negative', () => {
    const result = validateChatRequest({ ...validRequest, temperature: -0.1 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /temperature/i.test(e))).toBe(true);
  });

  it('fails when temperature exceeds 2', () => {
    const result = validateChatRequest({ ...validRequest, temperature: 2.1 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /temperature/i.test(e))).toBe(true);
  });

  it('fails when temperature is not a number', () => {
    const result = validateChatRequest({ ...validRequest, temperature: 'hot' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /temperature.*number/i.test(e))).toBe(true);
  });

  // ── max_tokens ────────────────────────────────────────
  it('fails when max_tokens is zero', () => {
    const result = validateChatRequest({ ...validRequest, max_tokens: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /max_tokens/i.test(e))).toBe(true);
  });

  it('fails when max_tokens exceeds 1000000', () => {
    const result = validateChatRequest({ ...validRequest, max_tokens: 1_000_001 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /max_tokens/i.test(e))).toBe(true);
  });

  it('fails when max_tokens is not a number', () => {
    const result = validateChatRequest({ ...validRequest, max_tokens: 'many' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /max_tokens.*number/i.test(e))).toBe(true);
  });

  // ── stream ────────────────────────────────────────────
  it('fails when stream is not a boolean', () => {
    const result = validateChatRequest({ ...validRequest, stream: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /stream.*boolean/i.test(e))).toBe(true);
  });

  it('accepts stream: false', () => {
    const result = validateChatRequest({ ...validRequest, stream: false });
    expect(result.valid).toBe(true);
  });
});

// ── validateProvider ───────────────────────────────────────────────
describe('validateProvider()', () => {
  const validProvider = {
    name: 'OpenAI',
    prefix: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-key',
  };

  it('accepts a valid provider', () => {
    const result = validateProvider(validProvider);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('fails when name is missing', () => {
    const { name, ...body } = validProvider;
    const result = validateProvider(body);
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /name.*required/i.test(e))).toBe(true);
  });

  it('fails when prefix is missing', () => {
    const { prefix, ...body } = validProvider;
    const result = validateProvider(body);
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /prefix.*required/i.test(e))).toBe(true);
  });

  it('fails when baseUrl is missing', () => {
    const { baseUrl, ...body } = validProvider;
    const result = validateProvider(body);
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /baseUrl.*required/i.test(e))).toBe(true);
  });

  it('fails when apiKey is missing', () => {
    const { apiKey, ...body } = validProvider;
    const result = validateProvider(body);
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /apiKey.*required/i.test(e))).toBe(true);
  });

  it('fails when prefix contains special characters', () => {
    const result = validateProvider({ ...validProvider, prefix: 'open_ai!' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /alphanumeric/i.test(e))).toBe(true);
  });

  it('fails when prefix contains spaces', () => {
    const result = validateProvider({ ...validProvider, prefix: 'open ai' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /alphanumeric/i.test(e))).toBe(true);
  });

  it('fails when baseUrl is not a valid URL', () => {
    const result = validateProvider({ ...validProvider, baseUrl: 'not-a-url' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /valid URL/i.test(e))).toBe(true);
  });

  it('fails when name exceeds 100 characters', () => {
    const result = validateProvider({ ...validProvider, name: 'x'.repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /name.*100/i.test(e))).toBe(true);
  });

  it('accepts a valid optional type "apikey"', () => {
    const result = validateProvider({ ...validProvider, type: 'apikey' });
    expect(result.valid).toBe(true);
  });

  it('fails for invalid type value', () => {
    const result = validateProvider({ ...validProvider, type: 'oauth' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /type/i.test(e))).toBe(true);
  });
});

// ── validateProviderUpdate ─────────────────────────────────────────
describe('validateProviderUpdate()', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = validateProviderUpdate({});
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('accepts a valid partial update', () => {
    const result = validateProviderUpdate({
      name: 'Updated Name',
      enabled: true,
    });
    expect(result.valid).toBe(true);
  });

  it('fails when name is invalid', () => {
    const result = validateProviderUpdate({ name: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /name.*string/i.test(e))).toBe(true);
  });

  it('fails when prefix has special characters', () => {
    const result = validateProviderUpdate({ prefix: 'bad_prefix!' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /alphanumeric/i.test(e))).toBe(true);
  });

  it('fails when baseUrl is invalid', () => {
    const result = validateProviderUpdate({ baseUrl: 'nope' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /valid URL/i.test(e))).toBe(true);
  });

  it('fails when apiKey is not a string', () => {
    const result = validateProviderUpdate({ apiKey: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /apiKey.*string/i.test(e))).toBe(true);
  });

  it('fails when enabled is not a boolean', () => {
    const result = validateProviderUpdate({ enabled: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /enabled.*boolean/i.test(e))).toBe(true);
  });

  it('fails when models is not an array', () => {
    const result = validateProviderUpdate({ models: 'gpt-4' });
    expect(result.valid).toBe(false);
    expect(result.errors!.some(e => /models.*array/i.test(e))).toBe(true);
  });

  it('accepts models as an array', () => {
    const result = validateProviderUpdate({ models: ['gpt-4', 'gpt-3.5-turbo'] });
    expect(result.valid).toBe(true);
  });
});
