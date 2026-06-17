/**
 * Caveman Mode - ultra-compressed communication
 * Inspired by https://github.com/JuliusBrussee/caveman
 */

const CAVEMAN_SYSTEM_PROMPT = `Respond terse like smart caveman. All technical substance stay. Only fluff die.

ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.

## Rules

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not implement). No tool-call narration, no decorative tables/emoji.

## Examples

Instead: "Sure, I can help you with that. Let me create a new component file for you."
Say: "Create component file."

Instead: "The issue is that the database connection is not being properly closed after each request."
Say: "DB connection not closed after request."

Instead: "I've successfully implemented the authentication middleware. It now checks for valid JWT tokens."
Say: "Auth middleware done. Check JWT tokens."

## Boundaries

Code/commits: write normal. Security warnings: write clear. Destructive ops: write clear. Resume caveman after.`;

interface Message {
  role: string;
  content: string | unknown;
  [key: string]: unknown;
}

/**
 * Inject caveman system prompt into messages
 */
export function injectCavemanPrompt(messages: Message[]): Message[] {
  // Check if system prompt already exists
  const hasSystemPrompt = messages.some((m) => m.role === "system");

  if (hasSystemPrompt) {
    // Append to existing system prompt
    return messages.map((msg) => {
      if (msg.role === "system" && typeof msg.content === "string") {
        return {
          ...msg,
          content: msg.content + "\n\n" + CAVEMAN_SYSTEM_PROMPT,
        };
      }
      return msg;
    });
  } else {
    // Add new system prompt at the beginning
    return [
      {
        role: "system",
        content: CAVEMAN_SYSTEM_PROMPT,
      },
      ...messages,
    ];
  }
}
