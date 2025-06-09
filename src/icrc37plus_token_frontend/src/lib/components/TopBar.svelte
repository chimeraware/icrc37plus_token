<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    isWalletConnected,
    walletPrincipal,
    isCanisterConnected,
    connectionError,
    isConnecting,
    isAdmin,
    authProvider,
    isPlugEnabled
  } from '$lib/stores';
  import {
    connectToPlug,
    connectToCanister,
    forceDisconnect,
    disconnect,
    checkConnection,
    connectToII,
    getSharedActor
  } from '$lib/wallet';
  import { CANISTER_ID } from '$lib/config';

  let showConnectionMenu = false;
  let showCopiedMessage = false;
  let menuRef = null;
  let buttonRef = null;

  // Function to handle clicks outside the dropdown
  function handleClickOutside(event) {
    // Only process if menu is showing and we have references to both elements
    if (showConnectionMenu && menuRef && buttonRef) {
      // Check if the click target is neither the menu nor the button
      // Cast event.target to Node to satisfy TypeScript
      const target = event.target;
      
      if (!menuRef.contains(target) && !buttonRef.contains(target)) {
        showConnectionMenu = false;
      }
    }
  }

  onMount(async () => {
    // Check for existing wallet connection when TopBar loads
    await checkConnection();
    
    // Add click event listener to detect clicks outside the dropdown
    window.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    // Clean up the event listener when component is destroyed
    window.removeEventListener('click', handleClickOutside);
  });

  async function handleConnectWallet() {
    const result = await connectToPlug();
    if (result.success) {
      await connectToCanister();
      await checkAdminStatus();
    }
  }

  async function handleConnectII() {
    const result = await connectToII();
    if (result.success) {
      await checkAdminStatus();
    }
  }

  async function handleConnectCanister() {
    await connectToCanister();
    await checkAdminStatus();
  }

  async function handleDisconnect() {
    await forceDisconnect();
    disconnect();
    showConnectionMenu = false;
  }

  function toggleConnectionMenu() {
    showConnectionMenu = !showConnectionMenu;
  }

  /**
   * Call a method on the canister actor safely to avoid TypeScript errors
   * @param {Record<string, any>} obj - The object (canister actor) to call the method on
   * @param {string} methodName - The name of the method to call
   * @param {...any} args - Arguments to pass to the method
   * @returns {Promise<any>} - Promise that resolves to the method result or false
   */
  function callCanisterMethod(obj, methodName, ...args) {
    // Only try to call if the method exists
    if (obj && typeof obj === 'object') {
      try {
        // Use safer approach with optional chaining
        if (methodName in obj && typeof obj[methodName] === 'function') {
          return obj[methodName](...args);
        }
      } catch (error) {
        console.error(`Error calling method ${methodName}:`, error);
      }
    }
    return Promise.resolve(false);
  }

  /**
   * Check if the connected wallet is an admin
   * Uses dynamic method access to avoid TypeScript errors
   * @returns {Promise<void>}
   */
  async function checkAdminStatus() {
    // Reset admin status if prerequisites aren't met
    if (!$walletPrincipal) {
      $isAdmin = false;
      return;
    }

    try {
      // Get shared actor for direct connection
      const actor = await getSharedActor();

      // Check both admin types
      const systemAdmin = await callCanisterMethod(
        actor, 
        'is_admin_type', 
        $walletPrincipal, 
        { System: null }
      );
      
      const functionalAdmin = await callCanisterMethod(
        actor, 
        'is_admin_type', 
        $walletPrincipal, 
        { Functional: null }
      );

      $isAdmin = systemAdmin || functionalAdmin;
      console.log('Admin status:', $isAdmin);
    } catch (error) {
      console.error('Error checking admin status:', error);
      $isAdmin = false;
    }
  }

  // Check if user is admin when wallet is connected
  $: if ($isWalletConnected && $walletPrincipal) {
    checkAdminStatus();
  }

  /**
   * Format a principal ID for display by truncating the middle portion
   * @param {any} principal - The principal ID object to format
   * @returns {string} - The formatted principal string
   */
  function formatPrincipal(principal) {
    if (!principal) return '';
    const str = principal.toString();
    return str.length > 20 ? `${str.slice(0, 10)}...${str.slice(-6)}` : str;
  }
  
  /**
   * Copy text to clipboard and show a temporary success message
   * @param {string} text - The text to copy to clipboard
   */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      // Show copied message
      showCopiedMessage = true;
      // Hide after 2 seconds
      setTimeout(() => {
        showCopiedMessage = false;
      }, 2000);
      console.log('Copied to clipboard:', text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }
