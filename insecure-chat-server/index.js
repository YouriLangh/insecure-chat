// Setup basic express server
const express = require("express");
const app = express();
const path = require("path");
const port = process.env.PORT || 3000;
const fs = require("fs");
const https = require("https");
const { Pool } = require("pg");
const sanitizeHtml = require("sanitize-html");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

app.use(express.json());
app.use(helmet());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 1000, // limit to 10 requests per 15 min per IP
  message: "Too many attempts. Try again later.",
});

// require('dotenv').config();

const bcrypt = require("bcrypt");
// Database connection setup
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "postgres",
  password: process.env.DB_PASSWORD || "mysecretpassword",
  port: process.env.DB_PORT || 5431,
});

const Rooms = require("./rooms.js")(pool);
const Users = require("./users.js")(pool);
async function runMigrations() {
  try {
    const migrationFile = path.join(__dirname, "init.sql");
    const sql = fs.readFileSync(migrationFile, "utf8");

    const client = await pool.connect();
    try {
      await client.query(sql); // Run the migration query
      console.log("Migrations applied successfully!");
      // Initialize state
      await initializeState();
    } catch (error) {
      console.error("Error applying migrations:", error);
    } finally {
      client.release();
    }

    console.log("Connected to the database successfully!");
  } catch (err) {
    console.error(
      "Error reading migration file or connecting to the database:",
      err
    );
  }
}

async function initializeState() {
  // Check if the rooms table already contains any rows
  const checkQuery = "SELECT COUNT(*) FROM rooms";

  try {
    const result = await pool.query(checkQuery);
    const count = parseInt(result.rows[0].count, 10);

    // If there are no rooms, initialize the state
    if (count === 0) {
      const initState = [
        ["random", "Random!", true, false],
        ["general", "interesting things", true, false],
        ["private", "some very private channel", true, true],
      ];

      const query = `
        INSERT INTO rooms (name, description, force_membership, private)
        VALUES ($1, $2, $3, $4)
      `;

      // Use Promise.all to handle async tasks properly
      const promises = initState.map((room) => pool.query(query, room));

      // Wait for all the insert operations to complete
      await Promise.all(promises);
      console.log("Initial state inserted into rooms table.");
    } else {
      console.log("Rooms table already has data, skipping initialization.");
    }
  } catch (error) {
    console.error("Error checking or inserting initial state:", error);
  }
}

runMigrations();
// Read certs
const options = {
  key: fs.readFileSync(path.join(__dirname, "certs", "localhost-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "localhost.pem")),
  ca: fs.readFileSync(path.join(__dirname, "certs", "rootCA.pem")),
};

const server = https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS server running at https://localhost:${port}`);
});

const io = require("socket.io")(server);

app.post("/register", async (req, res) => {
  const { name, password } = req.body;
  const cleanName = sanitizeHtml(name);
  const cleanPwd = sanitizeHtml(password);
  const isValidPwd = /^[a-zA-Z0-9_]+$/.test(cleanPwd);
  const isValidUsername = /^[a-zA-Z0-9_]+$/.test(cleanName);
  if (!name || !password) {
    return res.status(400).send("Missing credentials");
  }
  if (
    cleanName !== name ||
    cleanPwd !== password ||
    !isValidPwd ||
    !isValidUsername
  ) {
    return res.status(400).send("Corrupted credentials");
  }
  try {
    // Check if the user already exists
    const findUserQuery = `
      SELECT * FROM users WHERE name = $1;
    `;

    const findUserResult = await pool.query(findUserQuery, [cleanName]); // Case sensitive!!

    if (findUserResult.rows.length > 0) {
      return res.status(400).send("User already exists");
    }

    const hashedPassword = await bcrypt.hash(cleanPwd, 10);

    // Insert the new user into the database
    const query = `
      INSERT INTO users (name, password)
      VALUES ($1, $2)
      RETURNING id;
    `;

    const values = [cleanName, hashedPassword];

    const result = await pool.query(query, values);
    const user_id = result.rows[0].id;
    console.log(`User registered with ID: ${user_id}`);

    // TODO: make this a separate function
    // add the forced rooms to the user
    const forcedRoomsRes = await pool.query(
      `SELECT id FROM rooms WHERE force_membership = true`
    );
    const forcedRooms = forcedRoomsRes.rows;
    // Add user to each forced room
    for (const room of forcedRooms) {
      await addUserToRoom(result.rows[0], room);
    }

    res.status(200).send("Registration successful");
  } catch (error) {
    console.error("Registration failed:", error);
    res.status(500).send("Registration error");
  }
});

