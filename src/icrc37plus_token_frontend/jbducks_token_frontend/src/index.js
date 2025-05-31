import { createActor, icrc37plus_token_backend } from "../../declarations/icrc37plus_token_backend";
import AssetManager from "./asset_manager";

// Initialize the asset manager
const assetManager = new AssetManager();

// DOM elements
let fileInput;
let textInput;
let filenameInput;
let descriptionInput;
let uploadButton;
let uploadTextButton;
let bootstrapButton;
let assetsList;
let statusMessage;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  fileInput = document.getElementById('fileInput');
  textInput = document.getElementById('textInput');
  filenameInput = document.getElementById('filenameInput');
  descriptionInput = document.getElementById('descriptionInput');
  uploadButton = document.getElementById('uploadButton');
  uploadTextButton = document.getElementById('uploadTextButton');
  bootstrapButton = document.getElementById('bootstrapButton');
  assetsList = document.getElementById('assetsList');
  statusMessage = document.getElementById('statusMessage');

  // Add event listeners
  uploadButton.addEventListener('click', handleFileUpload);
  uploadTextButton.addEventListener('click', handleTextUpload);
  bootstrapButton.addEventListener('click', handleBootstrap);

  // Load assets when page loads
  loadAssets();
});

// Load and display assets
async function loadAssets() {
  try {
    showStatus('Loading assets...', 'info');
    const assets = await assetManager.listAssets();
    
    // Clear current list
    assetsList.innerHTML = '';
    
    if (assets.length === 0) {
      assetsList.innerHTML = '<li class="no-assets">No assets found</li>';
      return;
    }
    
    // Display each asset
    assets.forEach(asset => {
      const li = document.createElement('li');
      li.className = 'asset-item';
      
      // Create asset info
      const info = document.createElement('div');
      info.className = 'asset-info';
      info.innerHTML = `
        <strong>${asset.key}</strong> 
        <span class="content-type">${asset.content_type}</span>
        <span class="size">${formatSize(asset.size)}</span>
      `;
      
      // Create action buttons
      const actions = document.createElement('div');
      actions.className = 'asset-actions';
      
      // Download button
      const downloadBtn = document.createElement('button');
      downloadBtn.innerText = 'Download';
      downloadBtn.addEventListener('click', () => handleDownload(asset.key));
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.innerText = 'Delete';
      deleteBtn.className = 'delete-btn';
      deleteBtn.addEventListener('click', () => handleDelete(asset.key));
      
      // Add buttons to actions
      actions.appendChild(downloadBtn);
      actions.appendChild(deleteBtn);
      
      // Add everything to list item
      li.appendChild(info);
      li.appendChild(actions);
      assetsList.appendChild(li);
    });
    
    showStatus('Assets loaded successfully', 'success', 3000);
  } catch (error) {
    console.error('Error loading assets:', error);
    showStatus('Failed to load assets: ' + error.message, 'error');
  }
}

// Handle file upload
async function handleFileUpload() {
  if (!fileInput.files || fileInput.files.length === 0) {
    showStatus('Please select a file to upload', 'error');
    return;
  }
  
  const file = fileInput.files[0];
  const customFilename = filenameInput.value || null;
  const description = descriptionInput.value || null;
  
  try {
    showStatus('Uploading file...', 'info');
    const result = await assetManager.uploadFile(file, customFilename, description);
    
    if ('Ok' in result) {
      showStatus(`File uploaded successfully with key: ${result.Ok}`, 'success');
      fileInput.value = '';
      filenameInput.value = '';
      descriptionInput.value = '';
      
      // Reload assets list
      loadAssets();
    } else {
      showStatus('Upload failed: ' + result.Err, 'error');
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    showStatus('Upload failed: ' + error.message, 'error');
  }
}

// Handle text upload
async function handleTextUpload() {
  if (!textInput.value) {
    showStatus('Please enter some text to upload', 'error');
    return;
  }
  
  const text = textInput.value;
  const filename = filenameInput.value || `text-${Date.now()}.txt`;
  const description = descriptionInput.value || null;
  
  try {
    showStatus('Uploading text...', 'info');
    const result = await assetManager.uploadTextFile(text, filename, description);
    
    if ('Ok' in result) {
      showStatus(`Text uploaded successfully with key: ${result.Ok}`, 'success');
      textInput.value = '';
      filenameInput.value = '';
      descriptionInput.value = '';
      
      // Reload assets list
      loadAssets();
    } else {
      showStatus('Upload failed: ' + result.Err, 'error');
    }
  } catch (error) {
    console.error('Error uploading text:', error);
    showStatus('Upload failed: ' + error.message, 'error');
  }
}

// Handle bootstrap admin
async function handleBootstrap() {
  try {
    showStatus('Bootstrapping admin...', 'info');
    const result = await assetManager.bootstrapFirstAdmin();
    
    if ('Ok' in result) {
      showStatus('Admin bootstrapped successfully', 'success');
    } else {
      showStatus('Bootstrap failed: ' + result.Err, 'error');
    }
  } catch (error) {
    console.error('Error bootstrapping admin:', error);
    showStatus('Bootstrap failed: ' + error.message, 'error');
  }
}

// Handle download
async function handleDownload(key) {
  try {
    showStatus(`Downloading ${key}...`, 'info');
    const result = await assetManager.downloadFile(key);
    
    // Create a blob and download it
    const blob = new Blob([result.data], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = key;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus('Download complete', 'success', 3000);
  } catch (error) {
    console.error('Error downloading file:', error);
    showStatus('Download failed: ' + error.message, 'error');
  }
}

// Handle delete
async function handleDelete(key) {
  if (!confirm(`Are you sure you want to delete "${key}"?`)) {
    return;
  }
  
  try {
    showStatus(`Deleting ${key}...`, 'info');
    const success = await assetManager.deleteAsset(key);
    
    if (success) {
      showStatus(`Deleted ${key} successfully`, 'success');
      // Reload assets list
      loadAssets();
    }
  } catch (error) {
    console.error('Error deleting asset:', error);
    showStatus('Delete failed: ' + error.message, 'error');
  }
}

// Helper to show status messages
function showStatus(message, type, timeout = 0) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.style.display = 'block';
  
  if (timeout > 0) {
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, timeout);
  }
}

// Helper to format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
