# Docker NOTES

```js
rs.initiate({ _id : "myReplSet", members: [ { _id: 0, host: "localhost:27017" } ] })
rs.conf()
rs.config()
rs.reconfig()
```

```js
db.createUser({ user: "mongo", pwd: passwordPrompt(), roles: [{ role: "userAdminAnyDatabase", db: "admin" }, { "role" : "clusterAdmin", "db" : "admin" }, { "role": "readWriteAnyDatabase", db: "admin" }] })
```

```js
use admin
db.auth({ user: "mongo", pwd: "mongo" })
```

```js
mongodb://mongo:mongo@127.0.0.1:27017/test?directConnection=true&replicaSet=rs0&authSource=admin
```