app.post("/login", authLimiter, async (req, res) => {
  const { name, password } = req.body;

  const cleanName = sanitizeHtml(name);
  const cleanPwd = sanitizeHtml(password);
  const isValidPwd = /^[a-zA-Z0-9_]+$/.test(cleanPwd);
  const isValidUsername = /^[a-zA-Z0-9_]+$/.test(cleanName);
  if (!name || !password) {
    return res.status(400).send("Missing credentials");
  }
  if (
    cleanName !== name ||
    cleanPwd !== password ||
    !isValidPwd ||
    !isValidUsername
  ) {
    return res.status(400).send("Corrupted credentials");
  }

  try {
    // Check if the user exists
    const findUserQuery = `
      SELECT password FROM users WHERE name = $1
    `;
    const findUserResult = await pool.query(findUserQuery, [name]);

    if (findUserResult.rows.length === 0) {
      return res.status(400).send("No user exists by that username");
    }

    const hashedUserPwd = findUserResult.rows[0].password;
    const samePwd = await bcrypt.compare(password, hashedUserPwd);

    if (!samePwd) {
      return res.status(400).send("Incorrect credentials");
    }

    // User is authenticated successfully
    res.send("Login successful");
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).send("Login error");
  }
});

///////////////////////////////
// Chatroom helper functions //
///////////////////////////////

function sendToRoom(room, event, data) {
  io.to("room" + room.id).emit(event, data);
}

async function newRoom(name, user, options) {
  const room = await Rooms.addRoom(name, options);
  await addUserToRoom(user, room);
  return room;
}

async function newChannel(name, description, private, user) {
  return await newRoom(name, user, {
    description: description,
    private: private,
  });
}

async function newDirectRoom(user_a, user_b) {
  const room = await Rooms.addRoom(`Direct-${user_a.name}-${user_b.name}`, {
    direct: true,
    private: true,
  });

  await addUserToRoom(user_a, room);
  await addUserToRoom(user_b, room);
  room.members = [user_a.name, user_b.name];
  return room;
}

async function getDirectRoom(user_a, user_b) {
  let rooms = await Rooms.getRooms();
  console.log(`All rooms: ${JSON.stringify(rooms)}`);
  // TODO This does not find the existing room

  rooms = rooms.filter(
    (r) =>
      r.direct &&
      ((r.members[0] == user_a.name && r.members[1] == user_b.name) ||
        (r.members[1] == user_a.name && r.members[0] == user_b.name))
  );
  rooms.map(
    (r) =>
      `Room ${r.id} has members: ${
        r.members
      }. A direct room with me and the person exists already? ${
        (r.members[0] == user_a.name && r.members[1] == user_b.name) ||
        (r.members[1] == user_a.name && r.members[0] == user_b.name)
      }`
  );

  if (rooms.length == 1) return rooms[0];
  else {
    console.log("Have to add new direct room");
    return await newDirectRoom(user_a, user_b);
  }
}

async function addUserToRoom(user, room) {
  console.log("Attempting to add user to room...", user, "room: ", room);
  await Users.addSubscription(user.id, room.id);
  await Rooms.addMember(room.id, user.id);

  sendToRoom(room, "update_user", {
    room: room.id,
    username: user,
    action: "added",
    members: await Rooms.getRoomMembers(room.id),
  });
}

async function removeUserFromRoom(user, room) {
  await Users.removeSubscription(user.id, room.id);
  await Rooms.removeMember(room.id, user.id);

  sendToRoom(room, "update_user", {
    room: room.id,
    username: user,
    action: "removed",
    members: await Rooms.getRoomMembers(room.id),
  });
}

async function addMessageToRoom(roomId, username, msg) {
  const room = await Rooms.getRoom(roomId);

  msg.time = new Date().getTime();

  if (room) {
    sendToRoom(room, "new message", {
      username: username,
      message: msg.message,
      room: msg.room,
      time: msg.time,
      direct: room.direct,
    });
    const addMsgQuery = `INSERT INTO messages (room_id, username, message, time)
         VALUES ($1, $2, $3, $4)`;
    await pool.query(addMsgQuery, [roomId, username, msg.message, msg.time]);
  }
}

async function setUserActiveState(socket, username, state) {
  await Users.setUserActiveState(username, state);

  socket.broadcast.emit("user_state_change", {
    username: username,
    active: state,
  });
}

