# rchat: RChain replica of Zulip messages

Install [docker-zulip][dz] (35d2313 2020-06-12), and enter one
user-level message: "tracing traffic".

[dz]: https://github.com/zulip/docker-zulip

Then we expose the database port (see below) and use an SQL IDE such
as dbeaver to find the `zerver_messge` table.

With a goal of using postgres LISTEN, we establish that we can
access the zulib database. `npm start` produces the following:

```
[
  {
    id: 1,
    subject: '',
    content: 'Your bot `notification-bot@zulip.com` tried to send a message to stream #**None**. The stream exists but does not have any subscribers.',

...

  {
    id: 9,
    subject: 'topic demonstration',
    content: 'tracing traffic',
    rendered_content: '<p>tracing traffic</p>',
    rendered_content_version: 1,
    last_edit_time: null,
    edit_history: null,
    has_attachment: false,
    has_image: false,
    has_link: false,
    recipient_id: 8,
    sender_id: 8,
    sending_client_id: 1,
    search_tsvector: "'demonstrate':2 'demonstration':2 'topic':1 'trace':3 'tracing':3 'traffic':4",
    date_sent: 2020-06-13T16:19:10.858Z
  },
  count: 9,
  command: 'SELECT'
]
```


## Expose postgres port

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
