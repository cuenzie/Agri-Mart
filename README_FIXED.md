# Agri-Mart - marketplace and routing

Agri-Mart is a marketplace for agricultural tools, equipment, seeds, and other farm supplies.

## What is included
- Updated the app design and branding for the Agri-Mart marketplace.
- Added the missing `/dashboard` route and connected it to the existing Dashboard page.
- Kept `/home` as the public landing page.
- Protected `/dashboard` so only a signed-in, email-verified user can open it.
- Updated `/` and unknown routes to return to the public landing page.
- Updated successful-login redirection compatibility (`/dashboard`).

## Setup
1. Install Node.js 22.22.3 (the version used by the Netlify build configuration).
2. Open this project folder in VS Code.
3. Create `.env.local` in the project root using `.env.example` as the template.
4. Fill in the Firebase Web App configuration values from Firebase Console > Project settings > Your apps.
5. In Firebase Authentication, enable Email/Password and add the development domain to Authorized domains.
6. In Firestore, configure security rules that allow a signed-in user to create/read only their own `users/{uid}` profile.
7. Run:

```bash
npm install
npm run dev
```

## Deploy to Netlify
1. Import the `cuenzie/Agri-Mart` GitHub repository into Netlify.
2. Netlify reads `netlify.toml`, which configures `npm run build`, the `dist` publish directory, and SPA route fallback.
3. In **Site configuration > Environment variables**, add the values from `.env.example`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_CLOUDINARY_CLOUD_NAME`
   - `VITE_CLOUDINARY_UPLOAD_PRESET`
4. Trigger a deploy. Vite embeds `VITE_*` variables during the build, so redeploy after changing them.
5. Add the deployed Netlify domain to Firebase Authentication's **Authorized domains**. Configure any related provider redirect domains as required.
6. If the deployed page reports `auth/invalid-api-key`, replace `VITE_FIREBASE_API_KEY` with the Web API key from Firebase Console > Project settings > Your apps, then trigger a new deploy.
7. If sign-in reports `auth/auth-domain-config-required`, set `VITE_FIREBASE_AUTH_DOMAIN` to the `authDomain` value from that Firebase Web App configuration (usually `<project-id>.firebaseapp.com`), then trigger a new deploy. This is separate from adding the Netlify site domain to Firebase Authentication's Authorized domains.

## Important
- `.env.local` and other `.env.*` files are ignored by Git; `.env.example` contains placeholders only. Set real values in Netlify's environment variables and keep them out of source control.
- This repair fixes the confirmed route mismatch. It does not change your Firebase project, database rules, or email-verification settings.
