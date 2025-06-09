import { json } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').RequestHandler} */
export function GET({ url }) {
  // Check if the request is for the Chrome DevTools JSON file
  if (url.pathname.endsWith('com.chrome.devtools.json')) {
    // Return an empty JSON object
    return json({});
  }
  
  // Return a 404 for other requests to this path
  return new Response('Not found', { status: 404 });
}
