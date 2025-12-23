#!/bin/bash
set -e

# Fix keyfile permissions
KEYFILE_PATH="/data/keyfile/mongodb-keyfile"

if [ ! -f "$KEYFILE_PATH" ]; then
    echo "ERROR: Keyfile not found at $KEYFILE_PATH"
    exit 1
fi

echo "Setting keyfile permissions..."
chown mongodb:mongodb "$KEYFILE_PATH"
chmod 400 "$KEYFILE_PATH"

# Check if this is first run (no data directory)
FIRST_RUN=false
if [ ! -f "/data/db/mongod.lock" ]; then
    echo "First run detected"
    FIRST_RUN=true
fi

# Start MongoDB
echo "Starting MongoDB..."
if [ "$FIRST_RUN" = true ]; then
    # First run: start without auth to initialize
    echo "Starting MongoDB without keyfile for initial setup..."
    mongod --bind_ip_all --replSet rs0 --fork --logpath /var/log/mongodb.log

    # Wait for MongoDB to start
    sleep 5

    # Initialize replica set
    echo "Initializing replica set..."
    mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"

    # Wait for replica set to be ready
    sleep 5

    # Create admin user
    echo "Creating admin user..."
    mongosh admin --eval "
        db.createUser({
            user: '${MONGO_INITDB_ROOT_USERNAME}',
            pwd: '${MONGO_INITDB_ROOT_PASSWORD}',
            roles: ['root']
        })
    "

    # Shutdown MongoDB
    echo "Shutting down temporary MongoDB..."
    mongosh admin -u "${MONGO_INITDB_ROOT_USERNAME}" -p "${MONGO_INITDB_ROOT_PASSWORD}" --eval "db.shutdownServer()" || true
    sleep 3
fi

# Start MongoDB with keyfile authentication
echo "Starting MongoDB with keyfile authentication..."
exec mongod \
    --bind_ip_all \
    --replSet rs0 \
    --oplogSize 128 \
    --keyFile "$KEYFILE_PATH" \
    --clusterAuthMode keyFile
