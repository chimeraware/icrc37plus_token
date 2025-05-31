
  export const idlFactory = ({ IDL }) => {
    const Account = IDL.Record({ 'owner' : IDL.Principal, 'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)) });
    const UpdateCollectionDetailsArgs = IDL.Record({
      'name' : IDL.Opt(IDL.Text),
      'symbol' : IDL.Opt(IDL.Text),
      'description' : IDL.Opt(IDL.Text),
      'max_supply' : IDL.Opt(IDL.Nat64),
      'base_url' : IDL.Opt(IDL.Text),
    });
    const NFTMetadata = IDL.Record({
      'name' : IDL.Text,
      'description' : IDL.Text,
      'image_url' : IDL.Text,
      'content_url' : IDL.Opt(IDL.Text),
      'content_type' : IDL.Opt(IDL.Text),
      'properties' : IDL.Opt(IDL.Variant({})),
      'is_layered' : IDL.Bool,
      'svg_id' : IDL.Opt(IDL.Nat64),
      'layers' : IDL.Opt(IDL.Vec(IDL.Text)),
    });
    const CollectionMetadata = IDL.Record({
      'name' : IDL.Text,
      'symbol' : IDL.Text,
      'description' : IDL.Text,
      'max_supply' : IDL.Opt(IDL.Nat64),
    });
    const Transaction = IDL.Record({
      'kind' : IDL.Text,
      'timestamp' : IDL.Nat64,
      'token_id' : IDL.Nat64,
      'from' : IDL.Principal,
      'to' : IDL.Principal,
      'memo' : IDL.Opt(IDL.Vec(IDL.Nat8)),
      'operation' : IDL.Text,
      'transaction_id' : IDL.Nat64,
    });
    const GetTransactionsRequest = IDL.Record({
      'start' : IDL.Opt(IDL.Nat64),
      'length' : IDL.Opt(IDL.Nat16),
    });
    const GetTransactionsResponse = IDL.Record({
      'transactions' : IDL.Vec(Transaction),
      'total' : IDL.Nat64,
    });
    
    return IDL.Service({
      'update_collection_details' : IDL.Func([UpdateCollectionDetailsArgs], [], []),
      'mint' : IDL.Func([], [IDL.Variant({ 'ok' : IDL.Tuple(IDL.Nat64, NFTMetadata), 'err' : IDL.Text })], []),
      'icrc7_collection_metadata' : IDL.Func([], [CollectionMetadata], ['query']),
      'icrc3_get_transactions' : IDL.Func([GetTransactionsRequest], [GetTransactionsResponse], ['query']),
    });
  };
  