# The database, in plain words

The SQL file is [`supabase/migrations/20261026000000_core_tables_rls_storage.sql`](../supabase/migrations/20261026000000_core_tables_rls_storage.sql).
You run it once in Supabase. This page explains what it does, so you know what you are running.

## What gets created

**Three tables** (think of them as three spreadsheets):

| Table | What it holds |
|---|---|
| `profiles` | One row per person: their name. Created the first time they use the app. |
| `projects` | One row per building project: name, description, owner, type (residential, commercial, extension, other), city, number of floors, budget, and the building's size (length, width, floor height, wall and slab thickness). |
| `project_rooms` | One row per room: which project and floor it is on, its name and type, size, number of doors and windows, and (later) where it sits in the building. |

Every project and room remembers **who owns it**.

**Two private storage folders** ("buckets"): `floorplans` (uploaded plan images and PDFs) and `reports` (generated PDF reports).
Nothing is in them yet. They are private: only the person who uploaded a file can get it back.

## Who can see what

- Everyone only ever sees **their own** projects, rooms and profile. Another person's data does not appear in any list, and asking for it directly behaves as if it does not exist.
- A room can only be added to a project **you own**.
- Nobody can create data in someone else's name or hand their project to someone else.
- People who are **not signed in** can reach nothing at all.
- Signed-in users can read and change their own rows, but cannot empty or restructure a table.
- Each person's files in Storage must live in a folder named after their user id, so nobody can read or overwrite another person's files.

This is enforced **by the database itself** ("Row Level Security"), not only by the application. Even a mistake in the application code could not show one person another person's data.

## Built-in sanity rules

The database refuses nonsense even if the application let it through: a length of zero or less, a name that is blank, 0 or more than 50 floors, an unknown building type, a currency that is not three capital letters, a negative budget, and so on.

## What it does NOT do

It contains **no** `DROP TABLE`, `DELETE` or `TRUNCATE`, so running it cannot erase anything. It is safe to run twice (the second time changes nothing).
It does not touch Supabase's own user accounts.

## How to run it

1. Supabase dashboard → your **buildora** project → **SQL Editor** (left menu) → **New query**.
2. Open the SQL file in VS Code, select all, copy, and paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned".

## How to check it worked

- **Table Editor** (left menu): you see `profiles`, `projects` and `project_rooms`, each marked as having RLS enabled.
- **Storage** (left menu): you see two buckets, `floorplans` and `reports`, both **private**.
- **Authentication → Users** still lists your account (nothing there changes).

## Migration 2: everything the Studio, estimates, catalogue and reports need

File: [`supabase/migrations/20261027000000_layout_catalogue_estimates_reports.sql`](../supabase/migrations/20261027000000_layout_catalogue_estimates_reports.sql). Run it **after** migration 1, the same way.

**It adds columns to existing tables** (nothing is removed or changed):
- `projects`: the saved 3D layout (door and window positions, furniture), the estimate settings (wastage, chosen materials, extra costs, planned purchases) and a "demo" flag.
- `profiles`: your default city and your default wastage percentages (Settings page).

**It adds seven tables:**

| Table | What it holds |
|---|---|
| `floor_plan_files` | A record per uploaded floor plan: name, type, size, the scale you set. The picture itself is in Storage. |
| `materials` | The material catalogue. Shared sample materials (read-only for everyone) plus each person's own. |
| `material_price_records` | Prices for those materials: shared sample prices, plus each person's own prices. |
| `project_estimates` | The latest estimate of each project: totals and assumptions. |
| `estimate_items` | The lines of an estimate (cement, steel, bricks…). |
| `optimization_recommendations` | The waste-optimization advice for an estimate. |
| `reports` | A record per generated PDF report. The PDF itself is in Storage. |

**Who can see what, again:** everything above belongs to its owner and nobody else can see or change it, enforced by the database. The one deliberate exception is the **shared sample catalogue**: everyone signed in can read it, nobody can change or delete it, and everyone can add their own price for a sample material without affecting anyone else.

**Safe to run twice; it contains no DROP TABLE, DROP COLUMN, DELETE or TRUNCATE.** After running it, restart the backend: it fills in the shared sample catalogue (18 materials with clearly labelled *sample* prices) the first time it starts.

## Migration 3: the Admin role (admin website)

File: [`supabase/migrations/20261030000000_admin.sql`](../supabase/migrations/20261030000000_admin.sql). Run it **after** migrations 1 and 2, the same way.

**What it adds**
- `materials.is_hidden`: an Admin can hide a shared material. It is kept (old estimates refer to it) but no longer offered.
- `material_price_records.updated_by`: which Admin last changed a shared market price.
- A check `is_admin()` and rules that let **only Admins** add or change the **shared** catalogue and its market prices.
  Users keep their own private prices exactly as before; nobody can delete shared materials (they are hidden instead).
- Two read-only reports for the admin website: an overview (user counts, roles, sign-in methods, activity) and the user list.
  They refuse anyone who is not an Admin. Passwords are never part of them.

**Who is an Admin?** Someone whose account carries `"role": "admin"` in its *app metadata*. Users cannot change app metadata;
only you can, in the SQL Editor:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'you@example.com';
```

The person must **log out and log in again** afterwards. To remove the role: `raw_app_meta_data - 'role'` instead of `|| ...`.

**Safe to run twice; it contains no DROP TABLE, DROP COLUMN, DELETE or TRUNCATE.**
