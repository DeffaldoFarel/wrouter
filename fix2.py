import pathlib
p = pathlib.Path(r"E:\MyApps\WekanzRouter\wrouter\README.md")
content = p.read_text(encoding="utf-8")
lt = chr(60)
gt = chr(62)
token = lt + "wr-your-api-key" + gt
search = "Bearer " + lt + gt
replace_with = "Bearer " + token
content = content.replace(search, replace_with)
p.write_text(content, encoding="utf-8")
print("Fixed!")
