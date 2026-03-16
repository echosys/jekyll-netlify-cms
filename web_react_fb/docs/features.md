# Features Documentation — Realtime Database Backend

The migration to Firebase Realtime Database enables several key features and improvements for the application.

## Key Features

### 1. Real-time Synchronization
All tree data changes (nodes, edges, metadata) are instantly propagated to all connected users. This is achieved using Firebase RTDB's built-in `onValue` listeners, ensuring a collaborative and consistent experience.

### 2. Base64 Resource Management
- **In-Database Storage**: Images and other resources are stored as base64 strings directly within the tree node.
- **Atomic Operations**: Updating a tree and its associated images can be done in fewer network requests, reducing the risk of partial sync issues.
- **Portability**: Exporting or importing trees is simplified as the JSON payload contains all necessary image data.

### 3. State-of-the-art Locking
The application uses a dedicated `locks/` node in RTDB to manage cooperative editing.
- **Instant Feedback**: When a user acquires a lock, all other users see the locked status immediately.
- **Automatic Expiration**: (Planned) Locks can be configured to expire or be cleared if a session is disconnected.

### 4. Simplified Access Control
User roles and tree access permissions are stored in the `users_famt` node. This allows the application to:
- Quickly fetch user profile data on sign-in.
- Dynamically grant or revoke access to specific trees.
- Manage "dev" vs "user" roles for administrative tasks.

## Technical Benefits
- **Zero Configuration Blob Storage**: No need to configure Firebase Storage buckets or handle complex CORS rules.
- **Unified Adapter**: The `realtimeDbAdapter.ts` provides a clean, unified interface for all persistence needs, making the codebase easier to maintain.
- **Improved Performance**: Reduced latency for small image previews and metadata updates compared to separate Storage API calls.
