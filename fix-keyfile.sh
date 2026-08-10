#!/bin/bash
# This script fixes the keyfile permissions inside the container
# It should be run before MongoDB starts

KEYFILE_PATH="/data/keyfile/mongodb-keyfile"

if [ -f "$KEYFILE_PATH" ]; then
    echo "Fixing keyfile permissions..."
    chown 999:999 "$KEYFILE_PATH"
    chmod 400 "$KEYFILE_PATH"
    ls -la "$KEYFILE_PATH"
else
    echo "ERROR: Keyfile not found at $KEYFILE_PATH"
    exit 1
fi
