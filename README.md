# insecure-chat

Step 1:
Started by sanitizing the login input with sanitize-html, and then an additional regex to ensure only characters/numbers were used

Step 2:
Added password fields and a register form to ensure users are unique & authenticated correctly

Step 3:
Created a CA (using mkcert) on the local device to ensure HTTPS connection for safe transfer or login/register data to the server.
(Perhaps still vulnerable from the local device)

Step 4:
