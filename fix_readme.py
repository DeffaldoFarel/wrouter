import pathlib

p = pathlib.Path(r"E:\MyApps\WekanzRouter\wrouter\README.md")
content = p.read_text(encoding="utf-8")

# Build angle brackets using chr to avoid tool stripping
lt = chr(60)
gt = chr(62)
token = lt + "wr-your-api-key" + gt

# Fix bearer tokens in curl examples
content = content.replace(
    '"Authorization: Bearer *** \\',
    '"Authorization: Bearer ' + token + '" \\'
)

content = content.replace(
    '"Authorization: Bearer ***wr-...ere"',
    '"Authorization: Bearer ' + token + '"'
)

# Fix auth code block
content = content.replace(
    'Authorization: Bearer *** ```',
    'Authorization: Bearer ' + token
)

p.write_text(content, encoding="utf-8")
print("Done! Fixed bearer tokens.")