</script>

<header class="topbar">
  <div class="topbar-content">
    <div class="logo-section">
      <div class="logo">
        <h1>ICRC37+ Token</h1>
      </div>
      
      <div class="nav-buttons">
        <a href="/" class="nav-button home-button">
          <span class="nav-icon">🏠</span> Home
        </a>
        {#if $isWalletConnected && $isAdmin}
          <a href="/admin" class="nav-button admin-button">
            <span class="nav-icon">👑</span> Admin
          </a>
        {/if}
      </div>
    </div>
    
    <div class="connection-section">
      {#if $connectionError}
        <div class="error-message">
          {$connectionError}
        </div>
      {/if}
      
      <div class="connection-status">
        {#if $isWalletConnected || $isCanisterConnected}
          <button class="connected-button" on:click={toggleConnectionMenu} bind:this={buttonRef}>
            <div class="status-indicators">
              <span class="status-dot {$isWalletConnected ? 'connected' : 'disconnected'}" title="Wallet Status"></span>
              <span class="status-dot {$isCanisterConnected ? 'connected' : 'disconnected'}" title="Canister Status"></span>
            </div>
            {#if $isWalletConnected}
              <span class="principal">{formatPrincipal($walletPrincipal)}</span>
            {:else}
              <span class="status-text">Partially Connected</span>
            {/if}
            <span class="dropdown-arrow">▼</span>
          </button>
          
          {#if showConnectionMenu}
            <div class="connection-menu" bind:this={menuRef}>
              <div class="menu-header">Connection Status</div>
              <div class="menu-item status-item">
                <span class="status-indicator">
                  <span class="status-dot {$isWalletConnected ? 'connected' : 'disconnected'}"></span>
                  <span class="status-label">Wallet:</span> 
                  <span class="status-value">{$isWalletConnected ? 'Connected' : 'Disconnected'}</span>
                </span>
              </div>
              <div class="menu-item status-item">
                <span class="status-indicator">
                  <span class="status-dot {$isCanisterConnected ? 'connected' : 'disconnected'}"></span>
                  <span class="status-label">Canister:</span>
                  <span class="status-value">{$isCanisterConnected ? 'Connected' : 'Disconnected'}</span>
                </span>
              </div>
              <div class="menu-divider"></div>
              {#if !$isWalletConnected}
                <div class="wallet-buttons">
                  <button
                    class="connect-button ii-button"
                    on:click={handleConnectII}
                    disabled={$isConnecting}
                  >
                    {$isConnecting ? 'Connecting...' : 'Internet Identity'}
                  </button>
                </div>
              {:else}
                <div class="wallet-info">
                  <div class="principal-display">
                    <span class="wallet-label">Connected via:</span>
                    <span class="provider-badge ii">Internet Identity</span>
                  </div>
                  <div class="principal-id">
                    <span class="wallet-principal">{formatPrincipal($walletPrincipal)}</span>
                    <div class="copy-container">
                      <button class="copy-button" on:click={() => $walletPrincipal && copyToClipboard($walletPrincipal.toString())} title="Copy to clipboard">
                        {#if showCopiedMessage}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 6L9 17l-5-5"></path>
                          </svg>
                        {:else}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        {/if}
                      </button>
                      {#if showCopiedMessage}
                        <span class="copied-message">Copied!</span>
                      {/if}
                    </div>
                  </div>
                  <button class="menu-item disconnect-button" on:click={handleDisconnect}>
                    Disconnect Wallet
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        {:else}
          <div class="connect-buttons">
            <button 
              class="connect-button identity" 
              on:click={handleConnectII}
              disabled={$isConnecting}
            >
              {#if $isConnecting}
                Connecting...
              {:else}
                Internet Identity
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>

<style>
  .topbar {
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1rem 0;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  
  /* Internet Identity button styles */
  .ii-button {
    background-color: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  .ii-button:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.8);
    color: #764ba2;
  }
  
  /* Provider badge styles */
  .provider-badge {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .provider-badge.ii {
    background: #4f46e5;
    color: white;
  }

  .menu-header {
    padding: 0.5rem 1rem;
    font-weight: 600;
    color: #1e293b;
    font-size: 0.8rem;
    background: #e2e8f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-label {
    font-weight: 500;
    color: #64748b;
    margin-right: 0.25rem;
  }

  .status-value {
    font-weight: 500;
    color: #1e293b;
  }

  .wallet-info {
    padding: 0.5rem 0;
  }

  .principal-display {
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .principal-id {
    padding: 0.25rem 1rem 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .copy-button {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }
  
  .copy-button:hover {
    color: #3b82f6;
    background: #eff6ff;
  }
  
  .copy-container {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .copied-message {
    position: absolute;
    right: calc(100% + 8px);
    background: #10b981;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    white-space: nowrap;
    animation: fadeIn 0.2s ease-in-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .wallet-principal {
    font-family: monospace;
    font-size: 0.75rem;
    color: #475569;
    word-break: break-all;
  }

  .wallet-label {
    color: #64748b;
    font-size: 0.8rem;
  }

  .topbar-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2rem;
  }

  .logo-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .logo h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: white;
  }

  .connection-section {
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
  }

  .error-message {
    background: rgba(255, 107, 107, 0.9);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    max-width: 300px;
  }

  .connect-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .connect-button {
    padding: 0.5rem 1rem;
    border: 2px solid white;
    background: transparent;
    color: #374151;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    width: 100%;
  }

  .connect-button:hover:not(:disabled) {
    background: white;
    color: #667eea;
  }

  .connect-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .connected-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .connected-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .status-indicators {
    display: flex;
    gap: 0.25rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-dot.connected {
    background: #4ade80;
    box-shadow: 0 0 4px rgba(74, 222, 128, 0.5);
  }

  .status-dot.disconnected {
    background: #f87171;
  }

  .principal {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .dropdown-arrow {
    font-size: 0.75rem;
    transition: transform 0.2s ease;
  }

  .connection-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: #f8fafc;
    color: #374151;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    min-width: 250px;
    overflow: hidden;
    z-index: 200;
    border: 1px solid #e2e8f0;
  }

  .menu-item {
    padding: 0.75rem 1rem;
    display: block;
    width: 100%;
    border: none;
    background: none;
    text-align: left;
    color: #374151;
    font-size: 0.875rem;
  }

  .status-item {
    background: #f9fafb;
  }

  .disconnect-button {
    color: #dc2626;
    cursor: pointer;
    transition: background-color 0.2s ease;
    width: 100%;
    text-align: center;
    font-weight: 500;
  }

  .disconnect-button:hover {
    background: #fef2f2;
  }

  .menu-divider {
    height: 1px;
    background: #e5e7eb;
    margin: 0.25rem 0;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-buttons {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .nav-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.8rem;
    background: rgba(255, 255, 255, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 6px;
    color: white;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .nav-button:hover {
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.7);
  }

  .nav-icon {
    font-size: 1rem;
  }
  
  .home-button {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .admin-button {
    background: rgba(255, 255, 255, 0.3);
  }

  @media (max-width: 768px) {
    .topbar-content {
      padding: 0 1rem;
      flex-direction: column;
      gap: 1rem;
    }
    
    .logo-section {
      width: 100%;
      display: flex;
      justify-content: space-between;
    }

    .logo h1 {
      font-size: 1.25rem;
    }

    .connect-buttons {
      flex-direction: column;
    }

    .connection-menu {
      right: auto;
      left: 0;
    }
  }
</style>
