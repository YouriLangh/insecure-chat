# insecure-chat

### Run instructions

I use a local database image of postgres, make sure docker desktop is running.

```bash
docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5431:5432 -d postgres
```

```bash
cd insecure-chat-client
npm install
npm run start
```

```bash
cd insecure-chat-server
npm install
npm start
```

### Steps performed to secure app

Step 0:
Ran npm audit fix to fix any vulnerabilities in the packages (server side)
Step 1:
Started by sanitizing the login input with sanitize-html, and then an additional regex to ensure only characters/numbers were used

Step 2:
Added password fields and a register form to ensure users are unique & authenticated correctly

Step 3:
Created a CA (using mkcert) on the local device to ensure HTTPS connection for safe transfer or login/register data to the server.
(Perhaps still vulnerable from the local device)
Run mkcert -CAROOT
to make this work on localhost

Step 4:
A simple DB is made in a container from the postgres image.
Users are then added to the database, with encrypted passwords. (if no other user with that name exists) Salts dont need to be stored as bcrypt stores them in the hash itself.
For logging in, we ensure a user exists and compared the plaintext pwd with the stored hash.

Step 5:
Correctly parametrizing SQL queries:
pg (node-postgres) is used to safely prepare and bind parameters.

Step 6:
Sanitizing inputs on teh server side (to prevent MiTM) attacks

Step 7: Using helmet as a middleware on server side (not rlly needed as we dont serve any content from server), but still need to enfoce min version of tls
Other than that we only listen on HTTPs so we cant see on HTTP [ & HTTPS & no TLS downgrade( HSTS is done by default by helmet (180 days))]
On client: ensure CSP with a CSP tag, still allows for inline scripts but code was too hard to change (they generate dynamically in chat.js and fuck that) ( no XSS).

Step 8:
Added rate limiting on login path to ensure people cannot spam attempts

Step 9: (basically same as HTTPS)
Switch to WSS as we are now operating on HTTPS

Step 10:
Add sanitation on all possible inputs on client side.

- Add channel (name and description)
- Message

Step 11:
Move to database

Step 12: Case insensitive checks for user registration / login ==> removed!!!

Step 13:
Had to perform id -1 on frontend very often (all but once, as postgres starts on 1 for serials but with array indexing we needed 0)

Step 14:
Add authlimiter to register aswell to prevent dos on bcrypt as bcrypt is slow

Step 15:
Limit inputs to X characters on register & login.

Step 16:
Ensure regex's cant be the cause of DoS attacks

Syep 17:
Added E2EE, with a new symm key per msg. To do this i have to get all the public keys of all user, and then we keep a map of the username - key.
This means that everytime a user joins, their key is added to the map. Each client owns all public keys & their own private key
(deletion not yet implemented)

Step 18:
When going into a room, fetch the old messages by joining on the message keys and then decrypt if its a direct or private room.

Step 19:
Added JWT auth for every HTTP req (no valuable routes anyways, so not implemented) (sent in body, safe vs WSHS)
Added JWT at the start of WS connection to verify user.
JWT is implemented with samesite & httpsonly

Step 20:
Rate limiting IO. 20actions / 10s, Its a different limiter per action

Solved:
nr of members in a channel is wrnog (maybe only newly created one?)
Users show as online eventhough they aren't. ==> Might be a bug?? Not logging them out perhaps all the time.

Array on client side is fucked due to ids and private channels.
To recreate, have 2 clients open, have them both open a private channel. Then disconnect on B and try to navigate to that private channel. and try to click on some of the channels --> Undefined
FIXED: frontend code used array indexing, now we use find to look for ids. ==> FIXED THEIR CODE XDD LMAO

Generate key per registration, can be used for DoS attacks, but its mostly client side. Otherwise cant make multiple accs from same terminal/process.

Next steps:
look into socket.io-rate-limiter
add openid

Enable certificate verification for HTTPS. (NEED TO FIX!!!!) Send mail to Jim.

Clean all the code
add maximum length to all inputs. (client side)
Sanitize on server side for every request. ==> Should be fine tbh. (limit on input or so idk)

Threat | Protection Strategy
Session Hijacking | HTTPS only, Secure+HttpOnly cookies, short-lived tokens, no localStorage
CSRF | Use SameSite cookies or JWT in headers, avoid storing tokens in cookies if possible
TLS Downgrade | HSTS header, disable HTTP, block old TLS versions
Session Fixation | Regenerate tokens/sessions on login
XSS / Code Injection | CSP headers, escape/sanitize input, Helmet
MITM | HTTPS/WSS, client pinning (optional), no mixed content
