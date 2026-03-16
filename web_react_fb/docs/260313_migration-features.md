# Migration notes & feature changes — Realtime Database migration

Date: 260315 (2026-03-15)

The application has been migrated from Firestore and Firebase Storage to **Firebase Realtime Database**.

### Key Decisions
1. **Unified Storage**: All tree metadata, full tree JSON data, and image resources are stored in Realtime Database.
2. **Base64 Resources**: Images are converted to base64 strings and stored under the `images/` node of each tree. This ensures that a tree and its resources are always synchronized.
3. **User Isolation**: User profiles are stored in the `users_famt/` node to avoid collisions with other applications in the same Firebase project.
4. **Locking**: State-of-the-art cooperative locking is implemented using a dedicated `locks/` node in ETDB.

### Minimal Feature Changes
- **No Cloud Storage**: The dependency on Firebase Storage has been removed.
- **Improved Sync**: Real-time updates are handled natively by RTDB listeners.
- **Portability**: Trees can be exported as a single JSON file containing all resources.
