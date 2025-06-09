// Simple vanilla JS to call the canister without DFINITY packages
// This uses the raw IC protocol over HTTP

// Configuration
const CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"; // Replace with your actual canister ID
const IC_HOST = "http://localhost:4943"; // Local replica
const IDENTITY_PRINCIPAL = "2vxsx-fae"; // Anonymous principal

// Function to call the canister
async function callCanister(canisterId, methodName, args = []) {
  // Create the request payload
  const request = {
    request_type: "query",
    sender: IDENTITY_PRINCIPAL,
    canister_id: canisterId,
    method_name: methodName,
    arg: encodeArgs(args)
  };

  try {
    // Make the HTTP request to the IC
    const response = await fetch(`${IC_HOST}/api/v2/canister/${canisterId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Raw response:', result);
    
    if (result.status === 'replied') {
      return decodeResult(result.reply.arg);
    } else if (result.status === 'rejected') {
      throw new Error(`Call rejected: ${result.reject_message}`);
    } else {
      throw new Error(`Unexpected response status: ${result.status}`);
    }
  } catch (error) {
    console.error('Error calling canister:', error);
    throw error;
  }
}

// Simple encoding function (this is a simplified version)
function encodeArgs(args) {
  // For whoami, we don't need any arguments, so return empty array
  return [];
}

// Simple decoding function (this is a simplified version)
function decodeResult(resultBytes) {
  // For whoami, we expect a principal as result
  // This is a simplified decoder that just returns the raw result
  return `Raw result received. For actual decoding, you would need to parse the Candid format.`;
}

// Test the whoami method
async function testWhoami() {
  console.log(`Testing whoami method on canister ${CANISTER_ID}...`);
  try {
    const result = await callCanister(CANISTER_ID, "whoami");
    console.log("Whoami result:", result);
  } catch (error) {
    console.error("Whoami test failed:", error);
  }
}

// Run the test
testWhoami();

// Alternative approach using simple XMLHttpRequest
function testWhoamiXHR() {
  console.log(`Testing whoami method using XMLHttpRequest...`);
  
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${IC_HOST}/api/v2/canister/${CANISTER_ID}/query`, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  
  xhr.onload = function() {
    if (xhr.status === 200) {
      console.log('XHR Success:', JSON.parse(xhr.responseText));
    } else {
      console.error('XHR Error:', xhr.statusText);
    }
  };
  
  xhr.onerror = function() {
    console.error('XHR Request failed');
  };
  
  const payload = {
    request_type: "query",
    sender: IDENTITY_PRINCIPAL,
    canister_id: CANISTER_ID,
    method_name: "whoami",
    arg: []
  };
  
  xhr.send(JSON.stringify(payload));
}

// Uncomment to run the XHR test
// testWhoamiXHR();