///////////////////////////
// IO connection handler //
///////////////////////////

const socketmap = {};

io.on("connection", (socket) => {
  let userLoggedIn = false;
  let username = false;

  console.log("New Connection");

  ///////////////////////
  // incomming message //
  ///////////////////////

  socket.on("new message", async (msg) => {
    if (userLoggedIn) {
      console.log(msg);
      await addMessageToRoom(msg.room, username, msg);
    }
  });

  /////////////////////////////
  // request for direct room //
  /////////////////////////////

  socket.on("request_direct_room", async (req) => {
    if (userLoggedIn) {
      const user_a = await Users.getUserByName(req.to);
      const user_b = await Users.getUserByName(username);

      if (user_a && user_b) {
        const room = await getDirectRoom(user_a, user_b);
        const roomCID = "room" + room.id;
        socket.join(roomCID);
        if (socketmap[user_a.name]) socketmap[user_a.name].join(roomCID);

        socket.emit("update_room", {
          room: room,
          moveto: true,
        });
      }
    }
  });

  socket.on("add_channel", async (req) => {
    if (userLoggedIn) {
      const user = await Users.getUserByName(username);
      console.log(req);
      const room = await newChannel(
        req.name,
        req.description,
        req.private,
        user
      );
      const roomCID = "room" + room.id;
      socket.join(roomCID);

      socket.emit("update_room", {
        room: room,
        moveto: true,
      });

      if (!room.private) {
        const rooms = await Rooms.getRooms();
        const publicChannels = rooms.filter((r) => !r.direct && !r.private);
        socket.broadcast.emit("update_public_channels", {
          publicChannels: publicChannels,
        });
      }
    }
  });

  socket.on("join_channel", async (req) => {
    if (userLoggedIn) {
      const user = await Users.getUserByName(username);
      const room = await Rooms.getRoom(req.id);

      if (!room.direct && !room.private) {
        await addUserToRoom(user, room);

        const roomCID = "room" + room.id;
        socket.join(roomCID);

        socket.emit("update_room", {
          room: room,
          moveto: true,
        });
      }
    }
  });

  socket.on("add_user_to_channel", async (req) => {
    if (userLoggedIn) {
      const user = await Users.getUserByName(req.user);
      const room = await Rooms.getRoom(req.channel);

      if (!room.direct) {
        await addUserToRoom(user, room);

        if (socketmap[user.name]) {
          const roomCID = "room" + room.id;
          socketmap[user.name].join(roomCID);

          socketmap[user.name].emit("update_room", {
            room: room,
            moveto: false,
          });
        }
      }
    }
  });

  socket.on("leave_channel", async (req) => {
    if (userLoggedIn) {
      const user = await Users.getUserByName(username);
      const room = await Rooms.getRoom(req.id);

      if (!room.direct && !room.forceMembership) {
        await removeUserFromRoom(user, room);

        const roomCID = "room" + room.id;
        socket.leave(roomCID);

        socket.emit("remove_room", {
          room: room.id,
        });
      }
    }
  });

  ///////////////
  // user join //
  ///////////////

  socket.on("join", async (p_username) => {
    if (userLoggedIn) return;

    username = p_username;
    userLoggedIn = true;
    socketmap[username] = socket;

    const user = await Users.getUserByName(username);

    // Get subscribed room IDs
    const roomIds = await Users.getSubscriptions(user.id);

    console.log("User is subscribed to the following rooms:", roomIds);
    // Join rooms and fetch their data
    const rooms = [];

    for (const roomId of roomIds) {
      const id = roomId.room_id; // or roomId.id if that's your structure
      socket.join("room" + id);

      const room = await Rooms.getRoom(id);
      rooms.push(room);
    }

    const publicChannels = rooms.filter((r) => !r.direct && !r.private);

    const users = (await Users.getUsers()).map((u) => ({
      username: u.name,
      active: u.active,
    }));
    socket.emit("login", {
      users,
      rooms,
      publicChannels,
    });

    await setUserActiveState(socket, username, true);
  });

  ////////////////
  // reconnects //
  ////////////////

  socket.on("reconnect", async () => {
    if (userLoggedIn) await setUserActiveState(socket, username, true);
  });

  /////////////////
  // disconnects //
  /////////////////

  socket.on("disconnect", async () => {
    if (userLoggedIn) await setUserActiveState(socket, username, false);
  });
});
