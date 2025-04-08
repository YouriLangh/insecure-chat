# Insecure Chat Server

A simple insecure chat server

## How to use

```
$ cd insecure-chat-server
$ npm install
$ npm start
```

The server is now available at `ws://localhost:3000`. Optionally, specify a port by supplying the `PORT` env variable.
You can connect to it by using the Insecure Chat Client.

docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5431:5432 -d postgres

# Map the postgres port from 5432 to 5431 on host

docker exec -it some-postgres psql -U postgres
docker ps -a
to see all the running containers
docker stop some-postgres
to stop the container
docker rm some-postgres
to delete the container & wipe data
