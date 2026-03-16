# Deployment Guide — Firebase Realtime Database & Hosting

This document outlines the deployment configuration and security model for the application.

## Prerequisites

- Node.js version >= 20.0.0
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase Project created in the [Firebase Console](https://console.firebase.google.com/)

## Configuration

### Firebase Hosting & Database
The project is configured via `firebase.json`:
- **Hosting**: Serves the React application from the `dist` directory. All routes are rewritten to `index.html` to support client-side routing.
- **Database**: Uses `database.rules.json` for Realtime Database security.
- **Project Mapping**: The `.firebaserc` file links the local environment to the Firebase project `myprojt1`.

### Security Rules (database.rules.json)
The security model is based on user authentication and roles:

- **Authentication**: All data access (except for specific shared paths) requires a signed-in user.
- **User Profiles (`users_famt`)**:
    - Users can read and write their own profile (`/users_famt/$uid`).
    - Users with the `dev` role have full read/write access to all profiles.
- **Trees (`trees`)**:
    - Authenticated users can list and read tree data.
    - **Ownership**: Only the owner (matching `ownerUid`) or a user with the `dev` role can write to a tree's data or its associated images.
- **Secondary App (`users_cb`)**:
    - The database also supports a secondary application with its own isolated rules under `/users_cb`.

## Deployment Steps

1. **Build the Application**:
   ```bash
   npm run build
   ```

2. **Login to Firebase**:
   ```bash
   npx firebase login
   ```

4.  **Deployment**: 
nvm use 24
npm install --save-dev typescript
`npm run build && npx firebase deploy --only hosting,database`

## User Account Management

With the removal of the in-app "Create Account" option, users must be managed manually:
1.  **Firebase Auth**: Go to the Firebase Console > Build > Authentication > Users. Click **Add user** to create an email/password account.
2.  **Database Profile**: After creating the user in Auth, they will automatically get a minimal profile in the `users_famt` node upon their first successful login. You can then upgrade their `role` to `dev` or specify `allowed_trees` manually in the Realtime Database Data tab.

## Environment Variables & "Not configured" Errors

If the "Server Status" in the login page shows **Not configured** after deployment, it means the `firebase.config` file was missing or invalid during the build process.

### Configuration File
The application prioritizes the `firebase.config` file in the project root. Ensure this file contains your JSON configuration:

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "databaseURL": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}
```

### Build Environment
Vite will bundle this file into the production build. No additional environment variables are required on the server (though you can still use them as fallbacks if needed).

## Database Rules Deployment

The command `npx firebase deploy --only hosting,database` **does** update your database rules in the cloud. It reads the rules from `database.rules.json` (as configured in `firebase.json`) and pushes them to your project. You can verify this in the Firebase Console under Realtime Database > Rules.

## Local Development (Emulators)

To test the security rules and hosting behavior locally:
```bash
npx firebase emulators:start
```
This will start the Auth, Database, and Hosting emulators as configured in `firebase.json`.
