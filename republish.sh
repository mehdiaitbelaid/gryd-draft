#!/bin/bash
# Re-copy the traced file set from gryd-homepage, then push. Run from anywhere.
set -e
SRC=~/Desktop/Gryd/gryd-homepage
DST=~/Desktop/Gryd/gryd-draft-deploy
cd "$DST"
git ls-files | grep -v -E '^(index\.html|republish\.sh|\.gitignore|home-final/_serve\.py)$' | while read -r f; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/$f"
done
git add -A
git diff --cached --quiet && { echo "nothing changed"; exit 0; }
git -c user.name=mehdiaitbelaid -c user.email=maroc1221maroc@gmail.com commit -q -m "Update draft site from gryd-homepage"
git push -q origin main
echo "pushed. live in ~1 min: https://mehdiaitbelaid.github.io/gryd-draft/"
