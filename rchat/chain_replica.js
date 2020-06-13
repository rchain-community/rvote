import postgres from 'postgres';  // ISSUE: AMBIENT

async function main({ postgres }) {
  
  const sql = postgres({
    host: 'localhost',
    port: 5432,
    database: 'zulip',
    username: 'zulip',
    password: 'REPLACE_WITH_SECURE_POSTGRES_PASSWORD',
  });
 
  const messages = await sql`
    select * from zerver_message
  `;
  console.log(messages);
}

main({ postgres });
