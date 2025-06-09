import { getNetworkConfig, CANISTER_ID, PLUG_CONFIG } from '$lib/config';
import { Actor } from '@dfinity/agent';
import type { ActorSubclass } from '@dfinity/agent';
import { HttpAgent } from '@dfinity/agent';
import type { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { AuthClient } from '@dfinity/auth-client';
import { get } from 'svelte/store';
import {
  isWalletConnected,
  walletPrincipal,
  canisterActor,
  isCanisterConnected,
  connectionError,
  isConnecting,
  authProvider
} from '$lib/stores';

// Simplified IDL type - using any for now to avoid complex typing issues
type IDLType = any;

// Type for network config
type NetworkConfig = {
  canisterIds: {
    backend: string;
    [key: string]: string;
  };
  host: string;
  local: boolean;
  fetchRootKey: boolean;
};

// Asset metadata type definition based on the backend interface
interface AssetMetadata {
  key: string;
  content_type: string;
  size: bigint;
  created_at: bigint;
  modified_at: bigint;
  description?: string;
  uploaded_by: Principal;
}

// Interface for the canister actor with methods
interface CanisterActor extends ActorSubclass<any> {
  // Collection info methods
  get_icrc37_supported_standards: () => Promise<any[]>;
  icrc7_collection_metadata: () => Promise<any[]>;
  icrc7_name: () => Promise<string>;
  icrc7_symbol: () => Promise<string>;
  icrc7_description: () => Promise<string>;
  icrc7_total_supply: () => Promise<bigint>;
  icrc7_supply_cap: () => Promise<bigint>;
  
  // Admin methods
  whoami: () => Promise<Principal>;
  make_me_admin: () => Promise<{Ok: null} | {Err: string}>;
  get_admins: () => Promise<any[]>;
  is_admin_type: (principal: Principal, adminType: any) => Promise<boolean>;
  add_admin: (principal: Principal, adminType: any) => Promise<{Ok: null} | {Err: string}>;
  remove_admin: (principal: Principal) => Promise<{Ok: null} | {Err: string}>;
  
  // Collection management
  update_collection_details: (arg: any) => Promise<{Ok: null} | {Err: string}>;
  get_collection_info: () => Promise<any[]>;
  
  // Asset management
  list_assets: () => Promise<{Ok: AssetMetadata[]} | {Err: string}>;
  upload: (args: any) => Promise<{Ok: string} | {Err: string}>;
  download: (key: string) => Promise<{Ok: any} | {Err: string}>;
  delete_asset: (key: string) => Promise<{Ok: null} | {Err: string}>;
  get_asset_info: (key: string) => Promise<AssetMetadata | null>;
  
  // User and token methods
  icrc7_balance_of: (account: any) => Promise<bigint>;
  get_user_nfts: (principal: Principal) => Promise<any[]>;
  get_nft: (tokenId: bigint) => Promise<any | null>;
  
  // Mint schedules and pricing
  get_bundle_prices: () => Promise<any[]>;
  get_mint_schedules: () => Promise<any[]>;
  is_minting_active: () => Promise<[boolean, boolean, bigint]>;
}

// Interface for actor creation options
interface ActorCreationOptions {
  canisterId: string;
  interfaceFactory: any;
  host?: string;
  agentOptions?: {
    host?: string;
    [key: string]: any;
  };
}

// Define Plug wallet interface on window.ic
declare global {
  interface Window {
    ic?: {
      plug?: {
        agent?: any;
        getPrincipal: () => Promise<Principal>;
        isConnected: () => Promise<boolean>;
        createActor: (params: ActorCreationOptions) => Promise<any>;
        requestConnect: (params: any) => Promise<any>;
        disconnect: () => Promise<void>;
      };
    };
  }
}

// Auth provider types
export type AuthProviderType = 'plug' | 'ii' | null;

// Internet Identity configuration
const II_LOCAL_CANISTER_ID = 'be2us-64aaa-aaaaa-qaabq-cai';
const II_MAINNET_CANISTER_ID = 'rdmx6-jaaaa-aaaaa-aaadq-cai';

// The correct format for II authentication URL
// For local development, we need to use the format: http://{canister-id}.localhost:{port}
const II_HOST = getNetworkConfig().host === 'http://localhost:4943' 
  ? `http://${II_LOCAL_CANISTER_ID}.localhost:4943` 
  : 'https://identity.ic0.app';
  
console.log('Internet Identity host:', II_HOST);

// IDL for your backend canister - Complete ICRC37+ NFT Collection Interface
export const idlFactory = ({ IDL }: { IDL: any }): any => {
  const AdminType = IDL.Variant({
    'System': IDL.Null,
    'Functional': IDL.Null
  });

  const Admin = IDL.Record({
    'owner': IDL.Principal,
    'admin_type': AdminType
  });

  const Account = IDL.Record({ 
    'owner': IDL.Principal, 
    'subaccount': IDL.Opt(IDL.Vec(IDL.Nat8))
  });
  
  const Standard = IDL.Record({
    'name': IDL.Text,
    'url': IDL.Text
  });

  const Value = IDL.Variant({
    'Nat': IDL.Nat,
    'Int': IDL.Int,
    'Text': IDL.Text,
    'Blob': IDL.Vec(IDL.Nat8)
  });

  const UpdateCollectionDetailsArgs = IDL.Record({
    'name': IDL.Opt(IDL.Text),
    'symbol': IDL.Opt(IDL.Text),
    'description': IDL.Opt(IDL.Text),
    'max_supply': IDL.Opt(IDL.Nat64),
    'base_url': IDL.Opt(IDL.Text),
    'logo': IDL.Opt(IDL.Text),
    'whitelist_end_time': IDL.Opt(IDL.Nat64),
    'pricing_enabled': IDL.Opt(IDL.Bool)
  });

  const TransferError = IDL.Variant({
    'Duplicate': IDL.Record({ 'duplicate_of': IDL.Nat64 }),
    'BadBurn': IDL.Null,
    'NonExistingTokenId': IDL.Null,
    'BadFee': IDL.Record({ 'expected_fee': IDL.Nat }),
    'CreatedInFuture': IDL.Record({ 'ledger_time': IDL.Nat64 }),
    'TooOld': IDL.Null,
    'Unauthorized': IDL.Null,
    'GenericError': IDL.Record({
      'error_code': IDL.Nat64,
      'message': IDL.Text
    })
  });

  const TransferArgs = IDL.Record({
    'from_subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
    'to': Account,
    'token_id': IDL.Nat64,
    'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
    'created_at_time': IDL.Opt(IDL.Nat64)
  });

  return IDL.Service({
    // Admin management functions
    'add_admin': IDL.Func([IDL.Principal, AdminType], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'remove_admin': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'get_admins': IDL.Func([], [IDL.Vec(Admin)], ['query']),
    'is_admin_type': IDL.Func([IDL.Principal, AdminType], [IDL.Bool], ['query']),
    
    // Admin and whitelist functions
    'add_to_whitelist': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'remove_from_whitelist': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'is_whitelisted': IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    
    // Collection management and queries
    'update_collection_details': IDL.Func([UpdateCollectionDetailsArgs], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'update_base_url': IDL.Func([IDL.Text], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'get_collection_info': IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, Value))], ['query']),
    'get_nft': IDL.Func([IDL.Nat64], [IDL.Opt(IDL.Record({
      'token_id': IDL.Nat64,
      'owner': IDL.Principal,
      'metadata': IDL.Record({
        'name': IDL.Text,
        'description': IDL.Text,
        'image_url': IDL.Text,
        'content_url': IDL.Opt(IDL.Text),
        'content_type': IDL.Opt(IDL.Text),
        'properties': IDL.Opt(IDL.Variant({})),
        'is_layered': IDL.Bool,
        'svg_id': IDL.Opt(IDL.Nat64),
        'layers': IDL.Opt(IDL.Vec(IDL.Text))
      }),
      'created_at': IDL.Nat64,
      'transfer_history': IDL.Vec(IDL.Record({
        'from': IDL.Principal,
        'to': IDL.Principal,
        'timestamp': IDL.Nat64
      }))
    }))], ['query']),
    'get_user_nfts': IDL.Func([IDL.Principal], [IDL.Vec(IDL.Record({
      'token_id': IDL.Nat64,
      'owner': IDL.Principal,
      'metadata': IDL.Record({
        'name': IDL.Text,
        'description': IDL.Text,
        'image_url': IDL.Text,
        'content_url': IDL.Opt(IDL.Text),
        'content_type': IDL.Opt(IDL.Text),
        'properties': IDL.Opt(IDL.Variant({})),
        'is_layered': IDL.Bool,
        'svg_id': IDL.Opt(IDL.Nat64),
        'layers': IDL.Opt(IDL.Vec(IDL.Text))
      }),
      'created_at': IDL.Nat64,
      'transfer_history': IDL.Vec(IDL.Record({
        'from': IDL.Principal,
        'to': IDL.Principal,
        'timestamp': IDL.Nat64
      }))
    }))], ['query']),
    'get_transaction_history': IDL.Func([IDL.Nat64], [IDL.Vec(IDL.Record({
      'from': IDL.Principal,
      'to': IDL.Principal,
      'timestamp': IDL.Nat64
    }))], ['query']),
    
    // Asset management functions
    'upload': IDL.Func([IDL.Record({
      'key': IDL.Opt(IDL.Text),
      'content_type': IDL.Text,
      'data': IDL.Vec(IDL.Nat8),
      'description': IDL.Opt(IDL.Text)
    })], [IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text })], []),
    'download': IDL.Func([IDL.Text], [IDL.Variant({
      'Ok': IDL.Record({
        'data': IDL.Vec(IDL.Nat8),
        'content_type': IDL.Text,
        'metadata': IDL.Record({
          'key': IDL.Text,
          'content_type': IDL.Text,
          'size': IDL.Nat64,
          'created_at': IDL.Nat64,
          'modified_at': IDL.Nat64,
          'description': IDL.Opt(IDL.Text),
          'uploaded_by': IDL.Principal
        })
      }),
      'Err': IDL.Text
    })], ['query']),
    'list_assets': IDL.Func([], [IDL.Variant({
      'Ok': IDL.Vec(IDL.Record({
        'key': IDL.Text,
        'content_type': IDL.Text,
        'size': IDL.Nat64,
        'created_at': IDL.Nat64,
        'modified_at': IDL.Nat64,
        'description': IDL.Opt(IDL.Text),
        'uploaded_by': IDL.Principal
      })),
      'Err': IDL.Text
    })], ['query']),
    'delete_asset': IDL.Func([IDL.Text], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'get_asset_info': IDL.Func([IDL.Text], [IDL.Opt(IDL.Record({
      'key': IDL.Text,
      'content_type': IDL.Text,
      'size': IDL.Nat64,
      'created_at': IDL.Nat64,
      'modified_at': IDL.Nat64,
      'description': IDL.Opt(IDL.Text),
      'uploaded_by': IDL.Principal
    }))], ['query']),
    'http_request': IDL.Func([IDL.Record({
      'url': IDL.Text,
      'method': IDL.Text,
      'body': IDL.Vec(IDL.Nat8),
      'headers': IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
      'certificate_version': IDL.Opt(IDL.Nat16)
    })], [IDL.Record({
      'body': IDL.Vec(IDL.Nat8),
      'headers': IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
      'status_code': IDL.Nat16,
      'streaming_strategy': IDL.Opt(
        IDL.Variant({
          'Callback': IDL.Record({
            'token': IDL.Record({
              'key': IDL.Text,
              'index': IDL.Nat,
              'content_encoding': IDL.Text
            }),
            'callback': IDL.Func(
              [IDL.Record({
                'key': IDL.Text,
                'index': IDL.Nat,
                'content_encoding': IDL.Text
              })],
              [IDL.Record({
                'body': IDL.Vec(IDL.Nat8),
                'token': IDL.Opt(IDL.Record({
                  'key': IDL.Text,
                  'index': IDL.Nat,
                  'content_encoding': IDL.Text
                }))
              })],
              ['query']
            )
          })
        })
      )
    })], ['query']),
    
    // ICRC-7 Base Standard Methods
    'icrc7_name': IDL.Func([], [IDL.Text], ['query']),
    'icrc7_symbol': IDL.Func([], [IDL.Text], ['query']),
    'icrc7_description': IDL.Func([], [IDL.Opt(IDL.Text)], ['query']),
    'icrc7_balance_of': IDL.Func([IDL.Vec(Account)], [IDL.Vec(IDL.Nat64)], ['query']),
    'icrc7_collection_metadata': IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Text, Value))], ['query']),
    'icrc7_owner_of': IDL.Func([IDL.Vec(IDL.Nat64)], [IDL.Vec(IDL.Opt(Account))], ['query']),
    'icrc7_token_metadata': IDL.Func([IDL.Vec(IDL.Nat64)], [IDL.Vec(IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, Value))))], ['query']),
    'icrc7_tokens': IDL.Func([IDL.Opt(IDL.Nat64), IDL.Opt(IDL.Nat64)], [IDL.Vec(IDL.Nat64)], ['query']),
    'icrc7_tokens_of': IDL.Func([Account, IDL.Opt(IDL.Nat64), IDL.Opt(IDL.Nat64)], [IDL.Vec(IDL.Nat64)], ['query']),
    'icrc7_total_supply': IDL.Func([], [IDL.Nat64], ['query']),
    'icrc7_supported_standards': IDL.Func([], [IDL.Vec(Standard)], ['query']),
    'icrc7_transfer': IDL.Func([IDL.Vec(TransferArgs)], [IDL.Vec(IDL.Variant({ 'Ok': IDL.Nat64, 'Err': TransferError }))], []),
    
    // ICRC-37 Extension Methods
    'icrc37_approve_collection': IDL.Func([IDL.Record({
      'from_subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'spender': Account,
      'expires_at': IDL.Opt(IDL.Nat64),
      'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'created_at_time': IDL.Opt(IDL.Nat64)
    })], [IDL.Variant({ 'Ok': IDL.Nat64, 'Err': TransferError })], []),
    'icrc37_approve_tokens': IDL.Func([IDL.Vec(IDL.Record({
      'from_subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'spender': Account,
      'token_id': IDL.Nat64,
      'expires_at': IDL.Opt(IDL.Nat64),
      'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'created_at_time': IDL.Opt(IDL.Nat64)
    }))], [IDL.Vec(IDL.Variant({ 'Ok': IDL.Nat64, 'Err': TransferError }))], []),
    'icrc37_is_approved': IDL.Func([Account, Account, IDL.Nat64], [IDL.Bool], ['query']),
    'icrc37_transfer_from': IDL.Func([IDL.Vec(IDL.Record({
      'spender_subaccount': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'from': Account,
      'to': Account,
      'token_id': IDL.Nat64,
      'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'created_at_time': IDL.Opt(IDL.Nat64)
    }))], [IDL.Vec(IDL.Variant({ 'Ok': IDL.Nat64, 'Err': TransferError }))], []),
    
    // ICRC-3 Transaction Log Methods
    'icrc3_get_transactions': IDL.Func([IDL.Record({
      'start': IDL.Opt(IDL.Nat64),
      'length': IDL.Opt(IDL.Nat16)
    })], [IDL.Record({
      'transactions': IDL.Vec(IDL.Record({
        'kind': IDL.Text,
        'timestamp': IDL.Nat64,
        'token_id': IDL.Nat64,
        'from': IDL.Principal,
        'to': IDL.Principal,
        'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
        'operation': IDL.Text,
        'transaction_id': IDL.Nat64
      })),
      'total': IDL.Nat64
    })], ['query']),
    'icrc3_get_archives': IDL.Func([], [IDL.Vec(IDL.Record({
      'canister_id': IDL.Principal,
      'start': IDL.Nat64,
      'end': IDL.Nat64
    }))], ['query']),
    'icrc3_get_transaction': IDL.Func([IDL.Nat64], [IDL.Opt(IDL.Record({
      'kind': IDL.Text,
      'timestamp': IDL.Nat64,
      'token_id': IDL.Nat64,
      'from': IDL.Principal,
      'to': IDL.Principal,
      'memo': IDL.Opt(IDL.Vec(IDL.Nat8)),
      'operation': IDL.Text,
      'transaction_id': IDL.Nat64
    }))], ['query']),
    
    // Minting functions
    'mint': IDL.Func([], [IDL.Variant({ 
      'Ok': IDL.Record({ 
        '0': IDL.Nat64, 
        '1': IDL.Record({
          'name': IDL.Text,
          'description': IDL.Text,
          'image_url': IDL.Text,
          'content_url': IDL.Opt(IDL.Text),
          'content_type': IDL.Opt(IDL.Text),
          'properties': IDL.Opt(IDL.Variant({})),
          'is_layered': IDL.Bool,
          'svg_id': IDL.Opt(IDL.Nat64),
          'layers': IDL.Opt(IDL.Vec(IDL.Text))
        }) 
      }), 
      'Err': IDL.Text 
    })], []),
    'mint_bundle': IDL.Func([IDL.Nat64], [IDL.Variant({ 
      'Ok': IDL.Vec(IDL.Record({ 
        '0': IDL.Nat64, 
        '1': IDL.Record({
          'name': IDL.Text,
          'description': IDL.Text,
          'image_url': IDL.Text,
          'content_url': IDL.Opt(IDL.Text),
          'content_type': IDL.Opt(IDL.Text),
          'properties': IDL.Opt(IDL.Variant({})),
          'is_layered': IDL.Bool,
          'svg_id': IDL.Opt(IDL.Nat64),
          'layers': IDL.Opt(IDL.Vec(IDL.Text))
        }) 
      })), 
      'Err': IDL.Text 
    })], []),
    
    // Testing functions
    'whoami': IDL.Func([], [IDL.Principal], ['query']),
    'make_me_admin': IDL.Func([], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    
    // Pricing and timeframe functions
    'update_prices': IDL.Func([
      IDL.Variant({ 'Standard': IDL.Null, 'Whitelist': IDL.Null }),
      IDL.Vec(IDL.Record({
        'quantity': IDL.Nat64,
        'price': IDL.Nat
      }))
    ], [IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text })], []),
    'get_mint_schedules': IDL.Func([], [IDL.Vec(IDL.Record({
      'name': IDL.Text,
      'bundle_prices': IDL.Vec(IDL.Record({
        'quantity': IDL.Nat64,
        'price': IDL.Nat
      })),
      'start_time': IDL.Opt(IDL.Nat64),
      'end_time': IDL.Opt(IDL.Nat64),
      'active': IDL.Bool,
      'whitelist_only': IDL.Bool
    }))], ['query']),
    'get_minting_timeframes': IDL.Func([], [IDL.Opt(IDL.Nat64), IDL.Opt(IDL.Nat64), IDL.Opt(IDL.Nat64), IDL.Opt(IDL.Nat64)], ['query']),
    'is_minting_active': IDL.Func([], [IDL.Bool, IDL.Bool, IDL.Nat64], ['query'])
  });
};

