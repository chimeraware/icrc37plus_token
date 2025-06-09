<script>
  import { onMount, onDestroy } from 'svelte';

  import { getSharedActor } from '$lib/wallet';
  
  // State for asset management
  let assets = [];
  let filteredAssets = [];
  let loading = true;
  let error = null;
  let selectedFilter = 'all';
  let searchQuery = '';
  
  // State for asset viewing
  let viewingAsset = null;
  let showAssetModal = false;
  
  // File type icons
  /** @type {Object.<string, string>} */
  const fileIcons = {
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    svg: '📊',
    folder: '📁',
    default: '📄'
  };
  
  // Available filters
  const filters = [
    { value: 'all', label: 'All Files' },
    { value: 'image', label: 'Images (JPG, PNG)' },
    { value: 'svg', label: 'SVG Files' },
    { value: 'folder', label: 'Folders' }
  ];
  
  onMount(async () => {
    await loadAssets();
    
    // Add global keyboard event listener for Escape key
    window.addEventListener('keydown', handleKeydown);
  });
  
  // Clean up event listener when component is destroyed
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
  
  async function loadAssets() {
    loading = true;
    error = null;
    
    try {
      const actor = await getSharedActor();
      // Call the list_assets method which returns a variant type
      const result = await actor.list_assets();
      
      // Check if we got an Ok result with asset metadata
      if ('Ok' in result) {
        const assetMetadataList = result.Ok;
        assets = assetMetadataList.map(asset => ({
          name: asset.key,  // The key field is the asset name/path
          path: asset.key,  // Using key as path
          size: formatFileSize(Number(asset.size)),
          type: getFileType(asset.key),
          lastModified: new Date(Number(asset.modified_at)).toLocaleString(),
          icon: getFileIcon(asset.key)
        }));
        applyFilters();
      } else if ('Err' in result) {
        // Handle error from the backend
        throw new Error(`Backend error: ${result.Err}`);
      } else {
        throw new Error('Unexpected response format from backend');
      }
    } catch (err) {
      console.error('Error loading assets:', err);
      // Handle the error safely regardless of its type
      let errorMessage = 'Unknown error';
      if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String(err.message);
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      error = 'Failed to load assets: ' + errorMessage;
      // Clear any existing assets to show the error clearly
      assets = [];
      applyFilters();
    } finally {
      loading = false;
    }
  }
  
  // Generate sample assets for development/demo purposes
  function generateSampleAssets() {
    assets = [
      {
        name: 'logo.png',
        path: '/assets/logo.png',
        size: '24 KB',
        type: 'png',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.png
      },
      {
        name: 'banner.jpg',
        path: '/assets/banner.jpg',
        size: '156 KB',
        type: 'jpg',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.jpg
      },
      {
        name: 'profile.svg',
        path: '/assets/profile.svg',
        size: '12 KB',
        type: 'svg',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.svg
      },
      {
        name: 'documents',
        path: '/assets/documents',
        size: '-- KB',
        type: 'folder',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.folder
      },
      {
        name: 'metadata.json',
        path: '/assets/metadata.json',
        size: '2 KB',
        type: 'json',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.default
      },
      {
        name: 'nft_preview.gif',
        path: '/assets/nft_preview.gif',
        size: '1.2 MB',
        type: 'gif',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.jpg
      },
      {
        name: 'collection_banner.png',
        path: '/assets/collection_banner.png',
        size: '320 KB',
        type: 'png',
        lastModified: new Date().toLocaleString(),
        icon: fileIcons.png
      }
    ];
    applyFilters();
  }
  
  /**
   * Applies filters to the assets array and updates filteredAssets
   */
  function applyFilters() {
    if (!assets) return;
    
    filteredAssets = assets.filter(/** @param {Asset} asset */ asset => {
      // Apply type filter
      const passesTypeFilter = 
        selectedFilter === 'all' || 
        (selectedFilter === 'image' && ['jpg', 'jpeg', 'png', 'gif'].includes(asset.type)) ||
        (selectedFilter === 'svg' && asset.type === 'svg') ||
        (selectedFilter === 'folder' && asset.type === 'folder');
      
      // Apply search query filter
      const passesSearchFilter = 
        !searchQuery || 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      return passesTypeFilter && passesSearchFilter;
    });
  }
  
  // Watch for filter changes
  $: {
    if (assets.length > 0) {
      applyFilters();
    }
  }
  
  // Helper functions
  
  /**
   * @param {string} filename - The filename to get the type for
   * @returns {string} The file type/extension
   */
  function getFileType(filename) {
    if (!filename.includes('.')) return 'folder';
    const extension = filename.split('.').pop();
    return extension ? extension.toLowerCase() : 'default';
  }
  
  /**
   * @typedef {Object} Asset
   * @property {string} name - Asset filename
   * @property {string} path - Asset path
   * @property {string} size - Formatted file size
   * @property {string} type - File type
   * @property {string} lastModified - Last modified date string
   * @property {string} icon - Icon representation
   */
   
  /**
   * @typedef {Object} FileIcons
   * @property {string} jpg - JPG icon
   * @property {string} jpeg - JPEG icon
   * @property {string} png - PNG icon
   * @property {string} svg - SVG icon
   * @property {string} folder - Folder icon
   * @property {string} default - Default icon
   */
  
  /**
   * @param {string} filename - The filename to get the icon for
   * @returns {string} The icon for the file type
   */
  function getFileIcon(filename) {
    const type = getFileType(filename);
    // Check if type exists in fileIcons, otherwise use default
    return /** @type {string} */ (fileIcons[type] || fileIcons.default);
  }
  
  /**
   * @param {number|string} bytes - The size in bytes to format
   * @returns {string} Formatted file size string
   */
  function formatFileSize(bytes) {
    if (!bytes || typeof bytes === 'string') return '-- KB';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // Function to handle file upload (placeholder)
  function handleFileUpload() {
    alert('File upload functionality would be implemented here');
    // In a real implementation, this would:
    // 1. Upload the file to the canister
    // 2. Refresh the asset list
    // 3. Show success/error message
  }
  
  // Function to view asset details
  /**
   * @param {Object} asset - The asset to view
   */
  function viewAsset(asset) {
    viewingAsset = asset;
    showAssetModal = true;
  }
  
  // Function to close the asset modal
  function closeAssetModal() {
    showAssetModal = false;
    viewingAsset = null;
  }
  
  // Handle keyboard events for the modal
  /**
   * @param {KeyboardEvent} e - The keyboard event
   */
  function handleKeydown(e) {
    if (e.key === 'Escape' && showAssetModal) {
      closeAssetModal();
    }
  }
</script>

<div class="assets-panel">
  <div class="assets-header">
    <h2>Asset Management</h2>
    <p>View and manage assets stored in the canister</p>
  </div>
  
  <div class="assets-controls">
    <div class="search-filter-container">
      <div class="search-container">
        <input 
          type="text" 
          placeholder="Search assets..." 
          bind:value={searchQuery} 
          on:input={() => applyFilters()}
        />
      </div>
      
      <div class="filter-container">
        <label for="filter-select">Filter by:</label>
        <select 
          id="filter-select" 
          bind:value={selectedFilter} 
          on:change={() => applyFilters()}
        >
          {#each filters as filter}
            <option value={filter.value}>{filter.label}</option>
          {/each}
        </select>
      </div>
    </div>
    
    <div class="upload-container">
      <button class="upload-btn" on:click={handleFileUpload}>
        Upload New Asset
      </button>
    </div>
  </div>
  
  {#if loading}
    <div class="loading-indicator">
      <p>Loading assets...</p>
    </div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {:else if filteredAssets.length === 0}
    <div class="empty-state">
      <p>No assets found matching your criteria</p>
    </div>
  {:else}
    <div class="assets-table">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th>Size</th>
            <th>Last Modified</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredAssets as asset}
            <tr>
              <td class="asset-icon">{asset.icon}</td>
              <td class="asset-name">{asset.name}</td>
              <td>{asset.size}</td>
              <td>{asset.lastModified}</td>
              <td class="asset-actions">
                <button class="action-btn view-btn" title="View Asset" on:click={() => viewAsset(asset)}>👁️</button>
                <button class="action-btn delete-btn" title="Delete Asset">🗑️</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Asset View Modal -->
{#if showAssetModal && viewingAsset}
  <div class="modal-container">
    <button class="modal-overlay" on:click={closeAssetModal} aria-label="Close modal">
      <span class="sr-only">Close</span>
    </button>
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="asset-modal-title" tabindex="-1">
        <div class="modal-header">
          <h3 id="asset-modal-title">{viewingAsset.name}</h3>
          <button class="close-btn" on:click={closeAssetModal}>×</button>
        </div>
        <div class="modal-body">
          {#if ['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(viewingAsset.type)}
            <div class="asset-preview image-preview">
              <img src={viewingAsset.path} alt={viewingAsset.name} />
            </div>
          {:else if viewingAsset.type === 'folder'}
            <div class="asset-preview folder-preview">
              <span class="folder-icon">{viewingAsset.icon}</span>
              <p>This is a folder. Contents would be listed here in a full implementation.</p>
            </div>
          {:else}
            <div class="asset-preview file-preview">
              <span class="file-icon">{viewingAsset.icon}</span>
              <p>File preview not available for this file type.</p>
            </div>
          {/if}
          
          <div class="asset-details">
            <div class="detail-row">
              <span class="detail-label">Name:</span>
              <span class="detail-value">{viewingAsset.name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Type:</span>
              <span class="detail-value">{viewingAsset.type}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Size:</span>
              <span class="detail-value">{viewingAsset.size}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Last Modified:</span>
              <span class="detail-value">{viewingAsset.lastModified}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Path:</span>
              <span class="detail-value">{viewingAsset.path}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="primary-btn" on:click={closeAssetModal}>Close</button>
        </div>
    </div>
  </div>
{/if}

<style>
  .assets-panel {
    width: 100%;
  }
  
  .assets-header {
    margin-bottom: 2rem;
  }
  
  .assets-header h2 {
    margin-top: 0;
    margin-bottom: 0.5rem;
  }
  
  .assets-header p {
    color: #6b7280;
    margin-top: 0;
  }
  
  .assets-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .search-filter-container {
    display: flex;
    gap: 1rem;
    flex: 1;
  }
  
  .search-container {
    flex: 2;
  }
  
  .search-container input {
    width: 80%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .filter-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }
  
  .filter-container select {
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    background-color: white;
  }
  
  .upload-container {
    margin-left: 1rem;
  }
  
  .upload-btn {
    background: #4f46e5;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .upload-btn:hover {
    background: #4338ca;
  }
  
  .assets-table {
    width: 100%;
    overflow-x: auto;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  th, td {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  
  th {
    background-color: #f9fafb;
    font-weight: 600;
  }
  
  .asset-icon {
    font-size: 1.5rem;
    text-align: center;
  }
  
  .asset-name {
    font-weight: 500;
  }
  
  .asset-actions {
    display: flex;
    gap: 0.5rem;
  }
  
  .action-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }
  
  .view-btn:hover {
    background: #e0f2fe;
  }
  
  .delete-btn:hover {
    background: #fee2e2;
  }
  
  .loading-indicator, .empty-state, .error-message {
    text-align: center;
    padding: 3rem 0;
    color: #6b7280;
  }
  
  .error-message {
    color: #b91c1c;
    background: #fee2e2;
    padding: 1rem;
    border-radius: 4px;
  }
  
  /* Modal Styles */
  .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1;
    border: none;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  
  .modal-content {
    background-color: white;
    border-radius: 8px;
    width: 80%;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    z-index: 1001;
    position: relative;
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    color: #6b7280;
  }
  
  .modal-body {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }
  
  .modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
  }
  
  .asset-preview {
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    background-color: #f9fafb;
    border-radius: 4px;
    padding: 1rem;
  }
  
  .image-preview img {
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
  }
  
  .folder-icon, .file-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }
  
  .asset-details {
    background-color: #f9fafb;
    border-radius: 4px;
    padding: 1rem;
  }
  
  .detail-row {
    display: flex;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .detail-row:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  
  .detail-label {
    font-weight: 600;
    width: 120px;
    flex-shrink: 0;
  }
  
  .detail-value {
    flex: 1;
    word-break: break-all;
  }
  
  .primary-btn {
    background: #4f46e5;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
  }
  
  .primary-btn:hover {
    background: #4338ca;
  }
</style>
