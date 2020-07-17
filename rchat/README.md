# rchat: RChain replica of Zulip governance discussion

Using a largely unmodified zulip installation, we listen to
database modification events and make the corresponding modifications
to a store in RChain.

## Exploring the Zulip DB

Install [docker-zulip][dz] (35d2313 2020-06-12) modified to expose the
database port (see below).

[dz]: https://github.com/zulip/docker-zulip

Using an SQL IDE such as dbeaver, we find tables such as `zerver_messge`.

<a target="_blank" rel="noopener noreferrer" href="https://user-images.githubusercontent.com/150986/84575875-1ba89280-ad76-11ea-9b6e-526c35492277.png"><img src="https://user-images.githubusercontent.com/150986/84575875-1ba89280-ad76-11ea-9b6e-526c35492277.png" alt="message_table_screenshot" style="max-width:100%;"></a>


## Listening to Zulip DB events and traslating to Rholang

Using [postgres LISTEN][pgl], we can see messages as they arrive.
`node chain_replica.js ,db_actions.rho 15` listens for 15 seconds and
records the actions in rholang:

[pgl]: https://www.postgresql.org/docs/9.0/sql-listen.html

```scala
new deployerId(`rho:rchain:deployerId`) in {
    for(db <<- @{[*deployerId, "zulip_iddb3"]}) {
        // ISSUE: Nil return channel: no sync
        db!("INSERT", "zerver_message", Nil,
            {"id":58,"subject":"ready to run on chain",
             "content":"proposed: A",
             "rendered_content":"<p>proposed: A</p>","rendered_content_version":1,
             "last_edit_time":Nil,"edit_history":Nil,
             "has_attachment":false,"has_image":false,"has_link":false,
             "recipient_id":8,"sender_id":8,"sending_client_id":1,
             "search_tsvector":Nil,
             "date_sent":"2020-06-14T03:31:36.902716+00:00"
             }, Nil)
    }
  }
|
...
|
new deployerId(`rho:rchain:deployerId`) in {
    for(db <<- @{[*deployerId, "zulip_iddb3"]}) {
        db!("INSERT", "zerver_reaction", Nil,
        {"id":11,"user_profile_id":8,"message_id":59,
         "emoji_name":"heart","emoji_code":"2764",
         "reaction_type":"unicode_emoji"}, Nil)
    }
  }

```


## IdDB: A simple SQL store in Rholang

The `iddb.rho` contract creates an `IdDB` object with `INSERT`,
`UPDATE`, and `DELETE` methods as well as `create_table`. Limitations:

  - These methods implement simple `FOR EACH ROW` trigger actions, not
    complex SQL statements.
  - Each table is assumed to have an `id` primary key column,
    which is a common idiom when using an ORM such as django in zulip.

### IdDB Test output

Use `make register` to deploying `iddb.rho`, which runs a test of
`create_table`, `INSERT`, `UPDATE`, and `DELETE`:

```
22:29:54.675 [node-runner-119] INFO  c.r.casper.MultiParentCasperImpl - New fork-choice tip is block 8033847e52....
{"db1" : Unforgeable(0x78d6ec7423ee9bd6d9de4bfd04e5c98285cb0e13c89a9a064f1f5beceef5960f)}
{"created" : "player", "with" : {}}
"create_table player done"
{"inserted key" : 123, "with" : Set()}
{"inserted" : 123}
{"got keys for" : "player", "qty" : 1}
{"inserted" : 123, "keys" : Set(123)}
{"updated key" : 123}
{"updated" : 123}
{"got keys for" : "player", "qty" : 1}
{"keys" : Set(123), "updated" : 123}
{"deleted key" : 123, "from" : Set(123)}
{"delted" : 123}
{"got keys for" : "player", "qty" : 0}
{"delted" : 123, "keys" : Set()}
{"IdDB URI" : `rho:id:7wa3q45w418gxdzacr5eygsx5sp9o4sticm4gsyk4w5m4gf9syj7tu`}
```

## A zulip DB private to the deployer

The `myzulipdb.rho` contract calls `IdDB`, creates tables such as
`zerver_message`, and stores the db at a compound name based on
`deployerId`. (ISSUE: should be `bundle+{...}`?)

ISSUE: after you `make register`, manually copy the IdDB URI to `myzulipdb.rho`.

Then `make init_mirror` to deploy `myzulipdb.rho`.

```
{"IdDB" : Unforgeable(0xd2d3ae94e8f20362f7b3fa1392497dc047035b00a645981d988ac8cf36640870)}
{"db" : Unforgeable(0x656ba310eb1ad373899583dd8637f61fcfa357263d94fe43911e55e156eb3fd8)}
{"created" : "zerver_message", "with" : {}}
{"created" : "zerver_usermessage", "with" : {"zerver_message" : Unforgeable(0x0d78e536a1da9236272e6f09785a90ed68c98f20d6ed6f6dd219dc1835571527)}}
```

## Mirroring the DB actions on chain

Use `make do_mirror` to deploy `,db_actions.rho` to RChain:

```
22:31:51.752 [node-runner-119] INFO  c.r.c.u.rholang.RuntimeManagerImpl - PreCharging 04933ae1b1c3dec15b486caae7c8b4d5d8d6e65d5a8ed3f3aa59e0a6404300d24073e39bc5dd8a938dba2b87f3669e605d31e1cb455634baee3aab492136127c8e for 1000000000
{"inserted key" : 56, "with" : Set()}
{"inserted key" : 57, "with" : Set(56)}
{"inserted key" : 59, "with" : Set()}
{"inserted key" : 55, "with" : Set(56, 57)}
{"inserted key" : 58, "with" : Set(59)}
{"inserted key" : 60, "with" : Set(58, 59)}
{"updated key" : 59}
{"updated key" : 60}
{"updated key" : 58}
```



## Appendix: Exposing postgres port from docker container

```
~/projects/docker-zulip$ git diff
diff --git a/docker-compose.yml b/docker-compose.yml
index 6db98cf..9769072 100644
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -11,6 +11,8 @@ services:
       POSTGRES_PASSWORD: 'REPLACE_WITH_SECURE_POSTGRES_PASSWORD'
     volumes:
       - '/opt/docker/zulip/postgresql/data:/var/lib/postgresql/data:rw'
+    ports:
+      - '5432:5432'
   memcached:
     image: 'memcached:alpine'
     command:
```
