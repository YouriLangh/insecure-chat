# Chat platform with end-to-end encryption

The purpose of this project is to create a secure chat platform similar to Slack, which allows users to communicate messages in channels or as private messages.
This project is made for the class _Security in Computing_ 2024-2025.

## Project Setup Instructions

### 1. Start the PostgreSQL Container

No dotenv is needed as the default values are the same as the ones in the .env. Additionally, any database migrations database will happen automatically.

Make sure **Docker Desktop is running**, then start the container with:

```bash
docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5431:5432 -d postgres
```

### 2. Start the Client

Navigate to the client folder, install dependencies, and run the development server:

```bash
cd insecure-chat-client
npm install
npm run start
```

### 3. Start the Server

In a separate terminal, navigate to the server folder, install dependencies, and start the backend:

```bash
cd insecure-chat-server
npm install
npm start
```

## 🔐 Steps Taken to Secure the Application

### Step 0: Fixing Package Vulnerabilities

- Ran `npm audit fix` on the server & client to resolve known vulnerabilities in dependencies.

---

### Step 1: Input Sanitization

- Client-side: Sanitized login, registration, and any other user-generated inputs using `sanitize-html`.
- Server-side: Added regex validation to allow only alphanumeric characters and underscores for registration & login. Ensure passwords & usernames for login/registration are limited size.

---

### Step 2: User Authentication

- Implemented an account system: password fields and a registration form.
- Ensured usernames are unique and passwords are hashed using `bcrypt`.

---

### Step 3: HTTPS via Local CA

- Created a local certificate authority using [`mkcert`](https://github.com/FiloSottile/mkcert) to serve the app over HTTPS.
- Ran `mkcert -CAROOT` to configure trust on localhost.

> **Note:** Local devices may still be vulnerable if compromised & certificate verification had to be disabled to make this work.

---

### Step 4: Secure Database Usage

- Set up a PostgreSQL container using Docker.
- Stored user credentials in the database with hashed passwords.
- Relied on bcrypt's built-in salt handling.
- Compared hashed passwords securely during login.

---

### Step 5: Parameterized SQL Queries

- Used `pg` (node-postgres) with parameterized queries to prevent SQL injection.

---

### Step 6: Additional Server-Side Input Sanitization

- ~~Added _some_ extra input sanitization (`sanitize-html`) server-side to protect against tampering and injection.~~ ==> REMOVED

> **Note:** Not really necessary.

---

### Step 7: Secure HTTP Headers

- Used `helmet` middleware to enforce secure headers.
- Enforced HTTPS with minimum TLS 1.2 and HSTS (180 days) to prevent downgrade attacks.
- Client-side: Added a CSP (Content Security Policy). Inline scripts remain due to dynamic behavior in `chat.js`.

---

### Step 8: Rate Limiting (HTTP)

- Added rate limiting to the `/login` & `/register` route (max 10 attempts per 15 minutes) to prevent brute-force attacks & spamming.

---

### Step 9: WSS Support

- Upgraded WebSocket connections to use WSS (WebSocket over TLS).

> **Note:** Same as Step 3

---

### Step 10: Database Migration

- Migrated all stateful data (users, messages, etc.) to the PostgreSQL database.

---

### Step 11: Removed Case-Insensitive Username Matching

- Removed case-insensitive checks to maintain strict username uniqueness (removed for simplicity).

---

### Step 12: Indexing Fixes

- Adjusted frontend logic due to PostgreSQL starting serial IDs at `1`, while arrays in JS are 0-based. Now we look up rooms based on their object id, not simple id array-indexing.

> Note: This code was already incorrect in the skeleton.

```text
To recreate, have client A open a private channel. Then on client B make another public/private channel. Since the array assumes ids for indexes, it will try to navigate to array[id_new_channel_b] but the size will be smaller as client B does not have access to the private channel of client A. Causing the client to index outside of the array.
```

---

### Step 13: Regex DoS Protection

- Ensured regex validations aren't potential ReDoS vulnerabilities.

---

### Step 14: End-to-End Encryption (E2EE)

- Implemented E2EE using symmetric keys (one per message).
- Each client maintains a map of all users' public keys.
- Upon joining, a user's public key is broadcast to everyone.
- Clients store all public keys and their own private key.
  > Note: Key revocation/deletion is not yet implemented.

---

### Step 15: Encrypted Message Retrieval

- When entering a private/direct room, old messages are fetched and decrypted using matching `message_keys`.

> Note: If the user was not part of the channel when the messages were sent, the user can not decrypt the messages.

---

### Step 16: JWT Authentication

- JWTs added to WebSocket handshake for secure identity verification.
- JWTs not used for HTTP routes since none are sensitive, but framework is in place.

> Note: The JWTs are only used during WebSocket handshake. Once they expire (after connection setup), they never have to be refreshed if the user stays logged in.

---

### Step 17: Rate Limiting (WebSocket)

- Applied rate limiting for WebSocket actions (20 actions per 10 seconds per socket).

## 📓 Notes

We generate the RSA key pair upon registration, as otherwise we cannot make multiple accounts from the same terminal. Though this is not optimal, I don't see this being a security threat.

I was going to add refreshing of access tokens, but as they're just used to establish a wss, it seems like a bigger vulnerability risk to refresh them every so often than to just send them once.

## Threat - Protection strategy summary

Threat | Protection Strategy
Session Hijacking | HTTPS only, Secure+HttpOnly cookies, short-lived tokens, no localStorage
CSRF | Use SameSite cookies or JWT in headers, avoid storing tokens in cookies if possible
TLS Downgrade | HSTS header, disable HTTP, block old TLS versions
Session Fixation | Regenerate tokens/sessions on login
XSS / Code Injection | CSP headers, escape/sanitize input, Helmet
MITM | HTTPS/WSS, client pinning (optional), no mixed content

### How does SocketMap work?

For forced rooms, just IO.to(roomid)
But for any new rooms, rooms are added to the socket for that user.
