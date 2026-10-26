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

## What comes later

More tables (materials and prices, estimates, reports, floor plan files, the 3D layout) arrive in later steps, each as its own SQL file that I will show you first.
