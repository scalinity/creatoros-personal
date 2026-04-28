# CreatorOS Inspiration Saver Extension

Phase 20 scaffold for saving selected X/Twitter inspiration into CreatorOS Personal.

## Security Boundary

- Uses `Authorization: Bearer <personal_save_token>` only against `POST /api/inspiration/save`.
- Token scope is `inspiration:create`.
- The CreatorOS API reflects only exact origins configured in `CHROME_EXTENSION_ORIGINS`; unknown Chrome extension origins are rejected.
- The manifest is limited to X/Twitter and local CreatorOS development origins. Add your exact deployed CreatorOS origin before packaging a production copy.
- The extension never reads CreatorOS data.
- The extension never publishes, updates, deletes, or calls AI endpoints.
- Raw personal save tokens are stored locally by the browser extension and can be revoked or rotated in `/settings/tokens`.

## Files

```text
manifest.json
src/api.ts
src/content-script.ts
src/popup.tsx
src/options.tsx
src/popup.html
src/options.html
```

The TypeScript files are the source scaffold. Compile them to the JavaScript filenames referenced by `manifest.json` (`content-script.js`, `popup.js`, `options.js`) before loading the unpacked extension.

## Setup

1. In CreatorOS, open `/settings/tokens`.
2. Create a personal save token and store the shown-once raw value.
3. Compile the TypeScript sources, then load the unpacked extension and copy its `chrome-extension://<id>` origin from Chrome.
4. Set `CHROME_EXTENSION_ORIGINS=chrome-extension://<id>` on the CreatorOS server and restart the app.
5. Open extension options and set the CreatorOS app URL plus the personal save token.
6. Select text inside an X post and click **Save inspiration**.

If a token is revoked, rotated, expired, missing, from an unapproved extension origin, or rate-limited, the endpoint rejects the save without returning private CreatorOS data.
