/**
 * WRouter Changelog Types
 * Type definitions for parsed changelog data.
 * Actual data is parsed from CHANGELOG.md via changelog-parser.ts
 */

export type ChangeType = "added" | "changed" | "fixed";

export interface Change {
  type: ChangeType;
  title: string;
  description: string;
}

export interface Release {
  version: string;
  date: string;
  changes: Change[];
}

