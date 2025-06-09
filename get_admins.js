// Simple script to get all admins using the wallet.js library
import { Actor, HttpAgent } from '@dfinity/agent';
import fetch from 'node-fetch';

// Set global fetch for Node.js environment
global.fetch = fetch;

// Get canister ID
const CANISTER_ID = process.env.CANISTER_ID || 'bkyz2-fmaaa-aaaaa-qaaaq-cai'; // Default to local canister

// IDL for your backend canister - Admin portion only
const idlFactory = ({ IDL }) => {
  const AdminType = IDL.Variant({
    'System': IDL.Null,
    'Functional': IDL.Null
  });

  const Admin = IDL.Record({
    'owner': IDL.Principal,
    'admin_type': AdminType
  });

  return IDL.Service({
    'get_admins': IDL.Func([], [IDL.Vec(Admin)], ['query']),
  });
};

async function getAdmins() {
  try {
    console.log(`Connecting to canister: ${CANISTER_ID}`);
    
    // Create an agent
    const agent = new HttpAgent({
      host: 'http://localhost:4943', // Local network
    });
    
    // Local development only - fetch root key
    await agent.fetchRootKey();
    
    // Create actor
    const actor = Actor.createActor(idlFactory, {
      agent,
      canisterId: CANISTER_ID,
    });
    
    // Call get_admins method
    console.log('Fetching admins...');
    const admins = await actor.get_admins();
    
    console.log('\nADMIN LIST:');
    console.log('-----------');
    
    if (admins.length === 0) {
      console.log('No admins found');
    } else {
      admins.forEach((admin, index) => {
        console.log(`Admin #${index + 1}:`);
        console.log(`  Principal: ${admin.owner.toString()}`);
        console.log(`  Type: ${Object.keys(admin.admin_type)[0]}`);
        console.log('');
      });
    }
    
    return admins;
  } catch (error) {
    console.error('Error fetching admins:', error);
    return null;
  }
}

// Run the function
getAdmins();
