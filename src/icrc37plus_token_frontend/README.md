# ICRC37+ Token Frontend

This is a Svelte-based frontend for the ICRC37+ token project.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation

```bash
npm install
```

### Development

To run the development server:

```bash
npm run dev
```

### Building for Production

To build the frontend for deployment:

```bash
npm run build
```

This will create a `dist` folder with the compiled static files that will be served by the ICP frontend canister.

### Project Structure

- `src/routes/+page.svelte` - Main page component
- `src/routes/+layout.svelte` - Layout component
- `src/app.html` - Main HTML template
- `src/app.css` - Global styles
- `static/` - Static assets
- `dist/` - Built output (created after running `npm run build`)

### Integration with ICP

The built files in the `dist` folder are automatically served by the `icrc37plus_token_frontend` canister as configured in the project's `dfx.json`.

### Next Steps

1. Connect to your ICRC37+ backend canister
2. Implement token balance queries
3. Add transfer functionality
4. Create transaction history views
5. Build wallet integration
