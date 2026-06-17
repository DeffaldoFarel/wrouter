export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateChatRequest(body: any): ValidationResult {
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
    if (body.messages.length > 200) {
      errors.push("messages must have max 200 items");
    }

    const validRoles = ["system", "user", "assistant", "tool"];
    body.messages.forEach((msg: any, idx: number) => {
      if (!msg.role) {
        errors.push(`messages[${idx}].role is required`);
      } else if (!validRoles.includes(msg.role)) {
        errors.push(`messages[${idx}].role must be one of: ${validRoles.join(", ")}`);
      }

      if (msg.content === undefined || msg.content === null) {
        errors.push(`messages[${idx}].content is required`);
      } else if (typeof msg.content !== "string") {
        errors.push(`messages[${idx}].content must be a string`);
      } else if (msg.content.length > 100000) {
        errors.push(`messages[${idx}].content must be max 100000 characters`);
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

export function validateProvider(body: any): ValidationResult {
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

  // Validate apiKey
  if (!body.apiKey) {
    errors.push("apiKey is required");
  } else if (typeof body.apiKey !== "string") {
    errors.push("apiKey must be a string");
  } else if (body.apiKey.length > 500) {
    errors.push("apiKey must be max 500 characters");
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

export function validateProviderUpdate(body: any): ValidationResult {
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

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