// Import the backend IDL factory for actor creation
const backendIdlFactory = idlFactory;

// Define the Actor types
let actor: CanisterActor | null = null;
let agent: HttpAgent | null = null;

// Shared actor caching to prevent multiple simultaneous connections
let sharedActor: CanisterActor | null = null;
let sharedActorPromise: Promise<CanisterActor> | null = null;

// Internet Identity auth client
let authClient: AuthClient | null = null;

// Custom error type for better error handling
type ConnectionError = {
  message: string;
  details?: unknown;
};

// Get or create a shared actor instance to prevent multiple simultaneous connections
export async function getSharedActor(): Promise<CanisterActor> {
  // If we already have a shared actor, return it
  if (sharedActor) {
    return sharedActor;
  }
  
  // If we're already creating a shared actor, return the promise
  if (sharedActorPromise) {
    return sharedActorPromise;
  }
  
  // Create a new shared actor
  sharedActorPromise = connectToCanister();
  
  try {
    sharedActor = await sharedActorPromise;
    return sharedActor;
  } catch (error) {
    console.error('Error creating shared actor:', error);
    sharedActorPromise = null;
    throw error;
  }
}

export function clearSharedActor() {
  sharedActor = null;
  sharedActorPromise = null;
}

export async function connectToCanister(agentToUse?: HttpAgent): Promise<CanisterActor> {
  try {
    // Check if we're connected to Plug
    const currentAuthProvider = get(authProvider);
    
    if (currentAuthProvider === 'plug' && window.ic?.plug) {
      console.log('Creating actor using Plug wallet');
      
      // Create actor using Plug
      actor = await window.ic.plug.createActor({
        canisterId: CANISTER_ID,
        interfaceFactory: idlFactory,
        host: PLUG_CONFIG.host // Use hardcoded config to avoid port caching issues
      }) as CanisterActor;
    } else if (currentAuthProvider === 'ii') {
      console.log('Creating actor using Internet Identity');
      
      // Use provided agent or create a new one
      let agent = agentToUse;
      if (!agent) {
        console.log('No agent provided, creating a new one');
        const networkConfig = getNetworkConfig();
        agent = new HttpAgent({
          host: networkConfig.host
        });
        
        // Get identity from auth client if available
        try {
          if (!authClient) {
            authClient = await AuthClient.create();
          }
          
          if (await authClient.isAuthenticated()) {
            const identity = authClient.getIdentity();
            agent.replaceIdentity(identity);
            console.log('Using authenticated identity from AuthClient');
          }
        } catch (error) {
          console.warn('Error getting identity from AuthClient:', error);
        }
        
        // Simplified root key fetching for local development
        if (getNetworkConfig().host.includes('localhost')) {
          console.log('Fetching root key for local development...');
          try {
            await agent.fetchRootKey();
            console.log('Root key fetched successfully');
          } catch (error) {
            console.error('Error fetching root key:', error);
            throw new Error(`Failed to fetch root key: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Create actor using Internet Identity
      actor = Actor.createActor(idlFactory, {
        agent,
        canisterId: CANISTER_ID
      }) as CanisterActor;
    } else {
      console.log('Creating anonymous actor');
      
      // Create anonymous actor
      const anonymousAgent = new HttpAgent({
        host: getNetworkConfig().host
      });
      
      // Simplified root key fetching for local development
      if (getNetworkConfig().host.includes('localhost')) {
        console.log('Explicitly fetching root key for anonymous agent...');
        await anonymousAgent.fetchRootKey();
        console.log('Root key fetched successfully for anonymous agent');
      }
      
      actor = Actor.createActor(idlFactory, {
        agent: anonymousAgent,
        canisterId: CANISTER_ID
      }) as CanisterActor;
    }
    
    if (actor) {
      isCanisterConnected.set(true);
      canisterActor.set(actor);
    }
    
    return actor;
  } catch (error: unknown) {
    console.error('Error connecting to canister:', error);
    isCanisterConnected.set(false);
    const errorObject: ConnectionError = {
      message: error instanceof Error ? error.message : 'Unknown error during canister connection',
      details: error
    };
    connectionError.set(errorObject.message);
    throw error;
  }
}

export async function connectToPlug(): Promise<{success: boolean, principal?: Principal, error?: string}> {
  try {
    console.log('Plug wallet integration has been disabled.');
    connectionError.set('Plug wallet integration has been disabled as requested.');
    isConnecting.set(false);
    return { success: false, error: 'Plug wallet integration has been disabled as requested.' };
  } catch (error) {
    console.error('Error in disabled Plug wallet function:', error);
    connectionError.set(error instanceof Error ? error.message : 'Error in disabled Plug wallet function');
    isConnecting.set(false);
    return { success: false, error: error instanceof Error ? error.message : 'Error in disabled Plug wallet function' };
  }
}

export function disconnect() {
  isWalletConnected.set(false);
  walletPrincipal.set(null);
  isCanisterConnected.set(false);
  canisterActor.set(null);
  authProvider.set(null);
  actor = null;
  agent = null;
}

// Export function to force disconnect based on current provider
export async function forceDisconnect(): Promise<void> {
  try {
    const currentAuthProvider = get(authProvider);
    
    if (currentAuthProvider === 'plug' && window.ic?.plug) {
      console.log('Force disconnecting from Plug wallet');
      await window.ic.plug.disconnect();
    } else if (currentAuthProvider === 'ii' && authClient) {
      console.log('Force disconnecting from Internet Identity');
      await authClient.logout();
    }
    
    // Reset all connection state
    disconnect();
  } catch (error) {
    console.error('Error during force disconnect:', error);
    // Still disconnect even if there was an error
    disconnect();
  }
}

// Legacy function for backward compatibility
export async function forceDisconnectPlug(): Promise<void> {
  return forceDisconnect();
}

// Initialize Internet Identity auth client
export async function initAuthClient(): Promise<AuthClient> {
  if (!authClient) {
    authClient = await AuthClient.create();
  }
  return authClient;
}

// Connect to Internet Identity
export async function connectToII(): Promise<{success: boolean, principal?: Principal, error?: string, actor?: CanisterActor}> {
  try {
    isConnecting.set(true);
    connectionError.set(null);
    
    console.log('Connecting to Internet Identity...');
    console.log('II_HOST:', II_HOST);
    
    // Initialize auth client
    const client = await initAuthClient();
    console.log('Auth client initialized');
    
    // Check if already authenticated
    const isAuthenticated = await client.isAuthenticated();
    console.log('Already authenticated:', isAuthenticated);
    
    if (!isAuthenticated) {
      console.log('Opening Internet Identity login dialog...');
      // Prompt user to login with Internet Identity
      await new Promise<void>((resolve, reject) => {
        try {
          client.login({
            identityProvider: II_HOST,
            onSuccess: () => {
              console.log('II login successful');
              resolve();
            },
            onError: (error) => {
              console.error('II login error:', error);
              connectionError.set(`II login error: ${error}`);
              reject(error); // Reject with error to handle it properly
            }
          });
        } catch (e) {
          console.error('Exception during II login setup:', e);
          connectionError.set(`II login setup error: ${e}`);
          reject(e);
        }
      }).catch(error => {
        console.error('II login promise rejected:', error);
        // Continue execution despite error
      });
    }
    
    // Get identity from auth client
    const identity = client.getIdentity();
    const principal = identity.getPrincipal();
    
    // Update stores
    isWalletConnected.set(true);
    // Use a more robust type casting approach to handle Principal compatibility
    walletPrincipal.set(principal as unknown as Principal);
    authProvider.set('ii');
    
    // Create an agent with the identity
    agent = new HttpAgent({
      host: getNetworkConfig().host,
      identity: identity as any // Using 'any' to bypass type compatibility issues
    });
    
    // Simplified root key fetching for local development
    if (getNetworkConfig().host.includes('localhost')) {
      console.log('Explicitly fetching root key for Internet Identity agent...');
      await agent.fetchRootKey();
      console.log('Root key fetched successfully for Internet Identity agent');
    }
    
    // Create actor with this identity
    actor = Actor.createActor(idlFactory, {
      agent,
      canisterId: CANISTER_ID
    }) as CanisterActor;
    
    if (actor) {
      isCanisterConnected.set(true);
      canisterActor.set(actor);
      console.log('Connected to Internet Identity:', principal.toString());
    }
    
    // Type cast to avoid Principal compatibility issues between different @dfinity/principal versions
    return { success: true, principal: principal as unknown as Principal, actor };
  } catch (error: unknown) {
    console.error('Error connecting to Internet Identity:', error);
    const errorObject: ConnectionError = {
      message: error instanceof Error ? error.message : 'Unknown error during II connection',
      details: error
    };
    connectionError.set(errorObject.message);
    return { success: false, error: errorObject.message };
  } finally {
    isConnecting.set(false);
  }
}

// Import the isPlugEnabled store
import { isPlugEnabled } from '$lib/stores';

// Completely disable Plug wallet integration
export function initializeWalletSettings(): void {
  console.log('Initializing wallet settings - Plug wallet integration disabled');
}

// Check if already connected on page load
export async function checkConnection(): Promise<boolean> {
  try {
    // Check if Internet Identity is connected
    const authClient = await AuthClient.create();
    if (await authClient.isAuthenticated()) {
      console.log('Internet Identity already authenticated, restoring connection...');
      
      // Get identity and principal
      const identity = authClient.getIdentity();
      const principal = identity.getPrincipal();
      
      // Update stores
      walletPrincipal.set(principal as any); // Type cast to avoid module version conflicts
      isWalletConnected.set(true);
      authProvider.set('ii');
      
      // Connect to canister with II identity
      const canisterConnection = await connectToCanister();
      
      if (canisterConnection.success) {
        console.log('Successfully reconnected with Internet Identity');
        return true;
      }
      return false;
    }
    
    // Plug wallet integration completely disabled - skip Plug wallet checks
    console.log('No active wallet connections found');
    return false;
  } catch (error: unknown) {
    const errorObject: ConnectionError = {
      message: error instanceof Error ? error.message : 'Unknown error during connection check',
      details: error
    };
    console.error('Error checking connection:', errorObject.message);
    connectionError.set(errorObject.message);
    return false;
  }
}

/**
 * Gets all admins from the canister
 * @returns {Promise<{success: boolean, admins?: Array<{owner: Principal, admin_type: {System: null} | {Functional: null}}>, error?: string}>}
 */
export async function getAllAdmins(): Promise<{success: boolean, admins?: any[], error?: string}> {
  try {
    // Get the shared actor
    const currentActor = await getSharedActor();
    
    console.log('Calling get_admins on canister...');
    const admins = await currentActor.get_admins();
    console.log('get_admins call successful, admins:', admins);
    
    return { success: true, admins };
  } catch (error: unknown) {
    console.error('Error fetching admins:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Test the canister interface directly to see what methods are available
 * This function attempts to directly call the whoami method on the canister
 * @returns {Promise<{success: boolean, result?: any, error?: string}>}
 */
export async function testCanisterInterface(): Promise<{success: boolean, result?: any, error?: string}> {
  try {
    console.log('Testing canister interface directly...');
    
    // Create a direct connection to the canister
    const agent = new HttpAgent(getNetworkConfig());
    
    // Simplified root key fetching for local development
    if (getNetworkConfig().host.includes('localhost')) {
      console.log('Explicitly fetching root key for test canister interface...');
      await agent.fetchRootKey();
      console.log('Root key fetched successfully for test canister interface');
    }
    
    // Create an actor with just the whoami method
    const testActor = Actor.createActor<{
      whoami: () => Promise<Principal>;
    }>(
      ({ IDL }) => {
        return IDL.Service({
          'whoami': IDL.Func([], [IDL.Principal], ['query']),
        });
      },
      {
        agent,
        canisterId: CANISTER_ID
      }
    );
    
    // Try to call the whoami method
    console.log('Attempting to call whoami method directly...');
    const principal = await testActor.whoami();
    console.log('Direct whoami call succeeded:', principal.toString());
    
    // Get all methods on the actor
    const methods = Object.keys(testActor)
      .filter(key => {
        try {
          // Type-safe check for function
          return typeof (testActor as any)[key] === 'function';
        } catch (e) {
          return false;
        }
      })
      .join(', ');
    console.log('Available methods on test actor:', methods);
    
    return { 
      success: true, 
      result: {
        principal: principal.toString(),
        methods
      }
    };
  } catch (error) {
    console.error('Error testing canister interface:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Diagnostic function to get information about the canister connection
 * @returns {Promise<{success: boolean, info?: any, error?: string}>}
 */
export async function whoami(): Promise<{success: boolean, info?: any, error?: string}> {
  try {
    console.log('Running whoami diagnostic...');
    
    // Get connection details
    const connectionInfo = {
      canisterId: CANISTER_ID,
      networkConfig: getNetworkConfig(),
      isAgentInitialized: !!agent,
      isActorInitialized: !!actor,
      authProvider: get(authProvider),
      isWalletConnected: get(isWalletConnected),
      isCanisterConnected: get(isCanisterConnected),
      principal: get(walletPrincipal)?.toString() || 'Not connected'
    };
    
    console.log('Connection info:', connectionInfo);
    
    // Try to get a shared actor
    let sharedActorInfo: string = 'Failed to get shared actor';
    let canisterWhoamiResult: string = 'Not attempted';
    
    try {
      const sharedActor = await getSharedActor();
      const actorMethods = Object.keys(sharedActor)
        .filter(key => typeof sharedActor[key] === 'function')
        .join(', ');
      sharedActorInfo = `Available methods: ${actorMethods}`;
      
      // Try to call whoami on the canister (we know it exists from the interface)
      try {
        console.log('Attempting to call canister whoami method...');
        // Check if the whoami method exists on the actor
        if (typeof sharedActor.whoami === 'function') {
          // Call the whoami method directly
          const result = await sharedActor.whoami();
          canisterWhoamiResult = `Success: ${result.toString()}`;
          console.log('Canister whoami result:', result.toString());
        } else {
          // Method exists in interface but not in the actor instance
          canisterWhoamiResult = 'Error: whoami method exists in the interface but not in the actor instance';
          console.error('Method exists in interface but not in actor instance');
          
          // Log available methods for debugging
          console.log('Available methods:', Object.keys(sharedActor)
            .filter(key => typeof sharedActor[key] === 'function')
            .join(', '));
        }
      } catch (whoamiError) {
        canisterWhoamiResult = `Error calling whoami: ${whoamiError instanceof Error ? whoamiError.message : String(whoamiError)}`;
        console.error('Error calling canister whoami:', whoamiError);
      }
    } catch (e) {
      sharedActorInfo = `Error getting shared actor: ${e instanceof Error ? e.message : String(e)}`;
    }
    
    // Combine all diagnostic info
    const diagnosticInfo = {
      ...connectionInfo,
      sharedActorInfo,
      canisterWhoamiResult,
      timestamp: new Date().toISOString()
    };
    
    return { success: true, info: diagnosticInfo };
  } catch (error: unknown) {
    console.error('Error in whoami diagnostic:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { 
      success: false, 
      error: errorMsg,
      info: {
        canisterId: CANISTER_ID,
        networkConfig: getNetworkConfig(),
        errorDetails: String(error)
      }
    };
  }
}

type CollectionForm = {
  name: string;
  symbol: string;
  description: string;
  maxSupply: number;
  baseUrl: string;
  logo: string;
  creator: string;
  website: string;
  pricing_enabled: boolean;
};
