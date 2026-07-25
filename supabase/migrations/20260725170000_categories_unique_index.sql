-- Without this, concurrent bootstrap inserts (Strict Mode double-mount, or two
-- browser tabs racing on first login) silently create duplicate categories
-- instead of hitting the unique-violation recovery path in seedCategories().
-- Two partial indexes because a plain unique(user_id, name, parent_id) would
-- not catch duplicate top-level rows: NULL <> NULL, so parent_id IS NULL rows
-- never conflict under a standard unique constraint.

create unique index categories_user_name_no_parent_key
  on public.categories (user_id, name)
  where parent_id is null;

create unique index categories_user_name_parent_key
  on public.categories (user_id, name, parent_id)
  where parent_id is not null;
