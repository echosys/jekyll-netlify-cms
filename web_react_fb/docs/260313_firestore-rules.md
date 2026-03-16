# Realtime Database Security Rules

Date: 260315 (2026-03-15)

This document describes the security rules for the Firebase Realtime Database. These rules replace the previous Firestore security rules.

```json
{
  "rules": {
    ".read": "false",
    ".write": "false",
    "users_famt": {
      "$uid": {
        ".read": "auth != null && (auth.uid == $uid || root.child('users_famt').child(auth.uid).child('role').val() == 'dev')",
        ".write": "auth != null && (auth.uid == $uid || root.child('users_famt').child(auth.uid).child('role').val() == 'dev')"
      }
    },
    "trees": {
      "$treeId": {
        ".read": "data.child('public').val() == true || (auth != null && (data.child('ownerUid').val() == auth.uid || data.child('allowed_uids').child(auth.uid).exists() || root.child('users_famt').child(auth.uid).child('role').val() == 'dev'))",
        ".write": "auth != null && (!data.exists() || data.child('ownerUid').val() == auth.uid || root.child('users_famt').child(auth.uid).child('role').val() == 'dev')",
        "images": {
          ".read": "parent().child('public').val() == true || (auth != null && (parent().child('ownerUid').val() == auth.uid || parent().child('allowed_uids').child(auth.uid).exists() || root.child('users_famt').child(auth.uid).child('role').val() == 'dev'))",
          ".write": "auth != null && (parent().child('ownerUid').val() == auth.uid || root.child('users_famt').child(auth.uid).child('role').val() == 'dev')"
        }
      }
    },
    "locks": {
      "$treeId": {
        ".read": "root.child('trees').child($treeId).child('public').val() == true || (auth != null && (root.child('trees').child($treeId).child('ownerUid').val() == auth.uid || root.child('trees').child($treeId).child('allowed_uids').child(auth.uid).exists() || root.child('users_famt').child(auth.uid).child('role').val() == 'dev'))",
        ".write": "auth != null"
      }
    }
  }
}
```

Notes:
- The rules enforce that users can only read/write their own profile in `users_famt`.
- Access to `trees/` is governed by ownership, public status, or explicit permission in `allowed_uids`.
- `dev` users have full access to all nodes.
- Images are stored under `trees/$treeId/images` and follow the same access patterns as their parent tree.
