// Minimal test script for canister whoami method
import { Actor, HttpAgent } from '@dfinity/agent';

// Configuration
const canisterId = "bkyz2-fmaaa-aaaaa-qaaaq-cai";
const host = "http://127.0.0.1:4943";

// Minimal IDL for list_assets method
const idlFactory = ({ IDL }) => {
  // Define AssetMetadata record type exactly as in the backend
  const AssetMetadata = IDL.Record({
    'key': IDL.Text,
    'content_type': IDL.Text,
    'size': IDL.Nat64,  // Changed from Nat to Nat64
    'created_at': IDL.Nat64,
    'modified_at': IDL.Nat64,
    'description': IDL.Opt(IDL.Text),
    'uploaded_by': IDL.Principal
  });
  
  // Define variant return type
  const Result = IDL.Variant({
    'Ok': IDL.Vec(AssetMetadata),
    'Err': IDL.Text
  });
  
  return IDL.Service({
    'list_assets': IDL.Func([], [Result], ['query'])
  });
};

// Run test
(async () => {
  try {
    // Create agent and fetch root key
    const agent = new HttpAgent({ host, fetchRootKey: true });
    await agent.fetchRootKey();
    
    // Create actor and call list_assets
    const actor = Actor.createActor(idlFactory, { agent, canisterId });
    const result = await actor.list_assets();
    
    // Handle variant response
    if ('Ok' in result) {
      const assets = result.Ok;
      console.log(`✅ Success! Found ${assets.length} assets:`);
      assets.forEach((asset, index) => {
        console.log(`  ${index + 1}. ${asset.key} (${asset.content_type}, ${asset.size} bytes)`);
      });
    } else if ('Err' in result) {
      console.error(`❌ Backend error: ${result.Err}`);
      process.exit(1);
    } else {
      console.error('❌ Unexpected response format');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
})();
