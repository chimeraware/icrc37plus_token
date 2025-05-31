// ICRC-37 Compliant NFT Canister with Minting and Whitelist Functionality

use candid::{CandidType, Deserialize, Principal, Nat};
use ic_cdk::api::{caller, time};
use ic_cdk_macros::*;
use serde::Serialize;
use std::{cell::RefCell, collections::HashMap};
// use std::convert::TryInto;  // Commented out unused import

// Define admin types
#[derive(Clone, Debug, CandidType, Deserialize, Serialize, PartialEq)]
enum AdminType {
    System,   // Can do everything, including adding/removing admins
    Functional // Can only perform functional updates like changing description
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct Admin {
    owner: Principal,
    admin_type: AdminType,
}

// Define Collection Details structure
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct CollectionDetails {
    name: String,
    symbol: String, 
    description: String,
    max_supply: Option<u64>,
    base_url: String,
}

// In-memory storage using thread_local
thread_local! {
    static TOKEN_ID_COUNTER: RefCell<u64> = RefCell::new(0);
    static NFTS: RefCell<HashMap<u64, NFT>> = RefCell::new(HashMap::new());
    static OWNER_TOKENS: RefCell<HashMap<Principal, Vec<u64>>> = RefCell::new(HashMap::new());
    static WHITELIST: RefCell<HashMap<Principal, bool>> = RefCell::new(HashMap::new());
    static ADMINS: RefCell<HashMap<Principal, AdminType>> = RefCell::new(HashMap::new());
    static COLLECTION_DETAILS: RefCell<CollectionDetails> = RefCell::new(CollectionDetails {
        name: COLLECTION_NAME.to_string(),
        symbol: COLLECTION_SYMBOL.to_string(),
        description: COLLECTION_DESCRIPTION.to_string(),
        max_supply: None,
        base_url: "http://127.0.0.1:4943".to_string(),
    });
    // Simple asset storage implementation
    static ASSETS: RefCell<HashMap<String, Asset>> = RefCell::new(HashMap::new());
    // Track which assets have been minted already
    static MINTED_ASSETS: RefCell<HashMap<String, bool>> = RefCell::new(HashMap::new());
    // ICRC-37 Approvals storage
    static TOKEN_APPROVALS: RefCell<HashMap<u64, HashMap<Principal, ApprovalInfo>>> = RefCell::new(HashMap::new());
    static COLLECTION_APPROVALS: RefCell<HashMap<Principal, HashMap<Principal, ApprovalInfo>>> = RefCell::new(HashMap::new());
    // ICRC-3 Transaction log storage
    static TRANSACTIONS: RefCell<Vec<Transaction>> = RefCell::new(Vec::new());
    static TRANSACTION_ID_COUNTER: RefCell<u64> = RefCell::new(0);
    static ARCHIVES: RefCell<Vec<ArchiveInfo>> = RefCell::new(Vec::new());
}
// Define ICRC-37 compatible NFT type
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct NFT {
    token_id: u64,
    owner: Principal,
    metadata: NFTMetadata,
    created_at: u64,
    transfer_history: Vec<TransferRecord>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct NFTMetadata {
    name: String,
    description: String,
    image_url: String,
    content_url: Option<String>,
    content_type: Option<String>,
    properties: Option<Value>,
    is_layered: bool,
    svg_id: Option<u64>,
    layers: Option<Vec<String>>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct TransferRecord {
    from: Principal,
    to: Principal,
    timestamp: u64,
}

// Define ICRC-7/37 compatible types
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct Account {
    owner: Principal,
    subaccount: Option<Vec<u8>>, // Changed from [u8; 32] to Vec<u8> for easier serialization
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct TransferArgs {
    from_subaccount: Option<Vec<u8>>, // Changed from [u8; 32] to Vec<u8>
    to: Account,
    token_id: u64,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
enum TransferError {
    BadFee { expected_fee: Nat },
    BadBurn { min_burn_amount: Nat },
    InsufficientFunds { balance: Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: u64 },
    GenericError { error_code: Nat, message: String },
    TemporarilyUnavailable,
    Unauthorized,
    NotFound,
}

// ICRC-3 data structures for transaction logs
#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct Transaction {
    kind: String,  // "transfer", "mint", "burn", "approve", etc.
    timestamp: u64,
    token_id: u64,
    from: Principal,
    to: Principal,
    memo: Option<Vec<u8>>,
    operation: String, // Additional details about the operation
    transaction_id: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct GetTransactionsRequest {
    start: Option<u64>,  // Start index (inclusive)
    length: Option<u16>, // Maximum number of transactions to return
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct GetTransactionsResponse {
    transactions: Vec<Transaction>,
    total: u64,  // Total number of transactions available
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct ArchiveInfo {
    canister_id: Principal,
    start: u64,   // First transaction index in this archive
    end: u64,     // Last transaction index in this archive (inclusive)
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct ApprovalInfo {
    spender: Principal,
    token_id: u64,
    expires_at: Option<u64>,
    created_at: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct ApprovalArgs {
    from_subaccount: Option<Vec<u8>>,
    spender: Account,
    token_id: u64,
    expires_at: Option<u64>,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct ApprovalCollectionArgs {
    from_subaccount: Option<Vec<u8>>,
    spender: Account,
    expires_at: Option<u64>,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct TransferFromArgs {
    spender_subaccount: Option<Vec<u8>>,
    from: Account,
    to: Account,
    token_id: u64,
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct Standard {
    name: String,
    url: String,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
enum Value {
    Nat(Nat),
    Int(i64),
    Text(String),
    Blob(Vec<u8>),
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct UpdateCollectionDetailsArgs {
    name: Option<String>,
    symbol: Option<String>,
    description: Option<String>,
    max_supply: Option<u64>,
    base_url: Option<String>,
}

// Collection metadata constants - used for initial values
const COLLECTION_NAME: &str = "";
const COLLECTION_SYMBOL: &str = "";
const COLLECTION_DESCRIPTION: &str = "";
const MAX_QUERY_BATCH_SIZE: u16 = 100;
const MAX_UPDATE_BATCH_SIZE: u16 = 20;
const DEFAULT_TAKE_VALUE: u64 = 10;
const MAX_TAKE_VALUE: u64 = 100;

// Initialize the canister
#[init]
fn init() {
    let caller_principal = caller();
    
    // Set the caller as the first system admin
    ADMINS.with(|admins| {
        admins.borrow_mut().insert(caller_principal, AdminType::System);
    });
    
    // Add the caller to the whitelist
    WHITELIST.with(|whitelist| {
        whitelist.borrow_mut().insert(caller_principal, true);
    });
}

// ==== ICRC-3 METHODS ====
#[query]
fn icrc3_get_transactions(request: GetTransactionsRequest) -> GetTransactionsResponse {
    let start = request.start.unwrap_or(0);
    let length = request.length.unwrap_or(10).min(100) as usize; // Cap at 100 transactions per request
    
    let transactions = TRANSACTIONS.with(|txs| {
        let txs = txs.borrow();
        let total = txs.len() as u64;
        let transactions = txs.iter()
            .skip(start as usize)
            .take(length)
            .cloned()
            .collect::<Vec<_>>();
        
        GetTransactionsResponse {
            transactions,
            total,
        }
    });
    
    transactions
}

#[query]
fn icrc3_get_archives() -> Vec<ArchiveInfo> {
    ARCHIVES.with(|archives| archives.borrow().clone())
}

#[query]
fn icrc3_get_transaction(transaction_id: u64) -> Option<Transaction> {
    TRANSACTIONS.with(|txs| {
        txs.borrow().iter()
            .find(|tx| tx.transaction_id == transaction_id)
            .cloned()
    })
}

// ==== ICRC-7 BASE METHODS ====
#[query]
fn icrc7_collection_metadata() -> Vec<(String, Value)> {
    let total_supply = NFTS.with(|nfts| nfts.borrow().len() as u64);
    
    let mut metadata = COLLECTION_DETAILS.with(|details| {
        let details = details.borrow();
        let mut metadata = vec![
            ("icrc7:name".to_string(), Value::Text(details.name.clone())),
            ("icrc7:symbol".to_string(), Value::Text(details.symbol.clone())),
            ("icrc7:description".to_string(), Value::Text(details.description.clone())),
            ("icrc7:total_supply".to_string(), Value::Nat(Nat::from(total_supply))),
            ("icrc7:max_query_batch_size".to_string(), Value::Nat(Nat::from(MAX_QUERY_BATCH_SIZE))),
            ("icrc7:max_update_batch_size".to_string(), Value::Nat(Nat::from(MAX_UPDATE_BATCH_SIZE))),
            ("icrc7:default_take_value".to_string(), Value::Nat(Nat::from(DEFAULT_TAKE_VALUE))),
            ("icrc7:max_take_value".to_string(), Value::Nat(Nat::from(MAX_TAKE_VALUE))),
            ("logo".to_string(), Value::Text("https://example.com/logo.png".to_string())),
        ];
        
        // Add max_supply if set
        if let Some(max_supply) = details.max_supply {
            metadata.push(("max_supply".to_string(), Value::Nat(Nat::from(max_supply))));
        }
        
        metadata
    });
    
    // Add admin information
    let admins = ADMINS.with(|admins| {
        let admin_map = admins.borrow();
        let system_admins: Vec<String> = admin_map.iter()
            .filter(|(_, admin_type)| **admin_type == AdminType::System)
            .map(|(principal, _)| principal.to_string())
            .collect();
        system_admins.join(", ")
    });
    
    metadata.push(("owner".to_string(), Value::Text(admins)));
    
    metadata
}

#[query]
fn icrc7_name() -> String {
    COLLECTION_DETAILS.with(|details| details.borrow().name.clone())
}

#[query]
fn icrc7_symbol() -> String {
    COLLECTION_DETAILS.with(|details| details.borrow().symbol.clone())
}

#[query]
fn icrc7_description() -> Option<String> {
    Some(COLLECTION_DETAILS.with(|details| details.borrow().description.clone()))
}

#[query]
fn icrc7_total_supply() -> u64 {
    NFTS.with(|nfts| nfts.borrow().len() as u64)
}

#[query]
fn icrc7_supported_standards() -> Vec<Standard> {
    vec![
        Standard {
            name: "ICRC-3".to_string(),
            url: "https://github.com/dfinity/ICRC/tree/main/ICRCs/ICRC-3".to_string(),
        },
        Standard {
            name: "ICRC-7".to_string(),
            url: "https://github.com/dfinity/ICRC/tree/main/ICRCs/ICRC-7".to_string(),
        },
        Standard {
            name: "ICRC-37".to_string(),
            url: "https://github.com/dfinity/ICRC/tree/main/ICRCs/ICRC-37".to_string(),
        }
    ]
}

// Token query methods
#[query]
fn icrc7_token_metadata(token_ids: Vec<u64>) -> Vec<Option<Vec<(String, Value)>>> {
    token_ids.into_iter().map(|token_id| {
        NFTS.with(|nfts| {
            nfts.borrow().get(&token_id).cloned().map(|nft| {
                vec![
                    ("name".to_string(), Value::Text(nft.metadata.name.clone())),
                    ("description".to_string(), Value::Text(nft.metadata.description.clone())),
                    ("image".to_string(), Value::Text(nft.metadata.image_url.clone())),
                ]
            })
        })
    }).collect()
}

#[query]
fn icrc7_owner_of(token_ids: Vec<u64>) -> Vec<Option<Account>> {
    token_ids.into_iter().map(|token_id| {
        NFTS.with(|nfts| {
            nfts.borrow().get(&token_id).cloned().map(|nft| {
                Account {
                    owner: nft.owner,
                    subaccount: None,
                }
            })
        })
    }).collect()
}

#[query]
fn icrc7_balance_of(accounts: Vec<Account>) -> Vec<u64> {
    accounts.into_iter().map(|account| {
        OWNER_TOKENS.with(|owner_tokens| {
            owner_tokens.borrow().get(&account.owner).map_or(0, |tokens| tokens.len() as u64)
        })
    }).collect()
}

#[query]
fn icrc7_tokens(prev: Option<u64>, take: Option<u64>) -> Vec<u64> {
    let take_amount = take.unwrap_or(DEFAULT_TAKE_VALUE).min(MAX_TAKE_VALUE) as usize;
    let start_id = prev.unwrap_or(0);
    
    NFTS.with(|nfts| {
        nfts.borrow()
            .iter()
            .filter(|(id, _)| **id >= start_id)
            .take(take_amount)
            .map(|(id, _)| *id)
            .collect()
    })
}

#[query]
fn icrc7_tokens_of(account: Account, prev: Option<u64>, take: Option<u64>) -> Vec<u64> {
    let take_amount = take.unwrap_or(DEFAULT_TAKE_VALUE).min(MAX_TAKE_VALUE) as usize;
    let start_id = prev.unwrap_or(0);
    
    OWNER_TOKENS.with(|owner_tokens| {
        owner_tokens.borrow()
            .get(&account.owner)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|&id| id > start_id)
            .take(take_amount)
            .collect()
    })
}

// Transfer method
#[update]
fn icrc7_transfer(args: Vec<TransferArgs>) -> Vec<Result<u64, TransferError>> {
    args.into_iter().map(|arg| {
        let caller = caller();
        let token_id = arg.token_id;
        let to_owner = arg.to.owner;
        
        // Verify token exists and ownership
        let mut nft = match NFTS.with(|nfts| nfts.borrow().get(&token_id).cloned()) {
            Some(nft) => nft,
            None => return Err(TransferError::NotFound),
        };
        
        if nft.owner != caller {
            return Err(TransferError::Unauthorized);
        }
        
        // Process the transfer
        let timestamp = arg.created_at_time.unwrap_or_else(time);
        
        // Update transfer history
        nft.transfer_history.push(TransferRecord {
            from: caller,
            to: to_owner,
            timestamp,
        });
        
        // Update owner
        nft.owner = to_owner;
        
        // Update storage
        NFTS.with(|nfts| {
            nfts.borrow_mut().insert(token_id, nft);
        });
        
        // Update previous owner's records
        OWNER_TOKENS.with(|owner_tokens| {
            let mut tokens = owner_tokens.borrow_mut();
            if let Some(token_vec) = tokens.get_mut(&caller) {
                token_vec.retain(|&id| id != token_id);
            }
        });
        
        // Update new owner's records
        OWNER_TOKENS.with(|owner_tokens| {
            let mut tokens = owner_tokens.borrow_mut();
            tokens.entry(to_owner)
                .or_insert_with(Vec::new)
                .push(token_id);
        });
        
        // Record the transfer in the transaction log
        let _transaction_id = record_transaction("transfer", token_id, caller, to_owner, 
                                               arg.memo, "standard_transfer".to_string());
        
        Ok(timestamp)
    }).collect()
}

// ==== ICRC-37 EXTENSION METHODS ====

// ICRC-37 methods for token approvals
#[update]
fn icrc37_approve_tokens(args: Vec<ApprovalArgs>) -> Vec<Result<u64, TransferError>> {
    args.into_iter().map(|arg| {
        let caller_principal = caller();
        let token_id = arg.token_id;
        let spender_principal = arg.spender.owner;
        
        // Check if token exists
        if !NFTS.with(|nfts| nfts.borrow().contains_key(&token_id)) {
            return Err(TransferError::NotFound);
        }
        
        // Check if caller owns the token
        let token_owner = NFTS.with(|nfts| {
            nfts.borrow().get(&token_id).map(|nft| nft.owner).unwrap_or_else(|| Principal::anonymous())
        });
        
        if token_owner != caller_principal {
            return Err(TransferError::Unauthorized);
        }
        
        // Record timestamp
        let timestamp = time();
        
        // Create approval info
        let approval_info = ApprovalInfo {
            spender: spender_principal,
            token_id,
            expires_at: arg.expires_at,
            created_at: timestamp,
        };
        
        // Add to approvals
        TOKEN_APPROVALS.with(|approvals| {
            approvals.borrow_mut()
                .entry(token_id)
                .or_insert_with(HashMap::new)
                .insert(spender_principal, approval_info);
        });
        
        // Record the approval in the transaction log
        let _transaction_id = record_transaction("approve", token_id, caller_principal, spender_principal, 
                                               arg.memo, "token_approval".to_string());
        
        Ok(timestamp)
    }).collect()
}

#[update]
fn icrc37_approve_collection(args: ApprovalCollectionArgs) -> Result<u64, TransferError> {
    let caller_principal = caller();
    let spender_principal = args.spender.owner;
    
    // Check for self-approval (unnecessary but could be problematic)
    if caller_principal == spender_principal {
        return Err(TransferError::GenericError {
            error_code: Nat::from(1u8),
            message: "Self-approval is unnecessary".to_string(),
        });
    }
    
    // Record timestamp
    let timestamp = time();
    
    // Create a dummy approval info (token_id is not relevant for collection approval)
    let approval_info = ApprovalInfo {
        spender: spender_principal,
        token_id: 0, // Not used for collection approval
        expires_at: args.expires_at,
        created_at: timestamp,
    };
    
    // Add to collection approvals
    COLLECTION_APPROVALS.with(|approvals| {
        approvals.borrow_mut()
            .entry(caller_principal)
            .or_insert_with(HashMap::new)
            .insert(spender_principal, approval_info);
    });
    
    // Record the collection approval in the transaction log - using 0 as token_id for collection approval
    let _transaction_id = record_transaction("approve", 0, caller_principal, spender_principal, 
                                           args.memo, "collection_approval".to_string());
    
    Ok(timestamp)
}

#[query]
fn icrc37_is_approved(spender: Account, from: Account, token_id: u64) -> bool {
    let spender_principal = spender.owner;
    let from_principal = from.owner;
    
    // Check token-specific approval
    let token_approved = TOKEN_APPROVALS.with(|approvals| {
        approvals.borrow().get(&token_id)
            .and_then(|spender_map| spender_map.get(&spender_principal))
            .map(|approval_info| {
                // Check if approval has expired
                match approval_info.expires_at {
                    Some(expires_at) => expires_at > time(),
                    None => true, // No expiration means it's valid
                }
            })
            .unwrap_or(false)
    });
    
    if token_approved {
        return true;
    }
    
    // Check collection-wide approval
    COLLECTION_APPROVALS.with(|approvals| {
        approvals.borrow().get(&from_principal)
            .and_then(|spender_map| spender_map.get(&spender_principal))
            .map(|approval_info| {
                // Check if approval has expired
                match approval_info.expires_at {
                    Some(expires_at) => expires_at > time(),
                    None => true, // No expiration means it's valid
                }
            })
            .unwrap_or(false)
    })
}

#[update]
fn icrc37_transfer_from(args: Vec<TransferFromArgs>) -> Vec<Result<u64, TransferError>> {
    args.into_iter().map(|arg| {
        let caller_principal = caller();
        let token_id = arg.token_id;
        let from_principal = arg.from.owner;
        let to_principal = arg.to.owner;
        
        // Verify token exists
        let mut nft = match NFTS.with(|nfts| nfts.borrow().get(&token_id).cloned()) {
            Some(nft) => nft,
            None => return Err(TransferError::NotFound),
        };
        
        // Check that the from account owns the token
        if nft.owner != from_principal {
            return Err(TransferError::Unauthorized);
        }
        
        // Check if caller is approved for this token or collection
        let is_approved = icrc37_is_approved(
            Account { owner: caller_principal, subaccount: None },
            Account { owner: from_principal, subaccount: None },
            token_id
        );
        
        if !is_approved {
            return Err(TransferError::Unauthorized);
        }
        
        // Record timestamp
        let timestamp = time();
        
        // Update token owner and transfer history
        nft.owner = to_principal;
        nft.transfer_history.push(TransferRecord {
            from: from_principal,
            to: to_principal,
            timestamp,
        });
        
        // Update storage
        NFTS.with(|nfts| {
            nfts.borrow_mut().insert(token_id, nft);
        });
        
        // Update old owner's records
        OWNER_TOKENS.with(|owner_tokens| {
            let mut tokens = owner_tokens.borrow_mut();
            if let Some(token_vec) = tokens.get_mut(&from_principal) {
                token_vec.retain(|&id| id != token_id);
            }
        });
        
        // Update new owner's records
        OWNER_TOKENS.with(|owner_tokens| {
            let mut tokens = owner_tokens.borrow_mut();
            tokens.entry(to_principal)
                .or_insert_with(Vec::new)
                .push(token_id);
        });
        
        // Remove the token approval since it's been used
        TOKEN_APPROVALS.with(|approvals| {
            if let Some(spender_map) = approvals.borrow_mut().get_mut(&token_id) {
                spender_map.remove(&caller_principal);
            }
        });
        
        // Record the transfer in the transaction log
        let _transaction_id = record_transaction("transfer", token_id, from_principal, to_principal, 
                                               arg.memo, "transfer_from".to_string());
        
        Ok(timestamp)
    }).collect()
}

// Helper function to record transactions in the log
fn record_transaction(
    kind: &str, 
    token_id: u64, 
    from: Principal, 
    to: Principal, 
    memo: Option<Vec<u8>>, 
    operation: String
) -> u64 {
    let transaction_id = TRANSACTION_ID_COUNTER.with(|counter| {
        let id = *counter.borrow();
        *counter.borrow_mut() += 1;
        id
    });
    
    let timestamp = time();
    
    let transaction = Transaction {
        kind: kind.to_string(),
        timestamp,
        token_id,
        from,
        to,
        memo,
        operation,
        transaction_id,
    };
    
    TRANSACTIONS.with(|txs| {
        txs.borrow_mut().push(transaction);
    });
    
    transaction_id
}


// ==== TESTING FUNCTIONS ====

// Get the caller's principal ID - useful for testing
#[query]
fn whoami() -> Principal {
    caller()
}

// Add the caller as a system admin - only for testing purposes
#[update]
fn make_me_admin() -> Result<(), String> {
    let caller_principal = caller();
    
    // Check if already an admin to avoid error messages
    if is_admin(caller_principal) {
        return Ok(());
    }
    
    // Add caller as a system admin
    ADMINS.with(|admins| {
        admins.borrow_mut().insert(caller_principal, AdminType::System);
    });
    
    Ok(())
}

// ==== ADMIN AND WHITELIST FUNCTIONS ====

#[update]
fn add_admin(user: Principal, admin_type: AdminType) -> Result<(), String> {
    let caller = caller();
    
    // Only system admins can add new admins
    if !is_system_admin(caller) {
        return Err("Unauthorized: Only system admins can add new admins".to_string());
    }
    
    ADMINS.with(|admins| {
        admins.borrow_mut().insert(user, admin_type);
    });
    
    // Also add to whitelist automatically
    WHITELIST.with(|whitelist| {
        whitelist.borrow_mut().insert(user, true);
    });
    
    Ok(())
}

#[update]
fn remove_admin(user: Principal) -> Result<(), String> {
    let caller = caller();
    
    // Check if caller is a system admin
    if !is_system_admin(caller) {
        return Err("Unauthorized: Only system admins can remove admins".to_string());
    }
    
    // Cannot remove yourself if you're the only system admin
    if user == caller && count_system_admins() <= 1 {
        return Err("Cannot remove the last system admin".to_string());
    }
    
    // Remove the admin
    ADMINS.with(|admins| {
        admins.borrow_mut().remove(&user);
    });
    
    Ok(())
}

#[query]
fn get_admins() -> Vec<Admin> {
    ADMINS.with(|admins| {
        admins.borrow()
            .iter()
            .map(|(owner, admin_type)| {
                Admin {
                    owner: *owner,
                    admin_type: admin_type.clone(),
                }
            })
            .collect()
    })
}

#[query]
fn is_admin_type(user: Principal, required_type: AdminType) -> bool {
    ADMINS.with(|admins| {
        admins.borrow().get(&user) == Some(&required_type)
    })
}

#[update]
fn add_to_whitelist(user: Principal) -> Result<(), String> {
    let caller = caller();
    
    if !is_admin(caller) {
        return Err("Unauthorized: Only admins can add users to whitelist".to_string());
    }
    
    WHITELIST.with(|whitelist| {
        whitelist.borrow_mut().insert(user, true);
    });
    
    Ok(())
}

#[update]
fn remove_from_whitelist(user: Principal) -> Result<(), String> {
    let caller = caller();
    
    if !is_admin(caller) {
        return Err("Unauthorized: Only admins can remove users from whitelist".to_string());
    }
    
    WHITELIST.with(|whitelist| {
        whitelist.borrow_mut().remove(&user);
    });
    
    Ok(())
}

#[query]
fn is_whitelisted(user: Principal) -> bool {
    WHITELIST.with(|whitelist| {
        whitelist.borrow().get(&user).is_some()
    })
}

// Helper functions for admin checks
fn is_admin(user: Principal) -> bool {
    ADMINS.with(|admins| {
        admins.borrow().contains_key(&user)
    })
}

fn is_system_admin(user: Principal) -> bool {
    ADMINS.with(|admins| {
        admins.borrow().get(&user) == Some(&AdminType::System)
    })
}

fn is_functional_admin(user: Principal) -> bool {
    ADMINS.with(|admins| {
        admins.borrow().get(&user).is_some()
    })
}

/// Helper function to check if data is hex-encoded
fn is_hex_encoded(data: &Vec<u8>) -> bool {
    // Check if data matches common hex patterns
    if data.len() > 2 {
        // Common SVG hex pattern starts with '<' and then has a hex digit sequence
        if data[0] == b'<' && data[1] as char == '3' && data[2] as char == 'f' {
            return true;
        }
    }
    false
}

/// Helper function to decode hex-encoded data
fn decode_hex(hex_data: &Vec<u8>) -> Result<Vec<u8>, String> {
    // First check if it's already valid UTF-8 and starts with an XML declaration
    // This would indicate it's already properly formatted SVG
    if let Ok(s) = String::from_utf8(hex_data.clone()) {
        if s.starts_with("<?xml") || s.starts_with("<svg") {
            // This is already properly formatted SVG - return as is
            return Ok(hex_data.clone());
        }
    }
    
    // Check if it's base64 encoded
    if is_base64(hex_data) {
        return decode_base64(hex_data);
    }
    
    // Convert bytes to a string for hex processing
    let hex_str = match String::from_utf8(hex_data.clone()) {
        Ok(s) => s,
        Err(_) => return Err("Invalid UTF-8 in hex data".to_string()),
    };
    
    // Remove any whitespace
    let hex_str = hex_str.trim();
    
    // Check if the string has the "\" prefix used in canister calls
    let hex_str = if hex_str.starts_with("\\x") {
        &hex_str[2..]
    } else if hex_str.starts_with("\\u{") && hex_str.ends_with("}") {
        &hex_str[3..hex_str.len() - 1]
    } else {
        hex_str
    };
    
    // Now decode the hex string
    (0..hex_str.len())
        .step_by(2)
        .map(|i| {
            if i + 2 <= hex_str.len() {
                let byte_str = &hex_str[i..i + 2];
                u8::from_str_radix(byte_str, 16).map_err(|e| e.to_string())
            } else {
                Err("Odd number of digits in hex string".to_string())
            }
        })
        .collect()
}

// Helper function to check if data appears to be base64 encoded
fn is_base64(data: &[u8]) -> bool {
    // Convert to a UTF-8 string
    if let Ok(s) = String::from_utf8(data.to_vec()) {
        // Check if it looks like base64: starts with reasonable characters and possibly ends with = padding
        let valid_chars = s.chars().all(|c| {
            (c >= 'A' && c <= 'Z') || 
            (c >= 'a' && c <= 'z') || 
            (c >= '0' && c <= '9') || 
            c == '+' || c == '/' || c == '='
        });
        
        // Consider it base64 if it has valid chars and reasonable length
        return valid_chars && s.len() > 8;
    }
    false
}

// Helper function to decode base64-encoded data
fn decode_base64(base64_data: &[u8]) -> Result<Vec<u8>, String> {
    // First convert to a UTF-8 string
    let base64_str = match String::from_utf8(base64_data.to_vec()) {
        Ok(s) => s,
        Err(_) => return Err("Invalid UTF-8 in base64 string".to_string()),
    };
    
    // Decode base64 using simple implementation
    // This is a basic implementation and could be replaced with a library
    let decoded = base64_decode(&base64_str);
    Ok(decoded)
}

// Basic base64 decoding implementation
fn base64_decode(input: &str) -> Vec<u8> {
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits_left = 0;
    
    for c in input.chars().filter(|&c| c != '\n' && c != '\r' && c != ' ' && c != '\t') {
        if c == '=' {
            // Padding character, skip
            continue;
        }
        
        if let Some(val) = alphabet.find(c) {
            buf = (buf << 6) | val as u32;
            bits_left += 6;
            
            if bits_left >= 8 {
                bits_left -= 8;
                result.push((buf >> bits_left) as u8);
                buf &= (1 << bits_left) - 1;
            }
        } else {
            // Invalid character, ignore
        }
    }
    
    result
}

// Helper to count system admins
fn count_system_admins() -> usize {
    ADMINS.with(|admins| {
        admins.borrow()
            .iter()
            .filter(|(_, admin_type)| **admin_type == AdminType::System)
            .count()
    })
}

// ==== MINTING FUNCTIONS ====

#[update]
fn mint() -> Result<(u64, NFTMetadata), String> {
    let caller = caller();
    
    if !is_whitelisted(caller) {
        return Err("Unauthorized: User is not on the whitelist".to_string());
    }
    
    // Find all unminted SVG files in assets
    let svg_assets = ASSETS.with(|assets| {
        let assets_ref = assets.borrow();
        let minted = MINTED_ASSETS.with(|minted| minted.borrow().clone());
        
        assets_ref.iter()
            .filter(|(key, asset)| {
                // Only include SVGs that haven't been minted yet
                asset.content_type == "image/svg+xml" && !minted.contains_key(&key.to_string())
            })
            .map(|(key, asset)| (key.clone(), asset.clone()))
            .collect::<Vec<(String, Asset)>>()
    });
    
    // Check if we have any unminted SVG files
    if svg_assets.is_empty() {
        return Err("All SVG assets have already been minted. No more NFTs available.".to_string());
    }
    
    // Select a random SVG file from the unminted ones
    let current_time = time();
    let random_index = (current_time as usize) % svg_assets.len();
    let (selected_key, _selected_asset) = &svg_assets[random_index];
    
    // Mark this asset as minted
    MINTED_ASSETS.with(|minted| {
        minted.borrow_mut().insert(selected_key.clone(), true);
    });
    
    // Get collection details for metadata
    let collection_details = COLLECTION_DETAILS.with(|details| details.borrow().clone());
    
    // Generate SVG URL with full path including canister ID using the dynamic base URL
    let canister_id = ic_cdk::id();
    let svg_url = format!("{}/asset/{}?canisterId={}", collection_details.base_url, selected_key, canister_id);
    
    // Create metadata using collection info and selected SVG
    let metadata = NFTMetadata {
        name: format!("{} #{}", collection_details.name, TOKEN_ID_COUNTER.with(|counter| *counter.borrow())),
        description: collection_details.description.clone(),
        image_url: svg_url.clone(),
        content_url: Some(svg_url),
        content_type: Some("image/svg+xml".to_string()),
        properties: None,
        is_layered: false,
        svg_id: None,
        layers: None,
    };
    
    let token_id = TOKEN_ID_COUNTER.with(|counter| {
        let current = *counter.borrow();
        *counter.borrow_mut() = current + 1;
        current
    });
    
    // Clone the metadata so we can return it later
    let metadata_clone = metadata.clone();
    
    let nft = NFT {
        token_id,
        owner: caller,
        metadata,
        created_at: time(),
        transfer_history: Vec::new(),
    };
    
    // Store the NFT
    NFTS.with(|nfts| {
        nfts.borrow_mut().insert(token_id, nft);
    });
    
    // Update owner records
    OWNER_TOKENS.with(|owner_tokens| {
        let mut tokens = owner_tokens.borrow_mut();
        tokens.entry(caller)
            .or_insert_with(Vec::new)
            .push(token_id);
    });
    
    // Record the mint in the transaction log
    let _transaction_id = record_transaction("mint", token_id, ic_cdk::api::id(), caller, 
                                           None, "mint_nft".to_string());
    
    // Return both the token ID and the metadata
    Ok((token_id, metadata_clone))
}

// ==== CUSTOM QUERY FUNCTIONS ====

#[query]
fn get_nft(token_id: u64) -> Option<NFT> {
    NFTS.with(|nfts| {
        nfts.borrow().get(&token_id).cloned()
    })
}

#[query]
fn get_user_nfts(user: Principal) -> Vec<NFT> {
    OWNER_TOKENS.with(|owner_tokens| {
        let tokens = owner_tokens.borrow();
        if let Some(token_ids) = tokens.get(&user) {
            return NFTS.with(|nfts| {
                let nfts_map = nfts.borrow();
                token_ids.iter()
                    .filter_map(|id| nfts_map.get(id).cloned())
                    .collect()
            });
        }
        Vec::new()
    })
}

#[query]
fn get_transaction_history(token_id: u64) -> Vec<TransferRecord> {
    NFTS.with(|nfts| {
        nfts.borrow()
            .get(&token_id)
            .map(|nft| nft.transfer_history.clone())
            .unwrap_or_default()
    })
}

#[query]
fn get_collection_info() -> Vec<(String, Value)> {
    icrc7_collection_metadata()
}

// Dedicated method to update the base URL - admin only
#[update]
fn update_base_url(new_base_url: String) -> Result<(), String> {
    let caller = caller();
    
    // Check if caller is an admin (either type)
    if !is_admin(caller) {
        return Err("Unauthorized: Only admins can update the base URL".to_string());
    }
    
    // Update the base URL
    COLLECTION_DETAILS.with(|details| {
        let mut details_ref = details.borrow_mut();
        details_ref.base_url = new_base_url;
    });
    
    Ok(())
}

// Collection update method - admin only
#[update]
fn update_collection_details(args: UpdateCollectionDetailsArgs) -> Result<(), String> {
    let caller = caller();
    
    // Check if caller is an admin (either type)
    if !is_admin(caller) {
        return Err("Unauthorized: Only admins can update collection details".to_string());
    }
    
    // Check if we're trying to update max_supply and if minting has started
    if args.max_supply.is_some() {
        let nft_count = NFTS.with(|nfts| nfts.borrow().len());
        if nft_count > 0 {
            return Err("Cannot update max supply after minting has started".to_string());
        }
    }
    
    // Update collection details
    COLLECTION_DETAILS.with(|details| {
        let mut details_ref = details.borrow_mut();
        
        if let Some(name) = args.name {
            details_ref.name = name;
        }
        
        if let Some(symbol) = args.symbol {
            details_ref.symbol = symbol;
        }
        
        if let Some(description) = args.description {
            details_ref.description = description;
        }
        
        if let Some(max_supply) = args.max_supply {
            details_ref.max_supply = Some(max_supply);
        }
        
        if let Some(base_url) = args.base_url {
            details_ref.base_url = base_url;
        }
    });
    
    Ok(())
}

// ==== ASSET MANAGEMENT FUNCTIONS ====

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct Asset {
    key: String,
    content_type: String,
    data: Vec<u8>,
    description: Option<String>,
    uploaded_by: Principal,
    created_at: u64,
    modified_at: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct AssetMetadata {
    key: String,
    content_type: String,
    size: usize,
    created_at: u64,
    modified_at: u64,
    description: Option<String>,
    uploaded_by: Principal,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct UploadArgs {
    key: Option<String>,          // Optional, will be generated if not provided
    content_type: String,         // MIME type (e.g., "image/png")
    data: Vec<u8>,               // Binary content
    description: Option<String>,  // Optional description stored in metadata
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct DownloadResult {
    data: Vec<u8>,
    content_type: String,
    metadata: AssetMetadata,
}

// System functions for stable storage
#[pre_upgrade]
fn pre_upgrade() {
    // Save all state to stable storage
    TOKEN_ID_COUNTER.with(|counter| {
        NFTS.with(|nfts| {
            OWNER_TOKENS.with(|owner_tokens| {
                WHITELIST.with(|whitelist| {
                    ADMINS.with(|admins| {
                        COLLECTION_DETAILS.with(|details| {
                            ASSETS.with(|assets| {
                                MINTED_ASSETS.with(|minted| {
                                    TOKEN_APPROVALS.with(|token_approvals| {
                                        COLLECTION_APPROVALS.with(|collection_approvals| {
                                            TRANSACTIONS.with(|transactions| {
                                                TRANSACTION_ID_COUNTER.with(|tx_counter| {
                                                    ARCHIVES.with(|archives| {
                                                        
                                                        // Clone all the values
                                                        let counter_ref = *counter.borrow();
                                                        let nfts_ref = nfts.borrow().clone();
                                                        let owner_tokens_ref = owner_tokens.borrow().clone();
                                                        let whitelist_ref = whitelist.borrow().clone();
                                                        let admins_ref = admins.borrow().clone();
                                                        let details_ref = details.borrow().clone();
                                                        let assets_ref = assets.borrow().clone();
                                                        let minted_ref = minted.borrow().clone();
                                                        let token_approvals_ref = token_approvals.borrow().clone();
                                                        let collection_approvals_ref = collection_approvals.borrow().clone();
                                                        let transactions_ref = transactions.borrow().clone();
                                                        let tx_counter_ref = *tx_counter.borrow();
                                                        let archives_ref = archives.borrow().clone();
                                                        
                                                        // Save everything to stable storage
                                                        ic_cdk::storage::stable_save((
                                                            counter_ref,
                                                            nfts_ref,
                                                            owner_tokens_ref,
                                                            whitelist_ref,
                                                            admins_ref,
                                                            details_ref,
                                                            assets_ref,
                                                            minted_ref,
                                                            token_approvals_ref,
                                                            collection_approvals_ref,
                                                            transactions_ref,
                                                            tx_counter_ref,
                                                            archives_ref,
                                                        ))
                                                        .unwrap();
                                                        
                                                        ic_cdk::println!("Pre-upgrade: Saved all state to stable storage");
                                                    })
                                                })
                                            })
                                        })
                                    })
                                })
                            })
                        })
                    })
                })
            })
        })
    });
}

#[post_upgrade]
fn post_upgrade() {
    // Try to restore full state (new format)
    let full_restore_result = ic_cdk::storage::stable_restore::<(
        u64, // TOKEN_ID_COUNTER
        HashMap<u64, NFT>, // NFTS
        HashMap<Principal, Vec<u64>>, // OWNER_TOKENS
        HashMap<Principal, bool>, // WHITELIST
        HashMap<Principal, AdminType>, // ADMINS
        CollectionDetails, // COLLECTION_DETAILS
        HashMap<String, Asset>, // ASSETS
        HashMap<String, bool>, // MINTED_ASSETS
        HashMap<u64, HashMap<Principal, ApprovalInfo>>, // TOKEN_APPROVALS
        HashMap<Principal, HashMap<Principal, ApprovalInfo>>, // COLLECTION_APPROVALS
        Vec<Transaction>, // TRANSACTIONS
        u64, // TRANSACTION_ID_COUNTER
        Vec<ArchiveInfo>, // ARCHIVES
    )>();

    if let Ok((token_id_counter, nfts, owner_tokens, whitelist, admins, collection_details, 
               assets, minted_assets, token_approvals, collection_approvals, 
               transactions, tx_counter, archives)) = full_restore_result {
        
        // Save stats before moving variables
        let nfts_count = nfts.len();
        let owners_count = owner_tokens.len();
        let transactions_count = transactions.len();
        
        // Restore all data
        TOKEN_ID_COUNTER.with(|c| {
            *c.borrow_mut() = token_id_counter;
        });
        
        NFTS.with(|n| {
            *n.borrow_mut() = nfts;
        });
        
        OWNER_TOKENS.with(|o| {
            *o.borrow_mut() = owner_tokens;
        });
        
        WHITELIST.with(|w| {
            *w.borrow_mut() = whitelist;
        });
        
        ADMINS.with(|a| {
            *a.borrow_mut() = admins;
        });
        
        COLLECTION_DETAILS.with(|c| {
            *c.borrow_mut() = collection_details;
        });
        
        ASSETS.with(|a| {
            *a.borrow_mut() = assets;
        });
        
        MINTED_ASSETS.with(|m| {
            *m.borrow_mut() = minted_assets;
        });
        
        TOKEN_APPROVALS.with(|t| {
            *t.borrow_mut() = token_approvals;
        });
        
        COLLECTION_APPROVALS.with(|c| {
            *c.borrow_mut() = collection_approvals;
        });
        
        TRANSACTIONS.with(|t| {
            *t.borrow_mut() = transactions;
        });
        
        TRANSACTION_ID_COUNTER.with(|c| {
            *c.borrow_mut() = tx_counter;
        });
        
        ARCHIVES.with(|a| {
            *a.borrow_mut() = archives;
        });
        
        ic_cdk::println!("Post-upgrade: Successfully restored all state");
        ic_cdk::println!("Stats: {} NFTs, {} owners, {} transactions", 
                         nfts_count, owners_count, transactions_count);
        return;
    }
    
    // Try to restore from previous format (with just assets, admins, minted_assets)
    if let Ok((assets, admins, minted_assets)) = ic_cdk::storage::stable_restore::<(
        HashMap<String, Asset>,
        HashMap<Principal, AdminType>,
        HashMap<String, bool>,
    )>() {
        // Restore the data we have
        ASSETS.with(|a| {
            *a.borrow_mut() = assets;
        });
        
        ADMINS.with(|a| {
            *a.borrow_mut() = admins;
        });
        
        MINTED_ASSETS.with(|m| {
            *m.borrow_mut() = minted_assets;
        });
        
        ic_cdk::println!("Post-upgrade: Restored partial state (legacy format)");
        ic_cdk::println!("IMPORTANT: Only assets, admins, and minted assets were restored. Other data initialized as empty.");
        return;
    }
    
    // Try backward compatibility - older version without minted assets tracking
    if let Ok((assets, admins)) = ic_cdk::storage::stable_restore::<(
        HashMap<String, Asset>,
        HashMap<Principal, AdminType>,
    )>() {
        // Restore the data we have
        ASSETS.with(|a| {
            *a.borrow_mut() = assets;
        });
        
        ADMINS.with(|a| {
            *a.borrow_mut() = admins;
        });
        
        ic_cdk::println!("Post-upgrade: Restored partial state (older legacy format)");
        ic_cdk::println!("IMPORTANT: Only assets and admins were restored. Other data initialized as empty.");
        return;
    }
    
    // Handle oldest backward compatibility - old format had only assets
    if let Ok((assets,)) = ic_cdk::storage::stable_restore::<(HashMap<String, Asset>,)>() {
        // Restore the data we have
        ASSETS.with(|a| {
            *a.borrow_mut() = assets;
        });
        
        ic_cdk::println!("Post-upgrade: Restored only assets (oldest legacy format)");
        ic_cdk::println!("IMPORTANT: Only assets were restored. Other data initialized as empty.");
        return;
    }
    
    ic_cdk::println!("Post-upgrade: No data restored during upgrade. Initializing with empty state.");
}

// Helper function to get asset metadata
fn get_asset_metadata(key: &str) -> Option<AssetMetadata> {
    ASSETS.with(|assets| {
        let assets_ref = assets.borrow();
        let asset = assets_ref.get(key)?;
        
        Some(AssetMetadata {
            key: key.to_string(),
            content_type: asset.content_type.clone(),
            size: asset.data.len(),
            created_at: asset.created_at,
            modified_at: asset.modified_at,
            description: asset.description.clone(),
            uploaded_by: asset.uploaded_by,
        })
    })
}

// Upload a file (PNG or other) - admin only
#[update]
fn upload(args: UploadArgs) -> Result<String, String> {
    let caller = caller();
    
    // Check if caller is an admin (either type)
    if !is_admin(caller) {
        return Err("Unauthorized: Only admins can upload assets".to_string());
    }
    
    // Generate key if not provided (default to png for backward compatibility)
    let key = match args.key {
        Some(key) => key,
        None => {
            let extension = if args.content_type == "image/png" { "png" } 
                         else { args.content_type.split("/").last().unwrap_or("bin") };
            format!("asset-{}.{}", time(), extension)
        }
    };
    

    // Process SVG content if applicable
    let processed_data = if args.content_type == "image/svg+xml" {
        // For SVG files, always treat as hex-encoded and decode
        match decode_hex(&args.data) {
            Ok(decoded) => decoded,
            Err(_) => {
                // If decoding fails, use original data
                // This provides a fallback for direct UTF-8 uploads
                args.data.clone()
            }
        }
    } else {
        args.data.clone()
    };
    
    // Get a copy of the SVG content as a string if possible
    let content_as_string = if args.content_type == "image/svg+xml" {
        match String::from_utf8(processed_data.clone()) {
            Ok(text) => text,
            Err(_) => format!("Invalid SVG content for: {}", key)
        }
    } else {
        format!("Uploaded binary file with key: {}", key)
    };
    
    // Create the asset with processed data
    let asset = Asset {
        key: key.clone(),
        content_type: args.content_type,
        data: processed_data,  // Use the processed data (decoded if needed)
        description: args.description,
        uploaded_by: caller,
        created_at: time(),
        modified_at: time(),
    };
    
    // Store the asset
    ASSETS.with(|assets| {
        assets.borrow_mut().insert(key.clone(), asset);
    });
    
    // Record the upload in the transaction log
    let _transaction_id = record_transaction("upload", 0, caller, ic_cdk::api::id(), 
                                           None, format!("upload_file:{}", key));
    
    // Return the content as a string
    Ok(content_as_string)
}

// Download a file 
#[query]
fn download(key: String) -> Result<DownloadResult, String> {
    // No need to check caller for downloads

    // Retrieve the file
    ASSETS.with(|assets| {
        let assets_ref = assets.borrow();
        let asset = assets_ref.get(&key)
            .ok_or_else(|| format!("Asset with key '{}' not found", key))?;
        
        // Get metadata
        let metadata = get_asset_metadata(&key)
            .ok_or_else(|| "Failed to get asset metadata".to_string())?;
        
        // Check if it's an SVG file - if so, return it as text content
        if asset.content_type == "image/svg+xml" {
            // For SVG, first check if the data is hex-encoded
            let svg_data = if is_hex_encoded(&asset.data) {
                // Decode the hex content to get the raw binary
                match decode_hex(&asset.data) {
                    Ok(decoded) => decoded,
                    Err(_) => return Err("Failed to decode hex-encoded SVG content".to_string()),
                }
            } else {
                // Not hex-encoded, use as is
                asset.data.clone()
            };
            
            // Now convert the binary data to UTF-8 text
            let svg_text = match String::from_utf8(svg_data.clone()) {
                Ok(text) => text,
                Err(_) => return Err("Failed to decode SVG content as UTF-8 text".to_string()),
            };
            
            // Return the SVG content directly as a string
            return Ok(DownloadResult {
                data: svg_text.into_bytes(), // Still need to convert to bytes for the Result type
                content_type: asset.content_type.clone(),
                metadata,
            });
        }
        
        // For non-SVG files, return binary data as before
        Ok(DownloadResult {
            data: asset.data.clone(),
            content_type: asset.content_type.clone(),
            metadata,
        })
    })
}

// List all assets - admin only
#[query]
fn list_assets() -> Result<Vec<AssetMetadata>, String> {
    // We don't need caller for this query function
    
    // Get all asset metadata
    ASSETS.with(|assets| {
        let assets_ref = assets.borrow();
        
        Ok(assets_ref.keys()
            .filter_map(|key| get_asset_metadata(key))
            .collect())
    })
}

#[query]
fn get_asset_info(key: String) -> Option<AssetMetadata> {
    get_asset_metadata(&key)
}

// Enhanced HTTP handler for asset serving and downloading with /asset/ path pattern
#[query]
fn http_request(request: HttpRequest) -> HttpResponse {
    // Parse query parameters if any
    let url_parts: Vec<&str> = request.url.split('?').collect();
    let path = url_parts[0];
    
    // Extract query parameters
    let query_params = if url_parts.len() > 1 {
        url_parts[1].split('&')
            .filter_map(|param| {
                let parts: Vec<&str> = param.split('=').collect();
                if parts.len() == 2 {
                    Some((parts[0].to_string(), parts[1].to_string()))
                } else {
                    None
                }
            })
            .collect::<HashMap<String, String>>()
    } else {
        HashMap::new()
    };
    
    // Check if this is a download request
    let is_download = query_params.get("download").map_or(false, |v| v == "true");
    
    // Remove leading slash if present
    let clean_path = if path.starts_with("/") { &path[1..] } else { path };
    
    // Check if this is an asset request with the pattern /asset/filename.ext
    let asset_prefix = "asset/";
    let key = if clean_path.starts_with(asset_prefix) {
        // Extract the filename from /asset/filename.ext
        &clean_path[asset_prefix.len()..]
    } else {
        // For other paths, use the path as is (legacy support)
        clean_path
    };
    
    // Default CORS headers for all responses
    let mut cors_headers = vec![
        ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
        ("Access-Control-Allow-Methods".to_string(), "GET, OPTIONS".to_string()),
        ("Access-Control-Allow-Headers".to_string(), "Content-Type".to_string()),
    ];
    
    // Handle OPTIONS requests for CORS preflight
    if request.method == "OPTIONS" {
        return HttpResponse {
            status_code: 200,
            headers: cors_headers,
            body: vec![],
            streaming_strategy: None,
        };
    }
    
    // Try to get the asset
    match ASSETS.with(|assets| assets.borrow().get(key).cloned()) {
        Some(asset) => {
            // Check if the asset requires decoding (SVG or PNG)
            let needs_decoding = asset.content_type == "image/svg+xml" || 
                                 asset.content_type == "image/png";
                
            if needs_decoding {
                // For files requiring decoding, try multiple approaches
                let decoded_data = if is_base64(&asset.data) {
                    // Try to decode as base64
                    match decode_base64(&asset.data) {
                        Ok(decoded) => decoded,
                        Err(_) => asset.data.clone(), // Fallback to original data if decoding fails
                    }
                } else {
                    // Try hex decoding as fallback
                    match decode_hex(&asset.data) {
                        Ok(decoded) => decoded,
                        Err(_) => asset.data.clone(), // Fallback to original data if decoding fails
                    }
                };
                
                // For SVG files, we need to convert to text
                if asset.content_type == "image/svg+xml" {
                    // Now convert the processed binary data to UTF-8 text
                    let svg_content = match String::from_utf8(decoded_data) {
                        Ok(text) => text,
                        Err(_) => "<svg>Error: Could not decode SVG content</svg>".to_string(),
                    };
                    
                    // Set content type to SVG
                    cors_headers.push(("Content-Type".to_string(), "image/svg+xml; charset=UTF-8".to_string()));
                    
                    // Add content disposition header for downloads
                    if is_download {
                        cors_headers.push(("Content-Disposition".to_string(), 
                                         format!("attachment; filename=\"{}\"", key)));
                    }
                    
                    return HttpResponse {
                        status_code: 200,
                        headers: cors_headers,
                        body: svg_content.into_bytes(),
                        streaming_strategy: None,
                    };
                } else {
                    // For PNG and other binary files that need decoding
                    cors_headers.push(("Content-Type".to_string(), asset.content_type.clone()));
                    
                    // Add content disposition header for downloads
                    if is_download {
                        cors_headers.push(("Content-Disposition".to_string(), 
                                         format!("attachment; filename=\"{}\"", key)));
                    }
                    
                    // Add content length header
                    cors_headers.push(("Content-Length".to_string(), 
                                     decoded_data.len().to_string()));
                    
                    return HttpResponse {
                        status_code: 200,
                        headers: cors_headers,
                        body: decoded_data,
                        streaming_strategy: None,
                    };
                }
            }
            
            // For non-SVG files, set the proper content type
            cors_headers.push(("Content-Type".to_string(), asset.content_type.clone()));
            
            // Add content disposition header for downloads
            if is_download {
                cors_headers.push(("Content-Disposition".to_string(), 
                                 format!("attachment; filename=\"{}\"", key)));
            }
            
            // Add content length header
            cors_headers.push(("Content-Length".to_string(), 
                             asset.data.len().to_string()));
            
            // For other file types, return as binary data
            HttpResponse {
                status_code: 200,
                headers: cors_headers,
                body: asset.data,
                streaming_strategy: None,
            }
        },
        None => {
            // Asset not found
            cors_headers.push(("Content-Type".to_string(), "text/html; charset=UTF-8".to_string()));
            
            let html = format!("\
<!DOCTYPE html>
<html>
<head>
    <title>404 - Asset Not Found</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; text-align: center; }}
        h1 {{ color: #d9534f; }}
        p {{ color: #333; }}
        a {{ color: #0066cc; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <h1>404 - Asset Not Found</h1>
    <p>The requested asset '{}' could not be found.</p>
    <p><a href=\"/\">Return to asset list</a></p>
</body>
</html>", key);
            
            HttpResponse {
                status_code: 404,
                headers: cors_headers,
                body: html.into_bytes(),
                streaming_strategy: None,
            }
        }
    }
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct HttpRequest {
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    certificate_version: Option<u16>,
}

#[derive(Clone, Debug, CandidType, Serialize)]
struct HttpResponse {
    status_code: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    streaming_strategy: Option<StreamingStrategy>,
}

#[derive(Clone, Debug, CandidType, Serialize)]
enum StreamingStrategy {
    Callback { callback: StreamingCallback, token: StreamingCallbackToken },
}

#[derive(Clone, Debug, CandidType, Serialize)]
struct StreamingCallback {
    function: [u8; 16], // Function ID
    token: StreamingCallbackToken,
}

#[derive(Clone, Debug, CandidType, Deserialize, Serialize)]
struct StreamingCallbackToken {
    key: String,
    content_encoding: String,
    index: usize,
    sha256: Option<[u8; 32]>,
}
