import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";

const connection = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connection) throw new Error("POSTGRES_URL_NON_POOLING veya POSTGRES_URL bulunamadı.");

const directory = new URL("../supabase/migrations/", import.meta.url);
const sql = postgres(connection, { max: 1, prepare: false, ssl: "require" });

try {
  await sql`create table if not exists public.line_ai_schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public.line_ai_schema_migrations enable row level security`;
  await sql`revoke all on public.line_ai_schema_migrations from anon, authenticated`;
  for (const name of (await readdir(directory)).filter(n=>n.endsWith(".sql")).sort()) {
    const migration = await readFile(new URL(name, directory), "utf8");
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(59012913)`;
      if ((await transaction`select name from public.line_ai_schema_migrations where name=${name}`).length) return;
      await transaction.unsafe(migration);
      await transaction`insert into public.line_ai_schema_migrations(name) values(${name})`;
    });
    console.log("Migration ready:", name);
  }
  console.log("Line AI Cloud veritabanı şeması uygulandı.");
} finally {
  await sql.end();
}
