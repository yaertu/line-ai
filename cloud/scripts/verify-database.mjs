import postgres from "postgres";

const connection = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connection) throw new Error("POSTGRES_URL_NON_POOLING veya POSTGRES_URL bulunamadı.");

const sql = postgres(connection, { max: 1, prepare: false, ssl: "require" });

try {
  const tables = await sql`
    select c.relname as name, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'line_ai_installations',
        'line_ai_registration_limits',
        'line_ai_conversations'
      )
    order by c.relname
  `;
  const expectedTables = new Set([
    "line_ai_installations",
    "line_ai_registration_limits",
    "line_ai_conversations",
  ]);
  const tablesValid = tables.length === expectedTables.size
    && tables.every((table) => expectedTables.has(table.name) && table.rls === true);

  const exposedGrants = await sql`
    select count(*)::int as count
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'line_ai_%'
      and grantee in ('anon', 'authenticated')
  `;

  const functionGrants = await sql`
    select routine_name, privilege_type
    from information_schema.role_routine_grants
    where specific_schema = 'public'
      and routine_name in (
        'register_line_ai_installation',
        'upsert_line_ai_conversation'
      )
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  `;

  const checks = {
    tablesAndRls: tablesValid,
    noAnonOrAuthenticatedTableGrants: exposedGrants[0]?.count === 0,
    serviceRoleFunctionGrants: new Set(functionGrants.map((grant) => grant.routine_name)).size === 2,
  };

  for (const [name, passed] of Object.entries(checks)) {
    console.log(`${name}=${passed ? "PASS" : "FAIL"}`);
  }
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
} finally {
  await sql.end();
}
