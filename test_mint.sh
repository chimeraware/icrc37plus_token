#!/bin/bash

# Test script for JBDucks NFT:
# 1. Update collection details to set max supply to 2000
# 2. Mint 10 NFTs

# Configuration
CANISTER_ID=${1:-"br5f7-7uaaa-aaaaa-qaaca-cai"}
MINT_COUNT=${2:-10}
BASE_URL="http://127.0.0.1:4943"

echo "====== JB Ducks NFT Test Script ======"
echo "Using canister ID: $CANISTER_ID"
echo "Will mint $MINT_COUNT NFTs"
echo "======================================="

# Step 1: Update collection details
echo -e "\n1. Updating collection details..."
echo "Setting max supply to 2000 NFTs"

dfx canister call $CANISTER_ID update_collection_details '(record {
  name = opt "JB Ducks Collection";
  symbol = opt "JBDUCK";
  description = opt "A collection of unique JB Duck NFTs";
  max_supply = opt (2000 : nat64);
  base_url = opt "'$BASE_URL'";
})'

echo "Collection details updated successfully!"

# Step 2: Mint NFTs
echo -e "\n2. Minting $MINT_COUNT NFTs..."

for i in $(seq 1 $MINT_COUNT); do
  echo "Minting NFT $i/$MINT_COUNT..."
  result=$(dfx canister call $CANISTER_ID mint)
  
  # Extract token ID from result if successful
  if [[ $result == *"variant"* ]] && [[ $result == *"ok"* ]]; then
    token_id=$(echo $result | grep -o -E 'record \{ [0-9]+' | grep -o -E '[0-9]+')
    echo "  ✅ Successfully minted NFT with token ID: $token_id"
  else
    echo "  ❌ Failed to mint NFT: $result"
  fi
  
  # Small delay between mints
  sleep 0.5
done

# Step 3: Get collection metadata
echo -e "\n3. Fetching collection information..."
dfx canister call $CANISTER_ID icrc7_collection_metadata

# Step 4: Get transaction history
echo -e "\n4. Fetching transaction history..."
dfx canister call $CANISTER_ID icrc3_get_transactions '(record { start = opt (0 : nat64); length = opt (20 : nat16) })'

# Step 5: Fetch list of owned NFTs by caller
echo -e "\n5. Fetching owned NFTs by caller..."
dfx canister call $CANISTER_ID icrc7_tokens_of '(record { owner = principal "'$(dfx identity get-principal)'"; subaccount = null }, opt 0, opt 100)'

echo -e "\n====== Test completed successfully ======"
