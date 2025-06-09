<script>
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import { NETWORK_CONFIG, CURRENT_NETWORK, CANISTER_ID } from "$lib/config";
	import {
		isWalletConnected,
		walletPrincipal,
		isCanisterConnected,
		canisterActor,
		authProvider,
	} from "$lib/stores";
	import {
		connectToII,
		getSharedActor,
		whoami,
		checkConnection,
	} from "$lib/wallet";

	let greeting = "ICRC37+ NFT Collection";
	/** @type {string|null} */
	let diagnosticResult = null;
	/** @type {string|null} */
	let diagnosticError = null;
	/** @type {boolean} */
	let isRunningTest = false;

	onMount(async () => {
		console.log("ICRC37+ NFT Collection Frontend loaded");
		// Check if we're already connected to a wallet
		await checkConnection();
	});

	// Reactive statement to run diagnostic when wallet connection state changes
	$: if ($isWalletConnected !== undefined) {
		console.log("Wallet connection state changed:", $isWalletConnected);
		runDiagnostic();
	}

	/**
	 * Function to login with Internet Identity using the centralized auth method
	 */
	async function loginWithII() {
		try {
			console.log("Connecting to Internet Identity...");
			isRunningTest = true;
			diagnosticError = null;

			// Use the centralized connectToII method from wallet.ts
			const result = await connectToII();

			if (!result.success) {
				diagnosticError =
					result.error || "Failed to connect to Internet Identity";
			}

			// Run diagnostic to update UI with new authentication state
			await runDiagnostic();
		} catch (error) {
			console.error("Error during II login:", error);
			diagnosticError = `Error during II login: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isRunningTest = false;
		}
	}

	// Simplified function to run the whoami diagnostic using the shared actor
	async function runDiagnostic() {
		try {
			isRunningTest = true;
			diagnosticResult = null;
			diagnosticError = null;

			// Check if we're connected to a wallet
			if (!get(isWalletConnected)) {
				diagnosticError =
					"Not connected to a wallet. Please authenticate first.";
				return;
			}

			// Try to get the shared actor
			let sharedActor;
			try {
				sharedActor = await getSharedActor();
			} catch (error) {
				diagnosticError = `Failed to get actor: ${error instanceof Error ? error.message : String(error)}`;
				return;
			}

			// Call the list_assets method
			try {
				const result = await sharedActor.list_assets();
				if ('Ok' in result) {
					const assets = result.Ok;
					// Format bigint values for display and limit to first 5 assets for readability
					const assetDisplay = assets.slice(0, 5).map(asset => 
						`${asset.key} (${asset.content_type}, ${Number(asset.size).toLocaleString()} bytes)`
					).join(', ');
					
					diagnosticResult = `Found ${assets.length} assets. First 5: ${assetDisplay}${assets.length > 5 ? '...' : ''}`;
				} else if ('Err' in result) {
					diagnosticError = `Backend error: ${result.Err}`;
				} else {
					diagnosticError = 'Unexpected response format from backend';
				}
			} catch (error) {
				diagnosticError = `list_assets call failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		} catch (error) {
			diagnosticError =
				error instanceof Error ? error.message : String(error);
		} finally {
			isRunningTest = false;
		}
	}
</script>

<svelte:head>
	<title>ICRC37+ NFT Collection</title>
	<meta name="description" content="ICRC37+ NFT Collection Frontend" />
</svelte:head>

<main>
	<h1>{greeting}</h1>
	<p>ICRC37+ Diagnostics</p>

	<div class="diagnostic-panel">
		<h2>Canister Connection Test</h2>

		{#if $isWalletConnected}
			<p>✅ Connection test successful!</p>
			<p>Principal: {diagnosticResult}</p>
			<p>
				Authentication: {$isWalletConnected
					? `Authenticated with ${$authProvider === "ii" ? "Internet Identity" : "Plug Wallet"}`
					: "Anonymous"}
			</p>
			<div class="button-group">
				<button on:click={runDiagnostic}>Run test</button>
			</div>
		{:else}
			<p>Not connected to a wallet. Please authenticate first.</p>
		{/if}
	</div>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 2rem;
		max-width: 800px;
		margin: 0 auto;
	}

	h1 {
		color: #ff3e00;
		text-transform: uppercase;
		font-size: 2rem;
		font-weight: 100;
		margin-bottom: 1rem;
		text-align: center;
	}

	.diagnostic-panel {
		width: 100%;
		max-width: 600px;
		padding: 1.5rem;
		background: #f8f9fa;
		border-radius: 12px;
		border: 1px solid #e9ecef;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	h2 {
		color: #333;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error {
		text-align: center;
		color: #dc3545;
	}

	.error-message {
		background: #f8d7da;
		padding: 0.75rem;
		border-radius: 4px;
		border: 1px solid #f5c6cb;
		font-family: monospace;
		word-break: break-all;
		white-space: pre-wrap;
		max-height: 200px;
		overflow-y: auto;
	}

	.success {
		text-align: center;
		color: #28a745;
	}

	/* Basic button styling */

	button {
		background-color: #ff3e00;
		color: white;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 1rem;
		transition: background-color 0.2s;
	}

	button:hover {
		background-color: #e63900;
	}

	button:disabled {
		background-color: #6c757d;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		h1 {
			font-size: 1.5rem;
		}
	}
</style>
