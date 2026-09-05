# UniquePOS — Administrator Credentials

## Default administrator (seeded install)

If you initialised the database using the bundled `db/database.sql`
(see `02_DATABASE_SETUP.md` → Option A), a default administrator already exists:

| Field | Value |
|---|---|
| **Email / username** | `admin@uniquepos.com` |
| **Password** | `Test1234!` |
| **Role** | Administrator (full access) |

> ⚠️ **Change this password immediately after your first login.** These
> credentials are public knowledge (they are in this documentation), so leaving
> them in place on a live server is a serious security risk.

### How to change it
1. Log in as the default admin.
2. Go to **Settings → Users**.
3. Either:
   - Edit the `admin@uniquepos.com` user and set a new strong password, **or**
   - Create a brand-new admin user with your own email, log in as that user, and
     then delete or disable `admin@uniquepos.com`.
4. Optionally enable **two-factor authentication (2FA)** for admin accounts
   under the user's security settings.

---

## Creating the first admin on an empty database

If you started with an **empty** database (no seed data), no admin exists yet.
Create one directly in the database. Passwords are stored as **bcrypt** hashes,
so you cannot insert a plaintext password.

### Method 1 — generate a bcrypt hash, then INSERT

On any machine with Node.js and the app's dependencies installed (or use the
app's own virtual environment on cPanel):

```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR_NEW_PASSWORD', 10))"
```

Copy the printed hash (starts with `$2a$` or `$2b$`) and insert the user:

```sql
INSERT INTO users (name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'Administrator',
  'you@yourdomain.com',
  '$2b$10$....PASTE_THE_HASH_HERE....',
  'admin',
  true,
  NOW(),
  NOW()
);
```

> Column names may vary slightly by version; run `\d users` in psql to confirm
> the exact columns (e.g. `password` vs `password_hash`, `role` values). Match
> the values used by the seed data if in doubt.

### Method 2 — restore the seed data instead
The simplest path is to load `db/database.sql` (Option A). It creates the admin
for you; then change the password as above.

---

## Roles & permissions (overview)

UniquePOS uses role-based access. Typical roles:

- **admin** — full access, including Users, Settings, Security, Backups, Audit
  Log, and all branches.
- **manager / staff / cashier** — scoped operational access (POS, products,
  inventory, sales) without administrative screens. Sales staff can be granted
  quotation/invoice creation without full inventory access.

Manage users and their roles under **Settings → Users**. Every sensitive action
is recorded in the **Audit Log**, and login attempts are recorded in **Login
History** / **Security Alerts**.

---

## If you are locked out

- The app enforces an account **lockout** after repeated failed logins. Wait for
  the lockout window to expire, or clear it in the database:
  ```sql
  UPDATE users
  SET failed_login_attempts = 0, locked_until = NULL
  WHERE email = 'you@yourdomain.com';
  ```
  (Confirm the exact column names with `\d users`.)
- If you forgot the password and email is configured, use **Forgot password**
  on the login screen.
- As a last resort, reset the password hash directly with Method 1 above.
