#!/usr/bin/env bash
# scripts/use-dev-rules.sh — copy dev rules into place for local emulator testing
set -e
SRC="firestore.rules.dev"
DST="firestore.rules"
if [ ! -f "$SRC" ]; then
  echo "Dev rules file $SRC not found"
  exit 1
fi
cp "$SRC" "$DST"
echo "Copied $SRC -> $DST (use this only for local emulator testing)"

