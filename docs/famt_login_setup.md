# MongoDB Setup — `famt_login` Database
# For the FamTree multi-user login and lock system

Database: MongoDB Atlas (or local)
Database name: `famt_login`
Used by: `/api/mongo-login`, `/api/mongo-lock`


# Run MongoDB locally with Docker

## 1. Pull the image
```bash
docker pull mongo:7
```

## 2. Run the container
```bash
docker run -d \
  --name famt-mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  -v famt-mongo-data:/data/db \
  mongo:7
```

- `-d` → runs in background
- `-p 27017:27017` → exposes mongo on localhost
- `-v famt-mongo-data:/data/db` → persists data in a named Docker volume

## 3. MONGO_URI for .env.local
```env
MONGO_URI=mongodb://admin:secret@localhost:27017/famt_login?authSource=admin
```

## 4. Seed the database
```bash
docker exec -it famt-mongo mongosh \
  -u admin -p secret --authenticationDatabase admin \
  famt_login \
  --eval "
    db.famt_login.createIndex({ username: 1 }, { unique: true });
    db.famt_login.createIndex({ lastActivity: -1 });
    db.famt_login.insertMany([
      { username: 'alice', phrase: 'mydevphrase',   role: 'dev',  color: '#1E88E5', lastActivity: 0 },
      { username: 'bob',   phrase: 'bobuserphrase', role: 'user', color: '#43A047', lastActivity: 0 }
    ]);
    db.famt_lock.insertOne({ _id: 'global', holder: null, holderActivity: 0 });
  "
```

## 5. Useful commands
```bash
# Check container is running
docker ps | grep famt-mongo

# Open interactive mongosh shell
docker exec -it famt-mongo mongosh -u admin -p secret --authenticationDatabase admin famt_login

# Stop the container
docker stop famt-mongo

# Start it again later (data is preserved in the volume)
docker start famt-mongo

# Remove container + keep data
docker rm famt-mongo

# Remove container + wipe data
docker rm famt-mongo && docker volume rm famt-mongo-data
```



---

## 1. Connection

```bash
mongosh "$MONGO_URI"
```

Switch to the app database:

```js
use famt_login
```

---

## 2. Collections

| Collection   | Purpose                                               |
|---|---|
| `famt_login` | One document per user — credentials, role, color      |
| `famt_lock`  | Single document — global write-lock state             |

---

## 3. Create Users

Each document = one user.

```js
use famt_login

// Dev user — gets manual PG connection flow
db.famt_login.insertOne({
  username: "alice",
  phrase: "mydevphrase",          // plaintext — prototype only
  role: "dev",
  color: "#1E88E5",               // hex color for avatar circle
  lastActivity: 0
})

// Regular user — auto-connects via VITE_PG_CONN
db.famt_login.insertOne({
  username: "bob",
  phrase: "bobuserphrase",
  role: "user",
  color: "#43A047",
  lastActivity: 0
})

// Add more users as needed — pick colors from:
// #E53935, #8E24AA, #1E88E5, #00897B, #43A047,
// #FB8C00, #F4511E, #6D4C41, #1565C0, #00838F, #2E7D32, #AD1457
```

---

## 4. Create the Lock Document

The lock collection is auto-initialized by the API on first request.
But you can pre-create it:

```js
use famt_login

db.famt_lock.insertOne({
  _id: "global",
  holder: null,
  holderActivity: 0
})
```

---

## 5. Indexes

```js
use famt_login

// Fast lookup by username + phrase on login
db.famt_login.createIndex({ username: 1 }, { unique: true })

// Fast online-users query (users active in last 90s)
db.famt_login.createIndex({ lastActivity: -1 })
```

---

## 6. User Document Shape

```json
{
  "_id": ObjectId("..."),
  "username": "alice",
  "phrase": "mydevphrase",
  "role": "dev",
  "color": "#1E88E5",
  "lastActivity": 1741600000000,
  "forcedByMsg": null
}
```

### Field reference

| Field          | Type              | Description                                              |
|---|---|---|
| `username`     | string            | Login name shown in UI                                   |
| `phrase`       | string            | Plaintext passphrase (prototype — hash for production)   |
| `role`         | `"dev"` or `"user"` | `dev` = manual PG flow; `user` = auto-connect          |
| `color`        | string (hex)      | Avatar circle background color                           |
| `lastActivity` | number (epoch ms) | Updated on every heartbeat; used to detect online status |
| `forcedByMsg`  | string or null    | Set by server when a dev force-takes the lock            |

---

## 7. Lock Document Shape (`famt_lock` collection)

```json
{
  "_id": "global",
  "holder": "alice",
  "holderActivity": 1741600000000
}
```

| Field            | Type              | Description                                           |
|---|---|---|
| `_id`            | `"global"`        | Single document — always this ID                      |
| `holder`         | string or null    | Username of current lock holder; null = free          |
| `holderActivity` | number (epoch ms) | Holder's last heartbeat; if > 60s stale, lock expires |

---

## 8. Role Behavior Summary

| Role   | PG Connection            | Lock          | Force-take |
|---|---|---|---|
| `dev`  | Manual (via DB dialog)   | Can request   | Yes        |
| `user` | Auto (VITE_PG_CONN env)  | Can request   | No         |

---

## 9. Environment Variables

Add to `.env.local` (local dev) and Vercel dashboard (production):

```env
# MongoDB connection string pointing at famt_login db
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/famt_login?retryWrites=true&w=majority

# PostgreSQL connection string for "user" role auto-connect
# Format: postgres://user:pass@host:port/dbname?sslmode=require&schema=public&table=family_trees
VITE_PG_CONN=postgres://user:password@host:5432/dbname?sslmode=require&schema=public&table=family_trees
```

---

## 10. Lock State Machine

```
All users on login
        │
        ▼
   READ-ONLY mode (status: 3 yellow)
   - Polls DB every 5s (pull only)
   - Cannot save changes
        │
        │  Click "Request Lock" (if no one holds it)
        ▼
   WRITE mode (status: 5 green)
   - Polls DB every 5s (push if dirty, pull if clean)
   - Sends heartbeat every 5s
   - Lock auto-expires 60s after last heartbeat
        │
        ├── Click "Release Lock" → back to READ-ONLY
        ├── Tab goes to background → heartbeat stops → server auto-releases after 60s
        └── Dev "Force Take" → kicked back to READ-ONLY, notified via banner
```

---

## 11. Sync Status Colors

| Color  | Status | Meaning                              |
|---|---|---|
| ⚪ Grey   | 1 | Not syncing (sync off)               |
| 🔵 Blue   | 2 | Reading from DB                      |
| 🟡 Yellow | 3 | Read-only idle (no lock held)        |
| 🟠 Orange | 4 | Writing to DB                        |
| 🟢 Green  | 5 | Write-lock held, synced / idle       |

