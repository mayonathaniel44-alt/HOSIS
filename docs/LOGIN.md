# Grand Horizon Hotel login

Start the API from `backend` with `npm start` (localhost port 5001).
Start the website from `frontend` with `npm run dev -- --host 127.0.0.1`.
Open the URL printed by Vite. Its `/api` proxy connects to the API.

The single `superadmin` account is stored in `database/hotel_sales.db`.
Passwords use salted scrypt hashes. Sessions use HttpOnly, SameSite cookies
and expire after eight hours. Sign out revokes the session on the server.
The dashboard requires a valid session and displays the account name and role.

`node backend/scripts/create-super-admin.js` provisions the account only if it
does not exist and prints a randomly generated password once. It does not
reset an existing account. Back up the database to preserve the account.
Keep the database private; do not publish it with the frontend.

Run authentication checks with `node --test backend/test/auth.test.js`.
Build the frontend with `npm run build --prefix frontend`.
The existing dashboard business records are still the app's sample data.
