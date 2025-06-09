aa<script>
  import { onMount } from 'svelte';
  import { getAllAdmins, connectToCanister } from '$lib/wallet';
  import { isCanisterConnected, walletPrincipal, canisterActor } from '$lib/stores';
  import { Principal } from '@dfinity/principal';
  
  // Define proper type for admins
  /** @type {Array<{owner: Principal, admin_type: {System: null} | {Functional: null}}>} */
  let admins = [];
  let loading = true;
  /** @type {string | null} */
  let error = null;
  let isAdmin = false;
  
  // Check if current user is admin
  $: if ($walletPrincipal && admins.length > 0) {
    isAdmin = admins.some(admin => {
      if (admin && admin.owner && typeof admin.owner.toString === 'function' && 
          $walletPrincipal && typeof $walletPrincipal.toString === 'function') {
        return admin.owner.toString() === $walletPrincipal.toString();
      }
      return false;
    });
  } else {
    isAdmin = false;
  }
  
  async function fetchAdmins() {
    loading = true;
    error = null;
    
    // First ensure we're connected to the canister
    if (!$isCanisterConnected) {
      try {
        const result = await connectToCanister();
        if (!result.success) {
          error = result.error || 'Failed to connect to canister';
          loading = false;
          return;
        }
      } catch (/** @type {Error|any} */ err) {
        error = err.message || 'Error connecting to canister';
        loading = false;
        return;
      }
    }
    
    // Now fetch the admins
    try {
      const result = await getAllAdmins();
      if (result.success && result.admins) {
        admins = result.admins;
      } else {
        error = result.error || 'Unknown error';
      }
    } catch (/** @type {Error|any} */ err) {
      error = err.message || 'Error fetching admins';
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    if ($isCanisterConnected) {
      fetchAdmins();
    }
  });
  
  // Watch for canister connection changes
  $: if ($isCanisterConnected) {
    fetchAdmins();
  }
  
  // Format principal ID for display (truncate if too long)
  /**
   * @param {string} principalStr
   * @returns {string}
   */
  function formatPrincipal(principalStr) {
    if (!principalStr) return '';
    if (principalStr.length <= 15) return principalStr;
    return `${principalStr.substring(0, 8)}...${principalStr.substring(principalStr.length - 5)}`;
  }
</script>

<div class="admin-panel">
  <h2>Admin Management</h2>
  
  {#if loading}
    <div class="loading">
      <p>Loading admin information...</p>
      <div class="spinner"></div>
    </div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <button on:click={fetchAdmins} class="retry-button">Retry</button>
    </div>
  {:else if admins.length === 0}
    <p>No admins found in the system.</p>
  {:else}
    <div class="admin-status">
      {#if isAdmin}
        <div class="status-badge admin">You are an admin</div>
      {:else}
        <div class="status-badge not-admin">You are not an admin</div>
      {/if}
    </div>
    
    <table class="admin-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Principal ID</th>
          <th>Admin Type</th>
        </tr>
      </thead>
      <tbody>
        {#each admins as admin, i}
          <tr class={$walletPrincipal && admin && admin.owner && typeof admin.owner.toString === 'function' && $walletPrincipal && typeof $walletPrincipal.toString === 'function' && admin.owner.toString() === $walletPrincipal.toString() ? 'current-user' : ''}>
            <td>{i + 1}</td>
            <td title={admin && admin.owner && typeof admin.owner.toString === 'function' ? admin.owner.toString() : ''}>
              {admin && admin.owner && typeof admin.owner.toString === 'function' ? formatPrincipal(admin.owner.toString()) : ''}
            </td>
            <td>{admin && admin.admin_type ? Object.keys(admin.admin_type)[0] : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .admin-panel {
    background-color: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  h2 {
    color: #333;
    margin-top: 0;
    margin-bottom: 20px;
    font-size: 1.5rem;
  }
  
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
  }
  
  .spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin-top: 10px;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .error {
    background-color: #ffecec;
    color: #721c24;
    padding: 15px;
    border-radius: 4px;
    margin-bottom: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .retry-button {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  
  .retry-button:hover {
    background-color: #c82333;
  }
  
  .admin-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
  }
  
  .admin-table th, .admin-table td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  
  .admin-table th {
    background-color: #f2f2f2;
    font-weight: bold;
  }
  
  .admin-table tr:hover {
    background-color: #f5f5f5;
  }
  
  .admin-table tr.current-user {
    background-color: #e8f4fd;
  }
  
  .admin-status {
    margin-bottom: 15px;
  }
  
  .status-badge {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
  }
  
  .admin {
    background-color: #d4edda;
    color: #155724;
  }
  
  .not-admin {
    background-color: #f8d7da;
    color: #721c24;
  }
</style>
