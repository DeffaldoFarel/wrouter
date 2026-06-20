"""Fix constants.ts numeric values that were corrupted by redaction filter."""
import os

path = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "oauth", "constants.ts")
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "OAUTH_TIMEOUT=" in line and "***" in line:
        lines[i] = "export const OAUTH_TIMEOUT = 300 * 1000;\n"
    elif "TOKEN_EXPIRY_BUFFER_MS=" in line and "***" in line:
        lines[i] = "export const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;\n"

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Fixed constants.ts!")
