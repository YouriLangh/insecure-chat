# insecure-chat

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

Step 7: Using helmet as a middleware
to ensure CSP & HTTPs n such

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
Added E2EE, with a new symm key per msg. To do this i have to get all the public keys of all members that are currently in all private/direct channel with e, and then we keep a map of the username - key.
This means that everytime a user joins, their key is added to the map
(deletion not yet implemented)
We send encrypted symm keys of all members in a channel to server for a message, including for ourselves, as we work with events.

The person who clicks on the direct channel as second doesnt get the key of the other person??
Solved:
nr of members in a channel is wrnog (maybe only newly created one?)
Users show as online eventhough they aren't. ==> Might be a bug?? Not logging them out perhaps all the time.

Array on client side is fucked due to ids and private channels.
To recreate, have 2 clients open, have them both open a private channel. Then disconnect on B and try to navigate to that private channel. and try to click on some of the channels --> Undefined
FIXED: frontend code used array indexing, now we use find to look for ids. ==> FIXED THEIR CODE XDD LMAO

Generate key per registration, can be used for DoS attacks, but its mostly client side. Otherwise cant make multiple accs from same terminal/process.

Next steps:

So now everytime a user would login, they get the publickeys of everyone. So if a new direct/private channel is made, they won't have access to the keys of the people in it, this has to be added.
SO: If u make direct --> exchange public keys
if u are added to a channel : get all keys of members, and for each member give them your key.
If u go into a channel & fetch the messages, have to fetch the keys of each message too.
==> You dont?

same keys for user if started in same process?
Messages get encrypted when the user is in a private or direct channel. Can never read old messages (fix this shit, just do 1 key per channel), and never update it. And also when fetching messages, need the channel key. & if ppl join or leave, have to update the people ==> no right? If making new acc from same terminal ==> same keys?? cant make 2 accs on 1 terminal or what.
add maximum length to all inputs.
look into socket.io-rate-limiter
Enable certificate verification for HTTPS. (NEED TO FIX!!!!) Send mail to Jim.

Sanitize on server side for every request. ==> Should be fine tbh.
JWT & session management.
Perhaps helmet for secure headers and CSP !!!!! ==> Not too sure if i am forcing these things yet
Enforce HTTPS on server side?? Helmet can do this i think

add openid
