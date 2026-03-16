# Migration notes and feature updates (Firestore → Realtime Database)

Date: 260315 (2026-03-15)

This document tracks the second phase of the backend migration: moving from Firestore and Storage to Realtime Database.

### Risks and Mitigations
- **Data size**: RTDB has a limit per database (though very high). Large images are compressed and stored as base64. A 10MB limit per top-level node is generally expected for efficient performance, so trees should be kept within reasonable bounds.
- **Simplified sync**: Moving back to a real-time system (RTDB) allows for much simpler synchronization code compared to polling or Firestore listeners in some edge cases.

### Features
- **Instant sync**: All clients see changes immediately.
- **Atomic updates**: Tree metadata and resources can be updated in fewer operations.
- **Single Source of Truth**: RTDB is now the only persistence layer used for application data.
