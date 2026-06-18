/**
 * Changelog Parser
 * Parses CHANGELOG.md (Keep a Changelog format) into structured data
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { Release, ChangeType } from "./changelog";

const CHANGELOG_PATH = join(process.cwd(), "CHANGELOG.md");

/**
 * Parse a single change line from markdown
 * Format: "- **Title** — Description" or "- Description only"
 */
function parseChangeLine(line: string, type: ChangeType): { title: string; description: string; type: ChangeType } {
  // Remove leading "- " and trim
  const content = line.replace(/^-\s+/, "").trim();

  // Check for bold title format: "**Title** — Description"
  const boldMatch = content.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
  if (boldMatch) {
    return {
      title: boldMatch[1].trim(),
      description: boldMatch[2].trim(),
      type,
    };
  }

  // No bold title, use entire line as description
  return {
    title: type.charAt(0).toUpperCase() + type.slice(1),
    description: content,
    type,
  };
}

/**
 * Parse CHANGELOG.md into structured Release array
 */
export function parseChangelog(): Release[] {
  let content: string;
  try {
    content = readFileSync(CHANGELOG_PATH, "utf-8");
  } catch (error) {
    console.error("Failed to read CHANGELOG.md:", error);
    return [];
  }

  const releases: Release[] = [];
  const lines = content.split("\n");

  let currentVersion: string | null = null;
  let currentDate: string | null = null;
  let currentType: ChangeType | null = null;
  let currentChanges: Array<{ title: string; description: string; type: ChangeType }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match version header: ## [1.2.0] - 2026-06-18
    const versionMatch = line.match(/^##\s+\[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (versionMatch) {
      // Save previous release
      if (currentVersion && currentDate && currentChanges.length > 0) {
        releases.push({
          version: currentVersion,
          date: currentDate,
          changes: currentChanges,
        });
      }

      currentVersion = versionMatch[1];
      currentDate = versionMatch[2];
      currentChanges = [];
      currentType = null;
      continue;
    }

    // Match section headers: ### ✨ Added, ### 🔧 Changed, ### 🐛 Fixed
    if (line.startsWith("### ")) {
      if (line.includes("Added") || line.includes("✨")) {
        currentType = "added";
      } else if (line.includes("Changed") || line.includes("🔧")) {
        currentType = "changed";
      } else if (line.includes("Fixed") || line.includes("🐛")) {
        currentType = "fixed";
      } else if (line.includes("Initial Release")) {
        currentType = "added";
      }
      continue;
    }

    // Match change items: "- **Title** — Description" or "- Description"
    if (line.startsWith("- ") && currentType) {
      const change = parseChangeLine(line, currentType);
      currentChanges.push(change);
    }
  }

  // Save last release
  if (currentVersion && currentDate && currentChanges.length > 0) {
    releases.push({
      version: currentVersion,
      date: currentDate,
      changes: currentChanges,
    });
  }

  return releases;
}
