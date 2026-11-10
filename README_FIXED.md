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
1. Install Node.js 24.12 or later (the Firebase version in this project requires it).
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

## Important
- `.env.local` was intentionally not included in this repaired ZIP to avoid sharing project configuration values. Keep your original local `.env.local` or recreate it from `.env.example`.
- This repair fixes the confirmed route mismatch. It does not change your Firebase project, database rules, or email-verification settings.
