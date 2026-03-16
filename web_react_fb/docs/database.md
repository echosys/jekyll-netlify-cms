# Database Documentation — Firebase Realtime Database Migration

This project has migrated from Firestore and Firebase Storage to **Firebase Realtime Database (RTDB)**. All application data and image resources are now persisted within the Realtime Database.

## Overview

The migration aims to simplify the backend by using a single service for both structured data and binary resources (stored as base64-encoded strings). Firebase Storage is no longer used for resource persistence.

## Schema Structure

The Realtime Database is organized into several top-level nodes:

```json
{
  "trees": {
    "folder_name_1": {
      "tree_name": "My Tree",
      "ownerUid": "user_uid",
      "public": true,
      "lastUpdatedAt": 1678891234567,
      "data": {
        "tree_id": "...",
        "nodes": [],
        "edges": [],
        "resources": [
          {
            "id": "res1",
            "filename": "image.jpg",
            "size": 12345
          }
        ]
      },
      "images": {
        "res1": {
          "filename": "image.jpg",
          "data": "/9j/4AAQSkZJRg...", 
          "contentType": "image/jpeg",
          "size": 12345,
          "createdAt": 1678891234567
        }
      }
    }
  },
  "users_famt": {
    "uid_1": {
      "username": "dev",
      "role": "dev",
      "avatarColor": "#E53935",
      "lastActivity": 1678891234567,
      "allowed_trees": ["folder_name_1"]
    }
  },
  "locks": {
    "folder_name_1": {
      "holder": "dev",
      "acquiredAt": 1678891234567
    }
  }
}
```

## Image Resources (Base64)

Image resources are stored under the `images/` sub-node of each tree. 
- **Storage**: Images are converted to base64-encoded strings on the client and written directly to RTDB.
- **Retrieval**: The application fetches the base64 string and constructs a Data URL (`data:image/jpeg;base64,...`) for rendering.
- **Benefit**: Atomic updates for tree data and related images, simplified backup/restore, and no dependency on Firebase Storage API limits or complex CORS configurations.

## Locking Mechanism

Locking is handled per-tree under the `locks/` node. Real-time updates via RTDB listeners ensure that lock status changes are propagated instantly to all connected clients.
