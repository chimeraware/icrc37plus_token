// Backend canister ID (updated with deployed canister)
export const CANISTER_ID = 'bkyz2-fmaaa-aaaaa-qaaaq-cai';

// Internet Identity canister IDs
export const II_CANISTER_IDS = {
  local: 'be2us-64aaa-aaaaa-qaabq-cai', // Local replica II canister ID
  ic: 'rdmx6-jaaaa-aaaaa-aaadq-cai'     // Mainnet II canister ID
};

// Network configuration types
interface NetworkConfig {
  host: string;
  fetchRootKey: boolean;
}

export type NetworkType = 'local' | 'ic';

// Current network set to 'local' for local development
export const CURRENT_NETWORK: NetworkType = 'local';

// Network configuration
export const NETWORK_CONFIG: Record<NetworkType, NetworkConfig> = {
  local: {
    host: 'http://localhost:4943',
    fetchRootKey: true
  },
  ic: {
    host: 'https://mainnet.dfinity.network',
    fetchRootKey: false
  }
};

// Internet Identity configuration
export const II_CONFIG = {
  canisterId: II_CANISTER_IDS[CURRENT_NETWORK],
  host: getIIHost(CURRENT_NETWORK)
};

// Helper function to get II host with proper type checking
export function getIIHost(network: NetworkType): string {
  return network === 'local'
    ? 'http://localhost:4943/?canisterId=be2us-64aaa-aaaaa-qaabq-cai'
    : 'https://identity.ic0.app';
}

// No default export needed

// Plug wallet configuration
export const PLUG_CONFIG = {
  whitelist: [CANISTER_ID],
  host: NETWORK_CONFIG[CURRENT_NETWORK].host
};

// Get current network configuration
export function getNetworkConfig(): NetworkConfig {
  return NETWORK_CONFIG[CURRENT_NETWORK];
}
