#!/usr/bin/env node

/**
 * Combined script for JBDucks NFT asset management:
 * 1. Upload SVG/PNG files to the canister
 * 2. Update SVG files with proper asset paths including canister ID
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  command: args[0] || 'help',
  svgOnly: args.includes('--svg-only'),
  updatePaths: args.includes('--update-paths'),
  directory: args.find(arg => arg.startsWith('--dir='))?.split('=')[1] || 'svg',
  canisterId: args.find(arg => arg.startsWith('--canister='))?.split('=')[1] || 'br5f7-7uaaa-aaaaa-qaaca-cai',
  projectName: args.find(arg => arg.startsWith('--project='))?.split('=')[1] || 'JBDucks NFT'
};

// Configuration
const ASSETS_DIR = path.resolve(__dirname, options.directory);
const CANISTER_ID = options.canisterId;
const FILE_EXTENSIONS = options.svgOnly ? ['.svg'] : ['.svg', '.png'];

// Function to encode file to base64
function encodeFileToBase64(filePath) {
  const fileData = fs.readFileSync(filePath);
  return fileData.toString('base64');
}

// Function to update SVG content to prepend "/asset/" and add canister ID to each href
function updateSvgContent(content, canisterId) {
  return content.replace(
    /xlink:href="([^"]+)"/g, 
    `xlink:href="/asset/$1?canisterId=${canisterId}"`
  );
}

// Function to upload a file to the canister
function uploadFile(filePath) {
  const fileName = path.basename(filePath);
  const fileExtension = path.extname(filePath).toLowerCase();
  const base64Content = encodeFileToBase64(filePath);
  
  console.log(`Uploading ${fileName}...`);
  
  // Determine content type based on file extension
  let contentType = 'application/octet-stream'; // Default
  if (fileExtension === '.svg') {
    contentType = 'image/svg+xml';
  } else if (fileExtension === '.png') {
    contentType = 'image/png';
  }
  
  // Create the upload command with proper escaping
  const cmd = `dfx canister call ${CANISTER_ID} upload "(record {
    key = opt \\"${fileName}\\";
    content_type = \\"${contentType}\\";
    data = blob \\"${base64Content}\\";
    description = opt \\"Asset for ${options.projectName}\\";
  })"`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    console.log(`Upload successful for ${fileName}`);
    console.log(`Result: ${result.trim()}`);
    return true;
  } catch (error) {
    console.error(`Error uploading ${fileName}:`, error.message);
    return false;
  }
}

// Function to update and upload an SVG file
function updateAndUploadSvg(filePath) {
  const fileName = path.basename(filePath);
  
  console.log(`Processing ${fileName}...`);
  
  // Read the SVG file
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Update the href attributes with canister ID
  const updatedContent = updateSvgContent(content, CANISTER_ID);
  
  // Write the updated content back to a temporary file
  const tempFilePath = path.join(ASSETS_DIR, `temp_${fileName}`);
  fs.writeFileSync(tempFilePath, updatedContent);
  
  console.log(`Updated ${fileName} with /asset/ prefixes and canister ID`);
  
  // Upload the updated file
  const base64Content = encodeFileToBase64(tempFilePath);
  
  // Create the upload command with proper escaping
  const cmd = `dfx canister call ${CANISTER_ID} upload "(record {
    key = opt \\"${fileName}\\";
    content_type = \\"image/svg+xml\\";
    data = blob \\"${base64Content}\\";
    description = opt \\"Updated SVG for ${options.projectName}\\";
  })"`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    console.log(`Re-upload successful for ${fileName}`);
    console.log(`Result: ${result.trim()}`);
    
    // Remove temporary file
    fs.unlinkSync(tempFilePath);
    return true;
  } catch (error) {
    console.error(`Error uploading ${fileName}:`, error.message);
    
    // Remove temporary file if exists
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return false;
  }
}

// Main function to upload all assets
function uploadAllAssets() {
  console.log(`Scanning directory: ${ASSETS_DIR}`);
  console.log(`Upload mode: ${options.svgOnly ? 'SVG files only' : 'SVG and PNG files'}`);
  
  // Get all files in the assets directory
  const files = fs.readdirSync(ASSETS_DIR)
    .filter(file => {
      // Filter by configured file extensions
      const ext = path.extname(file).toLowerCase();
      return FILE_EXTENSIONS.includes(ext) && !file.startsWith('.');
    })
    .map(file => path.join(ASSETS_DIR, file));
  
  const fileTypes = options.svgOnly ? 'SVG' : 'asset';
  console.log(`Found ${files.length} ${fileTypes} files to upload`);
  
  // Upload each file
  let successCount = 0;
  for (const file of files) {
    const success = uploadFile(file);
    if (success) successCount++;
  }
  
  console.log(`\nUpload complete: ${successCount}/${files.length} files uploaded successfully`);
}

// Main function to update all SVG files
function updateAllSvgs() {
  console.log(`Scanning directory: ${ASSETS_DIR}`);
  
  // Get all SVG files in the directory
  const files = fs.readdirSync(ASSETS_DIR)
    .filter(file => file.toLowerCase().endsWith('.svg') && !file.startsWith('temp_'))
    .map(file => path.join(ASSETS_DIR, file));
  
  console.log(`Found ${files.length} SVG files to update and re-upload`);
  
  // Update and upload each file
  let successCount = 0;
  for (const file of files) {
    const success = updateAndUploadSvg(file);
    if (success) successCount++;
  }
  
  console.log(`\nUpdate complete: ${successCount}/${files.length} files updated and re-uploaded`);
}

// Combined operation: upload and then update SVG files
function uploadAndUpdateAssets() {
  // First upload all assets
  uploadAllAssets();
  
  // Then update SVG files
  updateAllSvgs();
}

// Check if we're connected to a replica
try {
  execSync('dfx ping', { stdio: 'ignore' });
} catch (error) {
  console.error('Error: dfx daemon is not running. Please start it with "dfx start" in another terminal.');
  process.exit(1);
}

// Print usage information if help is requested
if (options.command === 'help' || args.includes('--help')) {
  console.log(`
JBDucks NFT Asset Manager
=========================

Usage: node manage_assets.js <command> [options]

Commands:
  upload     Upload assets to the canister
  update     Update SVG files with proper asset paths and canister ID
  both       Upload assets and then update SVG paths (recommended for initial setup)
  help       Show this help message

Options:
  --svg-only           Upload only SVG files, skip PNG files
  --dir=<directory>    Specify the directory containing assets (default: 'svg')
  --canister=<id>      Specify the canister ID (default: 'bkyz2-fmaaa-aaaaa-qaaaq-cai')
  --project=<name>     Specify the project name for asset descriptions (default: 'JBDucks NFT')
  --help               Show this help message
  
Examples:
  node manage_assets.js upload                     # Upload all SVG and PNG files
  node manage_assets.js upload --svg-only          # Upload only SVG files
  node manage_assets.js update                     # Update SVG files with proper paths
  node manage_assets.js both                       # Upload all files and update SVG paths
  node manage_assets.js both --dir=my-assets       # Use custom directory
  node manage_assets.js both --project="My NFT"    # Set custom project name
`);
  process.exit(0);
}

// Execute the appropriate command
switch (options.command) {
  case 'upload':
    uploadAllAssets();
    break;
  case 'update':
    updateAllSvgs();
    break;
  case 'both':
    uploadAndUpdateAssets();
    break;
  default:
    console.log(`Unknown command: ${options.command}`);
    console.log('Use "node manage_assets.js help" to see available commands.');
    process.exit(1);
}
