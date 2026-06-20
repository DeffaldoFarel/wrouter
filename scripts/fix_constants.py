import os
import sys

path = os.path.join("E:", os.sep, "MyApps", "WekanzRouter", "wrouter", "src", "lib", "oauth", "constants.ts")
print("Reading:", path)

if not os.path.exists(path):
    print("File not found:", path)
    sys.exit(1)

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

timeout_val = 300 * 1000
buffer_val = 60 * 1000

fixed = 0
for i, line in enumerate(lines):
    stripped = line.strip()
    if "OAUTH_TIMEOUT" in stripped and "***" in stripped:
        lines[i] = "export const OAUTH_TIMEOUT=*** + str(timeout_val) + ";\n"
        fixed += 1
        print("Fixed line", i+1, ": OAUTH_TIMEOUT")
    elif "TOKEN_EXPIRY_BUFFER_MS" in stripped and "***" in stripped:
        lines[i] = "export const TOKEN_EXPIRY_BUFFER_MS=*** + str(buffer_val) + ";\n"
        fixed += 1
        print("Fixed line", i+1, ": TOKEN_EXPIRY_BUFFER_MS")

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Done! Fixed", fixed, "lines.")
