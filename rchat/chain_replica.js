/* global Buffer */

import fs from 'fs';  // ISSUE: AMBIENT

import postgres from 'postgres';  // ISSUE: AMBIENT
import grpcLib from '@grpc/grpc-js'; //@@ AMBIENT

import rnode_grpc_js from '@tgrospic/rnode-grpc-js';
// requires --experimental-json-modules
import protoSchema from '../rchain-proto/rnode-grpc-gen/js/pbjs_generated.json';
import '../rchain-proto/rnode-grpc-gen/js/DeployServiceV1_pb.js'; // proto global

const { signDeploy, rnodeDeploy, getAddrFromPrivateKey } = rnode_grpc_js;


const harden = x => Object.freeze(x);  // ISSUE: @agoric/harden for deep-freeze?

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


async function main(argv, env, { timer, fsp, postgres, grpcLib }) {
  const [_node, _script, filename] = argv;

  const sql = postgres(zulip_db_config);

  const channel = 'mirror';
  await prepare_to_listen(sql, channel);

  let dest;
  if (env.RNODE && env.SECRET_KEY) {
    const deployService = rnodeDeploy({ grpcLib, host: env.RNODE || '127.0.0.1:40401', protoSchema });
    const secretKey = Buffer.from(env.SECRET_KEY, 'hex');
    const validafterblocknumber = parseInt(env.BLOCKNUM) || -1;  // TODO: warn if missing?
    const phlolimit = 10e7;
    console.log({ validafterblocknumber, phlolimit });
    dest = chain_dest(secretKey, deployService, { validafterblocknumber, phlolimit });
  } else {
    if (!filename) {
      throw new Error('need file arg or RNODE and SECRET_KEY env variables');
    }
    const out = await fsp.open(filename, 'w');
    dest = file_spool(out);
  }
  const queue = batchingQueue({ max_qty: 64, quiesce_time: 4 * 1000 }, timer, dest);

  mirror_events(sql, channel, queue);
}

function chain_dest(secretKey, deployService, { validafterblocknumber, phlolimit }) {
  const keyInfo = getAddrFromPrivateKey(secretKey.toString('hex'));
  console.log({deployKey: keyInfo.pubKey, eth: keyInfo.ethAddr });

  return async (terms) => {
    const term = terms.join('\n|\n');
    const deployData = {
      term,
      phloprice: 1,  // TODO: when rchain economics evolve
      phlolimit,
      validafterblocknumber,  // ISSUE: should get updated over time
    };
    const signed = signDeploy(secretKey, deployData);
    console.log({ timestamp: signed.timestamp, terms: terms.length });
    const result = await deployService.doDeploy(signed);
    console.log({ deployResponse: result });
  };
}

function file_spool(out) {
  let first = true;
  return (terms) => {
    console.log('spooling', terms.length);
    for (const rho of terms) {
      if (first) {
        first = false;
      } else {
        out.write('|\n');
      }
      out.write(rho);
      out.write('\n');
    }
  };
}

async function mirror_events(sql, channel, queue) {
  await sql.listen(channel, (payload) => {
    const notice = JSON.parse(payload);
    console.log({ op: notice.op, table_name: notice.table_name });
    const rho = notice_as_rho(notice);
    queue.push(rho);
  });
}


function notice_as_rho({ op, table_name, OLD = undefined, NEW = undefined}) {
  // KLUDGE: replacing null with Nil in string form has false positives
  const lit = val => val ? JSON.stringify(val).replace(/\bnull\b/g, 'Nil') : 'Nil';

  // ISSUE: sync "zulip_iddb4" with myzulipdb.rho
  return `new deployerId(\`rho:rchain:deployerId\`) in {
    for(db <<- @{[*deployerId, "zulip_iddb4"]}) {
        // ISSUE: Nil return channel: no sync
        db!(${lit(op)}, ${lit(table_name)}, ${lit(OLD)}, ${lit(NEW)}, Nil)
    }
  }
  `;
}

async function prepare_to_listen(sql, channel) {
  const proc = 'notify_mirror';
  await create_notify_function(sql, proc, channel);
  const tables_of_record = (await pg_tables(sql))
        .filter(({ table_schema, table_name }) => !zulip_ephemera.includes(table_name))
        .map(({ table_schema, table_name }) => `${ table_schema }.${table_name}`);

  return Promise.all(tables_of_record.map(async (tab_name) => {
    await add_notify_trigger(sql, tab_name, proc, channel);
  }));
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

/**
 * Make queue that batches items for efficient delivery.
 * times are natural numbers (typically milliseconds)
 */
function batchingQueue(
  { max_qty, quiesce_time},
  { current_timestamp, setTimeout, clearTimeout },
  sink,
) {
  let buf = [];
  let quiescing;
  const toDate = ts => new Date(ts);

  function flush() {
    if (buf.length > 0) {
      sink(buf); // ISSUE: async? consume promise?
      buf = [];
    }
    if (quiescing !== undefined) {
      clearTimeout(quiescing);
      quiescing = undefined;
    }
  }

  return harden({
    push: (item) => {
      let due = false;
      const t = current_timestamp();
      buf.push(item);
      if (buf.length >= max_qty) {
        console.log({ current: toDate(t), qty: buf.length, max_qty });
        flush();
      } else {
        if (quiescing !== undefined) {
          clearTimeout(quiescing);
        }
        const last_activity = t;
        quiescing = setTimeout(() => {
          const t = current_timestamp();
          console.log({
            quiesce_time,
            current: toDate(t),
            last_activity: toDate(last_activity),
            delta: (t - last_activity) / 1000,
          });
          flush();
        }, quiesce_time);
      }
    },
    finish: () => {
      flush();
    }
  });
}


/* global process, setTimeout, clearTimeout */
main(process.argv, process.env, {
  setTimeout,
  fsp: fs.promises,
  timer: {
    current_timestamp: () => Date.now(),
    setTimeout,
    clearTimeout,
  },
  postgres,
  grpcLib,
})
  .catch(err => console.error(err));
