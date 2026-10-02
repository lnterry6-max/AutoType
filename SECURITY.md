# Security

## Prototype security model

AutoType currently stores application state in browser `localStorage`. Passwords and security answers are salted and hashed before storage, but the entire account database and authorization state still live on the client.

This means the current account system is suitable only for local prototyping and playtesting.

## Important limitations

- a user can inspect or modify their own browser storage
- developer/admin privileges are not server-authoritative
- balances, inventory, tournament results, and leaderboard data are not tamper-resistant
- local lockouts are not a substitute for server-side rate limiting
- security questions should not be the primary recovery method in a production service
- there is no shared identity or session system between devices/browsers

## Production direction

Use a backend identity/session system, server-side authorization, a database, HTTPS, secure recovery, rate limiting, audit logging, and server-verified economy/tournament operations before treating AutoType as a live service.

Do not report vulnerabilities in this local prototype as if it handled real user data. If a production backend is introduced later, add a real vulnerability-reporting contact here.
