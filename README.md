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

Next steps:
Correct the login (an error on server is still interpreted as a success during login, and perhaps registration as well.)

Verify that this is the safest way to do it.
Ensure everything is correctly sanitized
How to sanitize passwords?? ==> Check that input = sanitization and validation

Add sanitation on all possible inputs on client side.
ensure sanitation on server side, no SQL injections possible. Perhaps also do HTML injections or so (if MITM replaces message)
Ensure storage on db and not in local memory
add openid
Enable certificate verification for HTTPS. (NEED TO FIX!!!!)
