export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ContentPart {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
  [key: string]: unknown;
}

export interface Message {
  role: string;
  content: string | ContentPart[];
  [key: string]: unknown;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export interface ProviderRequest {
  name: string;
  prefix: string;
  baseUrl: string;
  apiKey?: string;
  type?: 'custom' | 'apikey';
  [key: string]: unknown;
}

export interface ProviderUpdateRequest {
  name?: string;
  prefix?: string;
  baseUrl?: string;
  apiKey?: string;
  type?: 'custom' | 'apikey';
  enabled?: boolean;
  models?: unknown[];
  [key: string]: unknown;
}

export function validateChatRequest(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Validate model
  if (!body.model) {
    errors.push("model is required");
  } else if (typeof body.model !== "string") {
    errors.push("model must be a string");
  } else if (body.model.length > 100) {
    errors.push("model must be max 100 characters");
  }

  // Validate messages
  if (!body.messages) {
    errors.push("messages is required");
  } else if (!Array.isArray(body.messages)) {
    errors.push("messages must be an array");
  } else {
    if (body.messages.length < 1) {
      errors.push("messages must have at least 1 item");
    }
    if (body.messages.length > 1000) {
      errors.push("messages must have max 1000 items");
    }

    const validRoles = ["system", "user", "assistant", "tool"];
    const messages = body.messages as Array<Record<string, unknown>>;
    messages.forEach((msg, idx: number) => {
      const role = msg.role as string | undefined;
      if (!role) {
        errors.push(`messages[${idx}].role is required`);
      } else if (!validRoles.includes(role)) {
        errors.push(`messages[${idx}].role must be one of: ${validRoles.join(", ")}`);
      }

      const content = msg.content;
      if (content === undefined || content === null) {
        errors.push(`messages[${idx}].content is required`);
      } else if (typeof content === "string") {
        if (content.length > 100000) {
          errors.push(`messages[${idx}].content must be max 100000 characters`);
        }
      } else if (Array.isArray(content)) {
        // Multimodal content (OpenAI vision format)
        if (content.length === 0) {
          errors.push(`messages[${idx}].content array must have at least 1 item`);
        } else if (content.length > 50) {
          errors.push(`messages[${idx}].content array must have max 50 items`);
        } else {
          const parts = content as Array<Record<string, unknown>>;
          parts.forEach((part, partIdx: number) => {
            if (!part || typeof part !== "object") {
              errors.push(`messages[${idx}].content[${partIdx}] must be an object`);
              return;
            }

            if (part.type === "text") {
              if (typeof part.text !== "string") {
                errors.push(`messages[${idx}].content[${partIdx}].text must be a string`);
              } else if (part.text.length > 100000) {
                errors.push(`messages[${idx}].content[${partIdx}].text must be max 100000 characters`);
              }
            } else if (part.type === "image_url") {
              const imageUrl = part.image_url as Record<string, unknown> | undefined;
              if (!imageUrl || typeof imageUrl !== "object") {
                errors.push(`messages[${idx}].content[${partIdx}].image_url must be an object`);
              } else if (typeof imageUrl.url !== "string") {
                errors.push(`messages[${idx}].content[${partIdx}].image_url.url must be a string`);
              } else if (imageUrl.url.length > 10_000_000) {
                // ~7.5MB base64 image — prevents abuse
                errors.push(`messages[${idx}].content[${partIdx}].image_url.url is too large (max ~7.5MB base64)`);
              }
              // detail is optional: "low" | "high" | "auto"
              if (imageUrl?.detail !== undefined) {
                const validDetails = ["low", "high", "auto"];
                if (!validDetails.includes(imageUrl.detail as string)) {
                  errors.push(`messages[${idx}].content[${partIdx}].image_url.detail must be one of: ${validDetails.join(", ")}`);
                }
              }
            } else if (part.type === "tool_result" || part.type === "tool_use") {
              // Anthropic-style tool blocks — pass through without strict validation
              // (RTK token saver handles these separately)
            } else if (!part.type) {
              errors.push(`messages[${idx}].content[${partIdx}].type is required`);
            } else {
              // Unknown content type — allow pass-through for forward compatibility
              // (providers may support custom content types)
            }
          });
        }
      } else {
        errors.push(`messages[${idx}].content must be a string or an array of content parts`);
      }
    });
  }

  // Validate temperature (optional)
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== "number") {
      errors.push("temperature must be a number");
    } else if (body.temperature < 0 || body.temperature > 2) {
      errors.push("temperature must be between 0 and 2");
    }
  }

  // Validate max_tokens (optional)
  if (body.max_tokens !== undefined) {
    if (typeof body.max_tokens !== "number") {
      errors.push("max_tokens must be a number");
    } else if (body.max_tokens < 1 || body.max_tokens > 1000000) {
      errors.push("max_tokens must be between 1 and 1000000");
    }
  }

  // Validate stream (optional)
  if (body.stream !== undefined) {
    if (typeof body.stream !== "boolean") {
      errors.push("stream must be a boolean");
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate API key creation/update body.
 */
export function validateApiKey(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // name (required)
  if (!body.name) {
    errors.push("name is required");
  } else if (typeof body.name !== "string") {
    errors.push("name must be a string");
  } else {
    const trimmed = body.name.trim();
    if (trimmed.length < 1) errors.push("name cannot be empty");
    if (trimmed.length > 64) errors.push("name must be max 64 characters");
    // Reject control characters (newlines, null bytes, etc.)
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(trimmed)) errors.push("name contains invalid control characters");
  }

  // allowedModels (optional)
  if (body.allowedModels !== undefined) {
    if (!Array.isArray(body.allowedModels)) {
      errors.push("allowedModels must be an array");
    } else {
      if (body.allowedModels.length > 200) {
        errors.push("allowedModels must have max 200 items");
      }
      const items = body.allowedModels as unknown[];
      items.forEach((m, i) => {
        if (typeof m !== "string") errors.push(`allowedModels[${i}] must be a string`);
        else if (m.length > 200) errors.push(`allowedModels[${i}] must be max 200 characters`);
      });
    }
  }

  // enabled (optional)
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Validate combo creation/update body.
 */
export function validateCombo(body: Record<string, unknown>, isUpdate = false): ValidationResult {
  const errors: string[] = [];

  // name
  if (!isUpdate || body.name !== undefined) {
    if (!body.name) {
      if (!isUpdate) errors.push("name is required");
    } else if (typeof body.name !== "string") {
      errors.push("name must be a string");
    } else if (body.name.length > 100) {
      errors.push("name must be max 100 characters");
    }
  }

  // slug
  if (!isUpdate || body.slug !== undefined) {
    if (!body.slug) {
      if (!isUpdate) errors.push("slug is required");
    } else if (typeof body.slug !== "string") {
      errors.push("slug must be a string");
    } else if (body.slug.length > 64) {
      errors.push("slug must be max 64 characters");
    } else if (!/^[a-zA-Z0-9-_]+$/.test(body.slug)) {
      errors.push("slug must contain only alphanumeric, hyphens, and underscores");
    }
  }

  // models
  if (!isUpdate || body.models !== undefined) {
    if (body.models === undefined && !isUpdate) {
      errors.push("models is required");
    } else if (body.models !== undefined) {
      if (!Array.isArray(body.models)) {
        errors.push("models must be an array");
      } else {
        if (body.models.length < 1 && !isUpdate) errors.push("models must have at least 1 item");
        if (body.models.length > 50) errors.push("models must have max 50 items");
        const items = body.models as unknown[];
        items.forEach((m, i) => {
          if (typeof m !== "string") errors.push(`models[${i}] must be a string`);
          else if (m.length > 200) errors.push(`models[${i}] must be max 200 characters`);
        });
      }
    }
  }

  // enabled (optional)
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Validate provider API key connection (multi-key system) body.
 */
export function validateProviderConnectionKey(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // apiKey (required)
  if (!body.apiKey) {
    errors.push("apiKey is required");
  } else if (typeof body.apiKey !== "string") {
    errors.push("apiKey must be a string");
  } else if (body.apiKey.length > 1000) {
    errors.push("apiKey must be max 1000 characters");
  } else if (body.apiKey.length < 8) {
    errors.push("apiKey must be at least 8 characters");
  }

  // name (optional)
  if (body.name !== undefined) {
    if (typeof body.name !== "string") errors.push("name must be a string");
    else if (body.name.length > 100) errors.push("name must be max 100 characters");
  }

  // priority (optional, integer 0-9999)
  if (body.priority !== undefined) {
    if (typeof body.priority !== "number" || !Number.isFinite(body.priority) || !Number.isInteger(body.priority)) {
      errors.push("priority must be an integer");
    } else if (body.priority < 0 || body.priority > 9999) {
      errors.push("priority must be between 0 and 9999");
    }
  }

  // maxErrors (optional, integer 1-100)
  if (body.maxErrors !== undefined) {
    if (typeof body.maxErrors !== "number" || !Number.isFinite(body.maxErrors) || !Number.isInteger(body.maxErrors)) {
      errors.push("maxErrors must be an integer");
    } else if (body.maxErrors < 1 || body.maxErrors > 100) {
      errors.push("maxErrors must be between 1 and 100");
    }
  }

  // rateLimit (optional, integer 1-1000000 or null)
  if (body.rateLimit !== undefined && body.rateLimit !== null) {
    if (typeof body.rateLimit !== "number" || !Number.isFinite(body.rateLimit) || !Number.isInteger(body.rateLimit)) {
      errors.push("rateLimit must be an integer or null");
    } else if (body.rateLimit < 1 || body.rateLimit > 1_000_000) {
      errors.push("rateLimit must be between 1 and 1000000");
    }
  }

  // rateLimitWindow (optional, integer 1-86400 seconds or null)
  if (body.rateLimitWindow !== undefined && body.rateLimitWindow !== null) {
    if (typeof body.rateLimitWindow !== "number" || !Number.isFinite(body.rateLimitWindow) || !Number.isInteger(body.rateLimitWindow)) {
      errors.push("rateLimitWindow must be an integer or null");
    } else if (body.rateLimitWindow < 1 || body.rateLimitWindow > 86400) {
      errors.push("rateLimitWindow must be between 1 and 86400 seconds");
    }
  }

  // isActive (optional)
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Validate OAuth token import/exchange body length-only.
 * Used to prevent DoS via huge token payloads.
 */
export function validateOAuthToken(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const MAX_TOKEN_LEN = 10000;

  for (const field of ["accessToken", "apiKey", "refreshToken", "code", "deviceCode", "codeVerifier"]) {
    const value = body[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== "string") {
        errors.push(`${field} must be a string`);
      } else if (value.length > MAX_TOKEN_LEN) {
        errors.push(`${field} exceeds max length (${MAX_TOKEN_LEN})`);
      }
    }
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string") errors.push("name must be a string");
    else if (body.name.length > 100) errors.push("name must be max 100 characters");
  }
  if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== "string") errors.push("email must be a string");
    else if (body.email.length > 200) errors.push("email must be max 200 characters");
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

export function validateProvider(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Validate name
  if (!body.name) {
    errors.push("name is required");
  } else if (typeof body.name !== "string") {
    errors.push("name must be a string");
  } else if (body.name.length > 100) {
    errors.push("name must be max 100 characters");
  }

  // Validate prefix
  if (!body.prefix) {
    errors.push("prefix is required");
  } else if (typeof body.prefix !== "string") {
    errors.push("prefix must be a string");
  } else if (body.prefix.length > 20) {
    errors.push("prefix must be max 20 characters");
  } else if (!/^[a-zA-Z0-9-]+$/.test(body.prefix)) {
    errors.push("prefix must contain only alphanumeric characters and hyphens");
  }

  // Validate baseUrl
  if (!body.baseUrl) {
    errors.push("baseUrl is required");
  } else if (typeof body.baseUrl !== "string") {
    errors.push("baseUrl must be a string");
  } else if (body.baseUrl.length > 500) {
    errors.push("baseUrl must be max 500 characters");
  } else {
    try {
      new URL(body.baseUrl);
    } catch {
      errors.push("baseUrl must be a valid URL");
    }
  }

  // Validate apiKey (optional — can be added later via provider detail)
  if (body.apiKey !== undefined && body.apiKey !== "") {
    if (typeof body.apiKey !== "string") {
      errors.push("apiKey must be a string");
    } else if (body.apiKey.length > 500) {
      errors.push("apiKey must be max 500 characters");
    }
  }

  // Validate type (optional)
  if (body.type !== undefined) {
    if (body.type !== "custom" && body.type !== "apikey") {
      errors.push("type must be 'custom' or 'apikey'");
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function validateProviderUpdate(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Only validate fields that are present — all are optional for updates
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      errors.push("name must be a string");
    } else if (body.name.length > 100) {
      errors.push("name must be max 100 characters");
    }
  }

  if (body.prefix !== undefined) {
    if (typeof body.prefix !== "string") {
      errors.push("prefix must be a string");
    } else if (body.prefix.length > 20) {
      errors.push("prefix must be max 20 characters");
    } else if (!/^[a-zA-Z0-9-]+$/.test(body.prefix)) {
      errors.push("prefix must contain only alphanumeric characters and hyphens");
    }
  }

  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string") {
      errors.push("baseUrl must be a string");
    } else if (body.baseUrl.length > 500) {
      errors.push("baseUrl must be max 500 characters");
    } else {
      try {
        new URL(body.baseUrl);
      } catch {
        errors.push("baseUrl must be a valid URL");
      }
    }
  }

  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string") {
      errors.push("apiKey must be a string");
    } else if (body.apiKey.length > 500) {
      errors.push("apiKey must be max 500 characters");
    }
  }

  if (body.type !== undefined) {
    if (body.type !== "custom" && body.type !== "apikey") {
      errors.push("type must be 'custom' or 'apikey'");
    }
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      errors.push("enabled must be a boolean");
    }
  }

  if (body.models !== undefined) {
    if (!Array.isArray(body.models)) {
      errors.push("models must be an array");
    }
  }

  if (body.connectionStrategy !== undefined) {
    if (typeof body.connectionStrategy !== "string") {
      errors.push("connectionStrategy must be a string");
    } else if (!["priority", "round-robin", "random"].includes(body.connectionStrategy)) {
      errors.push("connectionStrategy must be 'priority', 'round-robin', or 'random'");
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
