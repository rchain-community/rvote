import postgres from 'postgres';  // ISSUE: AMBIENT

async function main({ postgres }) {
  
  const sql = postgres({
    host: 'localhost',
    port: 5432,
    database: 'zulip',
    username: 'zulip',
    password: 'REPLACE_WITH_SECURE_POSTGRES_PASSWORD',
  });
 
  // console.log(await messages(sql));

  const proc = 'proc1';
  const channel = 'chan1';
  await create_notify_function(sql, proc, channel);
  let names = await tables(sql);
  console.log(names);
  names = names.filter(n => n.match(/message/)); //@@
  await Promise.all(names.map(async (tab_name) => {
    await add_notify_trigger(sql, tab_name, proc, channel);
  }));

  await sql.listen(channel, (payload) => {
    const json = JSON.parse(payload);
    console.log(channel, json);
  });
}


async function messages(sql) {
  return sql`
    select * from zerver_message
  `;
}

async function tables(sql) {
  const result = await sql`
    SELECT
        quote_ident(table_schema) || '.' || quote_ident(table_name) as tab_name
    FROM
        information_schema.tables
    WHERE
        table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_schema NOT LIKE 'pg_toast%'
`;
  return result.map(({ tab_name }) => tab_name);
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
     select pg_notify('${ channel }', row_to_json(NEW)::text)
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
         AFTER INSERT
            ON ${ table }
      FOR EACH ROW
       EXECUTE PROCEDURE ${ proc }('${ table }');
`);

}

main({ postgres })
  .catch(err => console.error(err));
