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

Solved:
nr of members in a channel is wrnog (maybe only newly created one?)
Users show as online eventhough they aren't. ==> Might be a bug?? Not logging them out perhaps all the time.

Array on client side is fucked due to ids and private channels.
To recreate, have 2 clients open, have them both open a private channel. Then disconnect on B and try to navigate to that private channel. and try to click on some of the channels --> Undefined
FIXED: frontend code used array indexing, now we use find to look for ids. ==> FIXED THEIR CODE XDD LMAO
Enable certificate verification for HTTPS. (NEED TO FIX!!!!)
Ensure regex's cant be the cause of DoS attacks

Next steps:

Perform E2EE
When user leaves a channel, remove their ui and reset to general chat. Otherwise they can still see messages.
Sanitize on server side for every request. ==> Should be fine tbh.
JWT & session management.
Perhaps helmet for secure headers and CSP !!!!! ==> Not too sure if i am forcing these things yet
Enforce HTTPS on server side?? Helmet can do this i think

add openid
