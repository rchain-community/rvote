## Contents

 - `server.js` - node.js Express app
   - `package.json` - passport-discord, etc.
   - `capper_start.js` - (should be moved into Capper)
   - `gateway/` - Capper app: server, UI for OAuth, rnode gRPC

## ES Modules in node.js

[ECMAScript Modules \| Node\.js v13\.12\.0 Documentation](https://nodejs.org/api/esm.html)
is experimental as of this writing.

ISSUE: use `"exports": "./main.js"`? Do we want to encapsulate other files?
