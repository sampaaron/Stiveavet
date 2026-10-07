#!/bin/sh
# Lance le build `standalone` comme dans l'image Docker (utilisé par les tests de bout en bout).
set -eu
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
exec node .next/standalone/server.js
