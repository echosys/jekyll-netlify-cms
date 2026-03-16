# Realtime Database Schema

Date: 260315 (2026-03-15)

This document describes the schema for the Firebase Realtime Database. This replaces the previous Firestore schema proposal.

## Nodes

### `trees/{treeId}`
Stores metadata and the full JSON tree data.
- `tree_name`: string
- `ownerUid`: string (UID of the creator)
- `public`: boolean
- `lastUpdatedAt`: number (timestamp)
- `data`: object (Full tree JSON matching `Tree` model in `src/models/types.ts`)
- `resources`: array (List of resource metadata objects)
- `images/{resourceId}`: object (Image data)
  - `filename`: string
  - `data`: string (Base64-encoded image data)
  - `contentType`: string
  - `size`: number
  - `createdAt`: number

### `users_famt/{uid}`
Stores user profile information.
- `username`: string
- `role`: string ('dev' or 'user')
- `displayName`: string
- `avatarColor`: string (Hex code)
- `allowed_trees`: array (List of tree IDs the user can access)

### `locks/{treeId}`
Manages concurrent editing locks.
- `holder`: string (username or UID)
- `acquiredAt`: number (timestamp)

## Notes
- Images are stored as base64 strings directly within the tree node to ensure atomic updates and simplify sync logic.
- The `users_famt` node is used to separate user data for this application from other apps in the same project.
