# Realtime Database schema and locking

Date: 260315 (2026-03-15)

This document describes the schema and locking behavior for the application using Firebase Realtime Database.

### Schema
- **Trees**: Stored under `trees/{treeId}`. Includes JSON data and base64-encoded images.
- **Users**: Stored under `users_famt/{uid}` for isolation.
- **Locks**: Stored under `locks/{treeId}` for cooperative editing.

### Locking Design
- **Cooperative**: Clients must acquire a lock before saving changes to a tree.
- **Real-time**: Lock status is instantly visible to all connected users.
- **Path**: `locks/{treeId}` stores the current holder's identifier and acquisition timestamp.

Refer to `docs/database.md` for full technical details.
