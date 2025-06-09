<script>
  import { onMount } from 'svelte';
  import { isWalletConnected, walletPrincipal, canisterActor, isConnecting, isCanisterConnected } from '$lib/stores';
  import { getSharedActor, connectToII } from '$lib/wallet';
  import AdminPanel from '$lib/components/AdminPanel.svelte';
  import AssetsPanel from '$lib/components/AssetsPanel.svelte';
  // Admin state
  let isAdmin = false;
  let adminType = null;
  // Collection details object to store metadata
  let collectionDetails = {};
  let mintSchedules = [];
  let activeTab = 'collection';
  let collectionForm = {
    name: '',
    symbol: '',
    description: '',
    maxSupply: 0,
    baseUrl: '',
    logo: '',
    pricing_enabled: true
  };
  
  let scheduleForm = {
    name: '',
    whitelist_only: false,
    active: true,
    start_time: null,
    end_time: null,
    bundle_prices: [
      { quantity: 1, price: 100_000_000 },
      { quantity: 10, price: 950_000_000 }
    ]
  };
  
  // UI state
  let loading = true;
  let saveLoading = false;
  let saveError = null;
  let saveSuccess = false;
  
  onMount(async () => {
    // Check admin status and load data when component mounts
    await checkAdminStatus();
    if (isAdmin) {
      await loadCollectionDetails();
      await loadMintSchedules();
    }
    loading = false;
  });

  // Watch for wallet connection changes
  $: if ($isWalletConnected) {
    checkAdminStatus();
    if (isAdmin) {
      loadCollectionDetails();
      loadMintSchedules();
    }
  }
  
  async function checkAdminStatus() {
    try {
      // Get shared actor for reliable connection
      const actor = await getSharedActor();
      
      // Check if connected user is admin
      const principal = $walletPrincipal;
      if (!principal) {
        isAdmin = false;
        return;
      }
      
      const systemAdmin = await actor.is_admin_type(principal, { System: null });
      const functionalAdmin = await actor.is_admin_type(principal, { Functional: null });
      
      isAdmin = systemAdmin || functionalAdmin;
      if (systemAdmin) adminType = 'System';
      else if (functionalAdmin) adminType = 'Functional';
      else adminType = null;
      
      console.log('Admin status:', isAdmin, adminType);
    } catch (error) {
      console.error('Error checking admin status:', error);
      isAdmin = false;
    }
  }
  
  async function loadCollectionDetails() {
    try {
      // Get shared actor for reliable connection
      const actor = await getSharedActor();
      
      console.log('Calling icrc7_collection_metadata()...');
      const metadataArray = await actor.icrc7_collection_metadata();
      console.log('Raw collection metadata from canister:', metadataArray);
      
      // Convert the array of tuples to a more usable object format
      // Each tuple is [key, variantValue] where variantValue is like { "Text": "value" }
      const metadataObject = {};
      
      if (Array.isArray(metadataArray)) {
        metadataArray.forEach((item) => {
          if (Array.isArray(item) && item.length === 2) {
            const [key, valueObj] = item;
            
            // Extract the actual value from the variant type
            if (valueObj && typeof valueObj === 'object') {
              if ('Text' in valueObj && valueObj.Text !== undefined) {
                metadataObject[key] = valueObj.Text;
              } else if ('Nat' in valueObj && valueObj.Nat !== undefined) {
                metadataObject[key] = Number(valueObj.Nat);
              } else if ('Bool' in valueObj && valueObj.Bool !== undefined) {
                metadataObject[key] = valueObj.Bool;
              } else if ('Map' in valueObj && valueObj.Map !== undefined) {
                // Handle map type (could be simplified depending on needs)
                metadataObject[key] = valueObj.Map;
              } else {
                metadataObject[key] = valueObj;
              }
            }
          }
        });
      }
      
      collectionDetails = metadataObject;
      console.log('Processed collection details:', collectionDetails);
      
      // Using a safer approach with optional chaining and nullish coalescing
      const updatedForm = {
        name: String(collectionDetails?.['icrc7:name'] ?? ''),
        symbol: String(collectionDetails?.['icrc7:symbol'] ?? ''),
        description: String(collectionDetails?.['icrc7:description'] ?? ''),
        maxSupply: Number(collectionDetails?.['icrc7:supply_cap'] ?? 0),
        baseUrl: String(collectionDetails?.['base_url'] ?? ''),
        logo: String(collectionDetails?.['icrc7:logo'] ?? ''),
        pricing_enabled: Boolean(collectionDetails?.['pricing_enabled'] ?? true)
      };
      
      console.log('Updated form values:', updatedForm);
      
      // Update form data
      collectionForm = updatedForm;
      console.log('Loaded collection details:', collectionDetails);
    } catch (error) {
      console.error('Error loading collection details:', error);
    }
  }
  
  async function loadMintSchedules() {
    try {
      // Get shared actor for reliable connection
      const result = await connectToII();
      const actor = result.actor;
      
      const schedules = await actor.get_mint_schedules();
      mintSchedules = schedules.map((schedule) => {
        // Convert from Candid record to JS object with named properties
        return {
          name: schedule.name,
          active: schedule.active,
          whitelist_only: schedule.whitelist_only,
          start_time: schedule.start_time && schedule.start_time.length > 0 ? Number(schedule.start_time[0]) : null,
          end_time: schedule.end_time && schedule.end_time.length > 0 ? Number(schedule.end_time[0]) : null,
          bundle_prices: schedule.bundle_prices.map((bundle) => ({
            quantity: Number(bundle.quantity),
            price: Number(bundle.price)
          }))
        };
      });
      
      console.log('Loaded mint schedules:', mintSchedules);
    } catch (error) {
      console.error('Error loading mint schedules:', error);
    }
  }
  
  async function saveCollection() {
    saveLoading = true;
    saveError = null;
    saveSuccess = false;
    
    try {
      const iiConnection = await connectToII();
      if (!iiConnection.success || !iiConnection.actor) {
        throw new Error('Failed to connect to Internet Identity');
      }
      const actor = iiConnection.actor;
      const ms = collectionForm.maxSupply > 0 ? BigInt(collectionForm.maxSupply) : null;
      
      const updatePayload = {
        name: collectionForm.name ? [collectionForm.name] : [],
        symbol: collectionForm.symbol ? [collectionForm.symbol] : [],
        description: collectionForm.description ? [collectionForm.description] : [],
        max_supply: ms ? [ms] : [],
        base_url: collectionForm.baseUrl ? [collectionForm.baseUrl] : [],
        logo: collectionForm.logo ? [collectionForm.logo] : [],
        pricing_enabled: [collectionForm.pricing_enabled],
        whitelist_end_time: [], // Required by the backend
        mint_schedules: [],
      };
      console.log('Sending update payload:', updatePayload);
      const result = await actor.update_collection_details(updatePayload);
      console.log('Update succeeded:', result);
      saveSuccess = true;
      await loadCollectionDetails();
    } catch (error) {
      console.error('Error updating collection details:', error);
      if (error instanceof Error) {
        saveError = error.message;
      } else {
        saveError = String(error);
      }
    } finally {
      saveLoading = false;
    }
  }
  
  async function saveSchedule() {
    saveLoading = true;
    saveError = null;
    saveSuccess = false;
    
    try {
      // Get authenticated actor via Internet Identity
      const iiConnection = await connectToII();
      if (!iiConnection.success || !iiConnection.actor) {
        throw new Error('Failed to connect to Internet Identity');
      }
      const actor = iiConnection.actor;
      
      // Format bundle prices for Candid
      const bundle_prices = scheduleForm.bundle_prices.map((bundle) => ({
        quantity: BigInt(bundle.quantity),
        price: BigInt(bundle.price)
      }));
      
      const args = {
        name: scheduleForm.name,
        active: [scheduleForm.active],
        whitelist_only: [scheduleForm.whitelist_only],
        start_time: scheduleForm.start_time ? [BigInt(scheduleForm.start_time)] : [],
        end_time: scheduleForm.end_time ? [BigInt(scheduleForm.end_time)] : [],
        bundle_prices
      };
      
      const result = await actor.update_mint_schedule(args);
      
      console.log('Schedule update result:', result);
      
      // Check result - this assumes update_mint_schedule returns the schedule ID
      if (result) {
        saveSuccess = true;
        await loadMintSchedules();
        // Reset form for next entry
        scheduleForm = {
          name: '',
          whitelist_only: false,
          active: true,
          start_time: null,
          end_time: null,
          bundle_prices: [
            { quantity: 1, price: 100_000_000 },
            { quantity: 10, price: 950_000_000 }
          ]
        };
      } else {
        saveError = 'Failed to update schedule';
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      if (error instanceof Error) {
        saveError = error.message;
      } else {
        saveError = String(error);
      }
    } finally {
      saveLoading = false;
    }
  }
  
  async function removeSchedule(name) {
    if (!confirm(`Are you sure you want to remove the "${name}" schedule?`)) {
      return;
    }
    
    try {
      // Get shared actor for reliable connection
      const actor = await getSharedActor();
      
      const result = await actor.remove_mint_schedule(name);
      if (result) {
        await loadMintSchedules();
      } else {
        alert('Failed to remove schedule');
      }
    } catch (error) {
      console.error('Error removing schedule:', error);
      if (error instanceof Error) {
        alert(`Error: ${error.message}`);
      } else {
        alert(`Error: ${String(error)}`);
      }
    }
  }
  
  function addBundlePrice() {
    scheduleForm.bundle_prices = [
      ...scheduleForm.bundle_prices,
      { quantity: 1, price: 100_000_000 }
    ];
  }
  
  function removeBundlePrice(index) {
    scheduleForm.bundle_prices = scheduleForm.bundle_prices.filter((_, i) => i !== index);
  }
  
  function formatPrice(price) {
    return (Number(price) / 100_000_000).toFixed(2);
  }
  
  function connect() {
    connectToWallet();
  }
</script>

<div class="admin-container">
  {#if !$isWalletConnected}
    <div class="connect-prompt">
      <h1>ICRC37+ NFT Admin</h1>
      <p>Please connect your wallet to access the admin interface.</p>
      <button on:click={connect} disabled={$isConnecting}>
        {$isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    </div>
  {:else if loading}
    <div class="loading">Loading admin interface...</div>
  {:else if !isAdmin}
    <div class="access-denied">
      <h1>Access Denied</h1>
      <p>Your account does not have admin privileges.</p>
      <p>Principal: {$walletPrincipal ? String($walletPrincipal) : 'Not connected'}</p>
    </div>
  {:else}
    <div class="admin-panel">
      <h1>ICRC37+ NFT Admin</h1>
      <p class="admin-info">Logged in as {adminType} Admin: {$walletPrincipal ? String($walletPrincipal) : 'Unknown'}</p>
      
      <div class="tabs">
        <button 
          class={activeTab === 'collection' ? 'active' : ''}
          on:click={() => activeTab = 'collection'}
        >
          Collection Details
        </button>
        <button 
          class={activeTab === 'schedules' ? 'active' : ''}
          on:click={() => activeTab = 'schedules'}
        >
          Mint Schedules
        </button>
        <button 
          class={activeTab === 'assets' ? 'active' : ''}
          on:click={() => activeTab = 'assets'}
        >
          Assets
        </button>
        <button 
          class={activeTab === 'admins' ? 'active' : ''}
          on:click={() => activeTab = 'admins'}
        >
          Admin Management
        </button>
      </div>
      
      <div class="tab-content">
        {#if activeTab === 'admins'}
          <AdminPanel />
        {:else if activeTab === 'collection'}
          <div class="collection-form">
            <h2>Collection Details</h2>
            
            <div class="form-group">
              <label for="name">Name</label>
              <input id="name" bind:value={collectionForm.name} placeholder="Collection Name" />
            </div>
            
            <div class="form-group">
              <label for="symbol">Symbol</label>
              <input id="symbol" bind:value={collectionForm.symbol} placeholder="Collection Symbol" />
            </div>
          
            <div class="form-group">
              <label for="description">Description</label>
              <textarea id="description" bind:value={collectionForm.description} placeholder="Collection Description"></textarea>
            </div>
          
            <div class="form-group">
              <label for="maxSupply">Max Supply</label>
              <input id="maxSupply" type="number" bind:value={collectionForm.maxSupply} min="1" />
            </div>
            
            <div class="form-group">
              <label for="baseUrl">Base URL</label>
              <input id="baseUrl" bind:value={collectionForm.baseUrl} placeholder="http://..." />
            </div>
            
            <div class="form-group">
              <label for="logo">Logo URL/Key</label>
              <input id="logo" bind:value={collectionForm.logo} placeholder="logo.png" />
            </div>
            
            <div class="form-group checkbox">
              <label>
                <input type="checkbox" bind:checked={collectionForm.pricing_enabled} />
                Enable Pricing
              </label>
            </div>
            
            <button on:click={saveCollection} disabled={saveLoading}>
              {saveLoading ? 'Saving...' : 'Save Collection Details'}
            </button>
          
            {#if saveSuccess}
              <div class="success-message">Collection details saved successfully!</div>
            {/if}
            
            {#if saveError}
              <div class="error-message">Error: {saveError}</div>
            {/if}
          </div>
        {:else if activeTab === 'schedules'}
        <div class="schedules-container">
          <h2>Mint Schedules</h2>
          
          <div class="current-schedules">
            <h3>Current Schedules</h3>
            
            {#if mintSchedules.length === 0}
              <p>No mint schedules configured.</p>
            {:else}
              <div class="schedules-grid">
                {#each mintSchedules as schedule}
                  <div class="schedule-card">
                    <div class="schedule-header">
                      <h4>{schedule.name}</h4>
                      <span class={schedule.active ? 'status active' : 'status inactive'}>
                        {schedule.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div class="schedule-details">
                      <p>
                        <strong>Access:</strong> 
                        {schedule.whitelist_only ? 'Whitelist Only' : 'Public'}
                      </p>
                      <p>
                        <strong>Time Window:</strong> 
                        {schedule.start_time && schedule.end_time 
                          ? `${new Date(Number(schedule.start_time/1000000)).toLocaleString()} - ${new Date(Number(schedule.end_time/1000000)).toLocaleString()}`
                          : schedule.start_time 
                            ? `From ${new Date(Number(schedule.start_time/1000000)).toLocaleString()}`
                            : schedule.end_time
                              ? `Until ${new Date(Number(schedule.end_time/1000000)).toLocaleString()}`
                              : 'No time restriction'}
                      </p>
                      <div class="bundle-prices">
                        <strong>Bundle Prices:</strong>
                        {#if schedule.bundle_prices.length === 0}
                          <p>No bundle prices configured</p>
                        {:else}
                          <ul>
                            {#each schedule.bundle_prices as bundle}
                              <li>{bundle.quantity} NFT{bundle.quantity > 1 ? 's' : ''} for {formatPrice(bundle.price)} ICP</li>
                            {/each}
                          </ul>
                        {/if}
                      </div>
                    </div>
                    <button class="remove-btn" on:click={() => removeSchedule(schedule.name)}>
                      Remove
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          
          <div class="new-schedule-form">
            <h3>Add/Update Schedule</h3>
            
            <div class="form-group">
              <label for="scheduleName">Schedule Name</label>
              <input id="scheduleName" bind:value={scheduleForm.name} placeholder="e.g. Standard, Whitelist, Early Bird" />
            </div>
            
            <div class="form-group checkbox">
              <label>
                <input type="checkbox" bind:checked={scheduleForm.active} />
                Active
              </label>
            </div>
            
            <div class="form-group checkbox">
              <label>
                <input type="checkbox" bind:checked={scheduleForm.whitelist_only} />
                Whitelist Only
              </label>
            </div>
            
            <div class="form-group">
              <label for="startTime">Start Time (optional)</label>
              <input id="startTime" type="datetime-local" 
                     bind:value={scheduleForm.start_time} />
            </div>
            
            <div class="form-group">
              <label for="endTime">End Time (optional)</label>
              <input id="endTime" type="datetime-local" 
                     bind:value={scheduleForm.end_time} />
            </div>
            
            <h4>Bundle Prices</h4>
            {#each scheduleForm.bundle_prices as bundle, index}
              <div class="bundle-row">
                <div class="form-group">
                  <label for={`quantity-${index}`}>Quantity</label>
                  <input id={`quantity-${index}`} type="number" bind:value={bundle.quantity} min="1" />
                </div>
                
                <div class="form-group">
                  <label for={`price-${index}`}>Price (ICP e8s)</label>
                  <input id={`price-${index}`} type="number" bind:value={bundle.price} min="0" step="1000000" />
                  <span class="price-helper">{formatPrice(bundle.price)} ICP</span>
                </div>
                
                <button class="remove-btn" on:click={() => removeBundlePrice(index)}>
                  Remove
                </button>
              </div>
            {/each}
            
            <button class="add-bundle-btn" on:click={addBundlePrice}>
              + Add Bundle Price
            </button>
            
            <button class="save-btn" on:click={saveSchedule} disabled={saveLoading}>
              {saveLoading ? 'Saving...' : 'Save Schedule'}
            </button>
            
            {#if saveSuccess}
              <div class="success-message">Schedule saved successfully!</div>
            {/if}
            
            {#if saveError}
              <div class="error-message">Error: {saveError}</div>
            {/if}
          </div>
        </div>
      {/if}
      
      {#if activeTab === 'assets'}
        <!-- Assets Management Panel -->
        <AssetsPanel />
      {/if}
      </div> <!-- Closing tag for tab-content div -->
    </div>
  {/if}
</div>

<style>
  .admin-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .connect-prompt, .access-denied, .loading {
    text-align: center;
    margin: 4rem auto;
  }
  
  .admin-info {
    background: #f0f0f0;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.9rem;
    margin-bottom: 2rem;
    word-break: break-all;
  }
  
  .tabs {
    display: flex;
    margin-bottom: 2rem;
    border-bottom: 1px solid #ddd;
  }
  
  .tabs button {
    background: none;
    color: #4f46e5;
    border: none;
    padding: 1rem 2rem;
    cursor: pointer;
    font-size: 1rem;
    border-bottom: 3px solid transparent;
  }
  
  .tabs button.active {
    border-bottom: 3px solid #4f46e5;
    font-weight: bold;
  }
  .tabs button:hover {
    color: #FFFFFF;
    background-color: #4f46e5;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  
  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .form-group textarea {
    min-height: 100px;
  }
  
  .form-group.checkbox {
    display: flex;
    align-items: center;
  }
  
  .form-group.checkbox label {
    margin: 0;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  
  .form-group.checkbox input {
    width: auto;
    margin-right: 0.5rem;
  }
  
  button {
    background: #4f46e5;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  button:hover {
    background: #4338ca;
  }
  
  button:disabled {
    background: #a5a5a5;
    cursor: not-allowed;
  }
  
  .success-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #d1fae5;
    color: #065f46;
    border-radius: 4px;
  }
  
  .error-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #fee2e2;
    color: #b91c1c;
    border-radius: 4px;
  }
  
  .schedules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  
  .schedule-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    position: relative;
  }
  
  .schedule-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .schedule-header h4 {
    margin: 0;
  }
  
  .status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  
  .status.active {
    background: #d1fae5;
    color: #065f46;
  }
  
  .status.inactive {
    background: #fee2e2;
    color: #b91c1c;
  }
  
  .bundle-prices ul {
    padding-left: 1.5rem;
    margin-top: 0.5rem;
  }
  
  .bundle-row {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 4px;
  }
  
  .price-helper {
    display: block;
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }
  
  .add-bundle-btn {
    background: #f3f4f6;
    color: #1f2937;
    margin-bottom: 1.5rem;
  }
  
  .remove-btn {
    background: #fee2e2;
    color: #b91c1c;
    padding: 0.5rem;
    font-size: 0.8rem;
  }
  
  .save-btn {
    margin-top: 1.5rem;
    width: 100%;
  }
  
  h2, h3 {
    margin-top: 0;
    margin-bottom: 1.5rem;
  }
  
  .new-schedule-form {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid #ddd;
  }
</style>
