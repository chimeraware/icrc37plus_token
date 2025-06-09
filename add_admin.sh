#!/bin/bash

# Script to add an admin to the ICRC-37+ token canister
PRINCIPAL="hcznd-qoob5-4cm6f-qqoei-x75vk-24r2g-ul4li-gydmn-av34m-mk35v-fae"
ADMIN_TYPE='(variant {System})'  # Using System admin type for full permissions

# Get canister ID from dfx.json or environment
CANISTER_ID=$(dfx canister id icrc37plus_token_backend 2>/dev/null)

if [ -z "$CANISTER_ID" ]; then
  echo "Error: Could not determine canister ID. Make sure you're in the project directory and the canister is deployed."
  exit 1
fi

echo "Adding principal $PRINCIPAL as admin to canister $CANISTER_ID..."

# Call the add_admin function on the canister
dfx canister call "$CANISTER_ID" add_admin "(principal \"$PRINCIPAL\", $ADMIN_TYPE)"

echo "Done! Check the output above to confirm the operation succeeded."
