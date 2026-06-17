/**
 * RTK Token Saver - compresses tool_result content in messages
 * Inspired by https://github.com/rtk-ai/rtk
 */

interface Message {
  role: string;
  content: string | Array<{ type: string; text?: string; tool_use_id?: string; content?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Compress tool_result content to save tokens
 * Targets repetitive CLI output (git diff, ls, find, grep, tree, etc.)
 */
export function compressToolResults(messages: Message[]): Message[] {
  return messages.map((msg) => {
    // Only process tool_result messages
    if (msg.role !== "user") return msg;

    // Handle content array format (Anthropic style)
    if (Array.isArray(msg.content)) {
      const compressedContent = msg.content.map((block) => {
        if (block.type === "tool_result" && typeof block.content === "string") {
          return {
            ...block,
            content: compressContent(block.content),
          };
        }
        return block;
      });

      return { ...msg, content: compressedContent };
    }

    return msg;
  });
}

function compressContent(content: string): string {
  let compressed = content;

  // Git diff compression
  compressed = compressGitDiff(compressed);

  // File listing compression
  compressed = compressFileList(compressed);

  // Grep output compression
  compressed = compressGrepOutput(compressed);

  // Generic whitespace reduction
  compressed = compressWhitespace(compressed);

  return compressed;
}

function compressGitDiff(content: string): string {
  // Detect git diff output
  if (!content.includes("diff --git") && !content.includes("@@")) {
    return content;
  }

  // Remove unchanged context lines (keep only +/- lines)
  const lines = content.split("\n");
  const compressed: string[] = [];
  let inDiff = false;

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
      compressed.push(line);
      inDiff = true;
    } else if (inDiff && (line.startsWith("+") || line.startsWith("-"))) {
      compressed.push(line);
    } else if (line.trim() === "") {
      compressed.push(line);
    }
    // Skip unchanged lines (no prefix in diff)
  }

  return compressed.length > 0 ? compressed.join("\n") : content;
}

function compressFileList(content: string): string {
  // Detect file listing (ls, find, tree output)
  const lines = content.split("\n");
  if (lines.length < 10) return content;

  // Check if looks like file list (paths, extensions)
  const looksLikeFileList = lines.filter((l) => 
    l.includes("/") || l.match(/\.(ts|js|json|md|txt|py|go|rs|java)$/i)
  ).length > lines.length * 0.5;

  if (!looksLikeFileList) return content;

  // Group by directory, show count
  const dirs = new Map<string, number>();
  for (const line of lines) {
    const match = line.match(/^(.+\/)[^/]+$/);
    if (match) {
      const dir = match[1];
      dirs.set(dir, (dirs.get(dir) || 0) + 1);
    }
  }

  // If too many files in same dir, summarize
  if (dirs.size > 0) {
    const summarized: string[] = [];
    for (const [dir, count] of dirs) {
      if (count > 5) {
        summarized.push(`${dir} (${count} files)`);
      } else {
        summarized.push(...lines.filter((l) => l.startsWith(dir)));
      }
    }
    if (summarized.length < lines.length * 0.7) {
      return summarized.join("\n");
    }
  }

  return content;
}

function compressGrepOutput(content: string): string {
  // Detect grep output (filename:line_number:content)
  const lines = content.split("\n");
  if (lines.length < 5) return content;

  const looksLikeGrep = lines.filter((l) => l.match(/^[^:]+:\d+:/)).length > lines.length * 0.5;
  if (!looksLikeGrep) return content;

  // Group by file
  const fileMatches = new Map<string, number>();
  for (const line of lines) {
    const match = line.match(/^([^:]+):\d+:/);
    if (match) {
      const file = match[1];
      fileMatches.set(file, (fileMatches.get(file) || 0) + 1);
    }
  }

  // If many matches per file, summarize
  const summarized: string[] = [];
  for (const [file, count] of fileMatches) {
    if (count > 10) {
      summarized.push(`${file}: ${count} matches`);
      const samples = lines.filter((l) => l.startsWith(file + ":")).slice(0, 3);
      summarized.push(...samples, "...");
    } else {
      summarized.push(...lines.filter((l) => l.startsWith(file + ":")));
    }
  }

  return summarized.length < lines.length * 0.8 ? summarized.join("\n") : content;
}

function compressWhitespace(content: string): string {
  // Remove excessive blank lines (keep max 1 consecutive blank line)
  return content.replace(/\n{3,}/g, "\n\n");
}
