# rchat: RChain replica of Zulip messages

Install [docker-zulip][dz] (35d2313 2020-06-12) modified to expose the
database port (see below).

[dz]: https://github.com/zulip/docker-zulip

Using an SQL IDE such as dbeaver, we find the `zerver_messge` table.

<a target="_blank" rel="noopener noreferrer" href="https://user-images.githubusercontent.com/150986/84575875-1ba89280-ad76-11ea-9b6e-526c35492277.png"><img src="https://user-images.githubusercontent.com/150986/84575875-1ba89280-ad76-11ea-9b6e-526c35492277.png" alt="message_table_screenshot" style="max-width:100%;"></a>

Using [postgres LISTEN][pgl], we can see messages as they arrive.
`npm start` produces the following:

[pgl]: https://www.postgresql.org/docs/9.0/sql-listen.html

```
...
adding trigger on  zulip.zerver_message
...
chan1 {
  id: 15,
  subject: 'topic demonstration',
  content: 'listen demo',
  rendered_content: '<p>listen demo</p>',
  rendered_content_version: 1,
  last_edit_time: null,
  edit_history: null,
  has_attachment: false,
  has_image: false,
  has_link: false,
  recipient_id: 8,
  sender_id: 8,
  sending_client_id: 1,
  search_tsvector: null,
  date_sent: '2020-06-13T19:12:57.406022+00:00'
}
chan1 { flags: 1, message_id: 15, user_profile_id: 8, id: 14 }
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
