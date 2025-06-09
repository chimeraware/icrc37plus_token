import { writable, type Writable } from 'svelte/store';
import type { Principal } from '@dfinity/principal';
import type { ActorSubclass } from '@dfinity/agent';

// Auth provider type
type AuthProviderType = 'plug' | 'ii' | null;

// Connection status and wallet connection
export const isConnecting: Writable<boolean> = writable(false);
export const isWalletConnected: Writable<boolean> = writable(false);
export const walletPrincipal: Writable<Principal | null> = writable(null);
export const authProvider: Writable<AuthProviderType> = writable(null);
export const connectionError: Writable<string | null> = writable(null);

// Feature flags
export const isPlugEnabled: Writable<boolean> = writable(false);

// Canister actor status
export const isCanisterConnected: Writable<boolean> = writable(false);
export const canisterActor: Writable<ActorSubclass<any> | null> = writable(null);

// UI state for token
export const showMintModal: Writable<boolean> = writable(false);
export const showActivityModal: Writable<boolean> = writable(false);
export const showSuccessModal: Writable<boolean> = writable(false);

// Collection info
export const collectionInfo: Writable<Record<string, any>> = writable({});
export const userNftBalance: Writable<number> = writable(0);

// Admin status
export const isAdmin: Writable<boolean> = writable(false);
