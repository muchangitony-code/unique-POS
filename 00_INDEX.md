# UniquePOS — Documentation

Complete documentation for deploying, operating, and extending UniquePOS on
ordinary Node.js hosting (Truehost cPanel + Passenger).

| # | Document | What it covers |
|---|---|---|
| 01 | [Deployment guide](01_DEPLOYMENT_TRUEHOST.md) | Every step from uploading files to starting the app on Truehost cPanel. |
| 02 | [Database setup](02_DATABASE_SETUP.md) | PostgreSQL creation, fresh-install script, and how migrations work. |
| 03 | [Environment variables](03_ENVIRONMENT.md) | Full `.env` template with an explanation of every variable. |
| 04 | [Administrator credentials](04_ADMIN_CREDENTIALS.md) | Default admin login and how to create/reset the first admin. |
| 05 | [System documentation](05_SYSTEM_DOCUMENTATION.md) | Architecture, features, folder structure, API reference, maintenance. |
| 06 | [Backup & recovery](06_BACKUP_RESTORE.md) | Full backup and disaster-recovery procedures. |
| 07 | [Multi-branch deployment](07_MULTI_BRANCH.md) | Running multiple branches on one central database. |
| 08 | [Feature roadmap](08_ROADMAP.md) | eTIMS, M-Pesa, barcode printing, receipt printers, offline sync. |
| 09 | [Licensing & ownership](09_LICENSING_AND_OWNERSHIP.md) | Ownership and confirmation of no Replit runtime dependencies. |

## Quick start
1. Create a PostgreSQL database and load `db/database.sql` → **02**.
2. Upload & extract `uniquepos-standalone.zip`, create the Node.js app with
   startup file `app.js` → **01**.
3. Set `DATABASE_URL`, `SESSION_SECRET`, `APP_URL` → **03**.
4. Run NPM Install, Restart, log in, change the admin password → **04**.

Default admin: `admin@uniquepos.com` / `Test1234!` — change it immediately.
