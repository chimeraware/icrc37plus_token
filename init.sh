#!/bin/bash

# ICRC37+ NFT Collection Initialization Script:
# 1. Update comprehensive collection details 
# 2. Mint test NFTs

# Configuration
CANISTER_ID=${1:-"bkyz2-fmaaa-aaaaa-qaaaq-cai"}  # Default to local canister ID
MINT_COUNT=${2:-10}
BASE_URL="http://127.0.0.1:4943"
LOGO_ASSET_KEY="logo.png"  # Assuming you've uploaded this asset

echo "====== JB Ducks NFT Test Script ======"
echo "Using canister ID: $CANISTER_ID"
echo "Will mint $MINT_COUNT NFTs"
echo "==================================================" 

# Step 1: Update comprehensive collection details
echo -e "\n1. Updating collection details..."

dfx canister call $CANISTER_ID update_collection_details '(record {
  name = opt "JB Ducks Collection";
  symbol = opt "JBDUCK";
  description = opt "A collection of unique JB Duck NFTs";
  max_supply = opt (2000 : nat64);
  base_url = opt "'$BASE_URL'";
  logo = opt "'$LOGO_ASSET_KEY'";
  whitelist_end_time = opt ((0 : nat64));
  pricing_enabled = opt true;
})'

# Query to see the collection details that were set
echo -e "\n1.1 Querying collection details to verify..."
dfx canister call $CANISTER_ID icrc7_collection_metadata '()' --query
