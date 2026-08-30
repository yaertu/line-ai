import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connection = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connection) throw new Error("POSTGRES_URL_NON_POOLING veya POSTGRES_URL bulunamadı.");

const migrationUrl = new URL(
  "../supabase/migrations/202608300001_line_ai_cloud.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const sql = postgres(connection, { max: 1, prepare: false, ssl: "require" });

try {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration);
  });
  console.log("Line AI Cloud veritabanı şeması uygulandı.");
} finally {
  await sql.end();
}
