import postgres from 'postgres';  // ISSUE: AMBIENT

const zulip_db_config = {
    host: 'localhost',
    port: 5432,
    database: 'zulip',
    username: 'zulip',
    password: 'REPLACE_WITH_SECURE_POSTGRES_PASSWORD',
};

const zulip_ephemera = [
  'django_session',
  'fts_update_log',
  'zerver_useractivity', 'zerver_useractivityinterval', 'zerver_userpresence',
];


async function main({ postgres }) {

  const sql = postgres(zulip_db_config);

  const proc = 'notify_mirror';
  const channel = 'mirror';
  await create_notify_function(sql, proc, channel);
  const tables_of_record = (await pg_tables(sql))
        .filter(({ table_schema, table_name }) => !zulip_ephemera.includes(table_name))
        .map(({ table_schema, table_name }) => `${ table_schema }.${table_name}`);

  await Promise.all(tables_of_record.map(async (tab_name) => {
    await add_notify_trigger(sql, tab_name, proc, channel);
  }));

  await sql.listen(channel, (payload) => {
    const notice = JSON.parse(payload);
    console.log({ op: notice.op, table_name: notice.table_name });
    const rho = notice_as_rho(notice);
    console.log(rho);
    // TODO: deploy rho to chain
  });
}

function notice_as_rho({ op, table_name, OLD = undefined, NEW = undefined}) {
  const lit = val => val ? JSON.stringify(val) : 'Nil';
  return `new deployId(\`rho:rchain:deployId\`), deployerId(\`rho:rchain:deployerId\`) in {
    @{[*deployerId, "iddb_apply"]}!(${lit(op)}, ${lit(table_name)}, ${lit(OLD)}, ${lit(NEW)}, *deployId)
  }
  `;
}


async function pg_tables(sql) {
  return await sql`
    SELECT
        quote_ident(table_schema) as table_schema, quote_ident(table_name) as table_name
    FROM
        information_schema.tables
    WHERE
        table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_schema NOT LIKE 'pg_toast%'
`;
}

async function create_notify_function(sql, proc, channel) {
  console.log('creating function', proc);

  return sql.unsafe(`
create or replace function ${ proc } ()
 returns trigger
 language plpgsql
as $$
begin
  PERFORM (
     select pg_notify('${ channel }',
                      '{ "schema": ' || to_json(tg_table_schema) ||
                      ', "table_name": ' || to_json(tg_table_name) ||
                      ', "relid": ' || to_json(tg_relid) ||
                      ', "op": ' || to_json(tg_op) ||
                      case when tg_op in ('UPDATE', 'DELETE') then ', "OLD": ' || row_to_json(OLD)::text else '' end ||
                      case when tg_op in ('INSERT', 'UPDATE') then ', "NEW": ' || row_to_json(NEW)::text else '' end ||
                      '}')
  );
  RETURN NULL;
  end;
$$;
`);
}

async function add_notify_trigger(sql, table, proc, channel) {
  console.log('adding trigger on ', table);

  const trigger = `notify_${ table.replace('.', '__') }`;
  await sql.unsafe(`drop trigger if exists ${trigger} on ${ table }`);
  return sql.unsafe(`
CREATE TRIGGER ${ trigger }
         AFTER INSERT OR UPDATE OR DELETE
            ON ${ table }
      FOR EACH ROW
       EXECUTE PROCEDURE ${ proc }();
`);

}

main({ postgres })
  .catch(err => console.error(err));
