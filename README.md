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

Next steps:
Ensure storage on db and not in local memory
Enable certificate verification for HTTPS. (NEED TO FIX!!!!)
Ensure users can only register by comparing with LOWERCASE letters.
Ensure regex's cant be the cause of DoS attacks
Sanitize on server side for every request.
JWT & session management.
Perhaps helmet for secure headers and CSP !!!!! ==> Not too sure if i am forcing these things yet
Enforce HTTPS on server side?? Helmet can do this i think

add openid
