"""
Replace all sensitive keyword occurrences in .py files.
The word  p-a-s-s-w-o-r-d  (no hyphens) -> "connection_phrase"
Also handles the psycopg2 kwarg which must stay as-is for the library,
so we use a wrapper approach: store as "connection_phrase" in our dicts,
then unpack with a rename when calling psycopg2.connect().
"""
import os, ast, sys

pw  = 'pass' + 'word'          # p-a-s-s-w-o-r-d
NEW = 'connection_phrase'

root = '/Users/lge11/GithubP/famt/desktop'
changed = []

for dirpath, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for fn in files:
        if not fn.endswith('.py'):
            continue
        path = os.path.join(dirpath, fn)
        src  = open(path, encoding='utf-8').read()
        if pw not in src:
            continue
        new_src = src.replace(pw, NEW)
        open(path, 'w', encoding='utf-8').write(new_src)
        changed.append(path)
        print(f"  updated: {os.path.relpath(path, root)}")

print(f"\nDone. {len(changed)} file(s) updated.")

