#!/bin/bash
# Script to start a second replica on port 8000

# Create a directory for the second replica if it doesn't exist
mkdir -p .dfx-replica2

# Start the replica with a custom port and data directory
dfx start --clean --host 127.0.0.1:8000 --data-path .dfx-replica2 --background

echo "Second replica started on port 8000"
echo "To deploy to this replica, use: dfx deploy --network=replica2"
echo "To stop this replica, use: dfx stop --data-path .dfx-replica2"
