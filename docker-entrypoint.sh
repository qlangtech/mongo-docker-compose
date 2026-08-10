#!/bin/bash
set -e

# Generate or fix keyfile
KEYFILE_PATH="/data/keyfile/mongodb-keyfile"

echo "Checking keyfile at $KEYFILE_PATH..."
ls -la /data/keyfile/ || echo "Failed to list /data/keyfile/"

if [ ! -f "$KEYFILE_PATH" ] || [ ! -s "$KEYFILE_PATH" ]; then
    echo "Generating new keyfile..."
    openssl rand -base64 756 > "$KEYFILE_PATH"
fi

echo "Setting keyfile permissions..."
chown mongodb:mongodb "$KEYFILE_PATH"
chmod 400 "$KEYFILE_PATH"

echo "Keyfile after permissions:"
ls -la "$KEYFILE_PATH"

# Execute the original MongoDB entrypoint
exec docker-entrypoint.sh "$@"
