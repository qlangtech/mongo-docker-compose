rs.initiate({
  _id: "rs0",
  members: [{
    _id: 0,
    host: "mongodb:27017"
  }]
});

sleep(5000);


db.getSiblingDB("admin").createUser({
  user: "root",
  pwd: "example",
  roles: [ { role: "root", db: "admin" } ]
});

