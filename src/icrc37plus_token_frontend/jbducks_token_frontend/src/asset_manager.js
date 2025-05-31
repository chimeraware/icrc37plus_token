import { icrc37plus_token_backend } from "../../declarations/icrc37plus_token_backend";

// Utility function to convert string to Uint8Array
function stringToUint8Array(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

// Utility function to convert Uint8Array to string
function uint8ArrayToString(array) {
  const decoder = new TextDecoder();
  return decoder.decode(array);
}

// Utility to convert file to Uint8Array
function fileToUint8Array(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      resolve(uint8Array);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Asset Manager Class
class AssetManager {
  constructor() {
    this.backend = icrc37plus_token_backend;
  }

  // Bootstrap first admin (call once to initialize)
  async bootstrapFirstAdmin() {
    try {
      const result = await this.backend.bootstrap_first_admin();
      return result;
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      throw error;
    }
  }

  // Upload a text file
  async uploadTextFile(text, filename, description = null) {
    try {
      const data = stringToUint8Array(text);
      const args = {
        key: filename ? [filename] : [],
        content_type: "text/plain",
        data,
        description: description ? [description] : []
      };
      
      const result = await this.backend.upload(args);
      return result;
    } catch (error) {
      console.error("Error uploading text:", error);
      throw error;
    }
  }

  // Upload any file
  async uploadFile(file, customFilename = null, description = null) {
    try {
      const data = await fileToUint8Array(file);
      const filename = customFilename || file.name;
      
      const args = {
        key: [filename],
        content_type: file.type || "application/octet-stream",
        data,
        description: description ? [description] : []
      };
      
      const result = await this.backend.upload(args);
      return result;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }

  // Download a file
  async downloadFile(key) {
    try {
      const result = await this.backend.download(key);
      
      if ("Ok" in result) {
        return {
          data: result.Ok.data,
          contentType: result.Ok.content_type,
          metadata: result.Ok.metadata
        };
      } else {
        throw new Error(result.Err);
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      throw error;
    }
  }

  // List all assets
  async listAssets() {
    try {
      const result = await this.backend.list_assets();
      
      if ("Ok" in result) {
        return result.Ok;
      } else {
        throw new Error(result.Err);
      }
    } catch (error) {
      console.error("Error listing assets:", error);
      throw error;
    }
  }

  // Delete an asset
  async deleteAsset(key) {
    try {
      const result = await this.backend.delete_asset(key);
      
      if ("Ok" in result) {
        return true;
      } else {
        throw new Error(result.Err);
      }
    } catch (error) {
      console.error("Error deleting asset:", error);
      throw error;
    }
  }
}

export default AssetManager;
