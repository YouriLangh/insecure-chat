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
const Rooms = require("./rooms.js");
const Users = require("./users.js");
const bcrypt = require("bcrypt");
// Database connection setup
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "postgres",
  password: process.env.DB_PASSWORD || "mysecretpassword",
  port: process.env.DB_PORT || 5431,
});

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
      console.log("Initial state applied successfully!");
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
  try {
    // Wait for all the insert operations to complete
    await Promise.all(promises);
  } catch (error) {
    console.error("Error inserting initial state:", error);
  }
}

runMigrations();
// Read certs
const options = {
  key: fs.readFileSync(path.join(__dirname, "certs", "localhost-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "localhost.pem")),
  ca: fs.readFileSync(path.join(__dirname, "certs", "rootCA.pem")),
};

// Load application config/state
require("./basicstate.js").setup(Users, Rooms);

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

    const findUserResult = await pool.query(findUserQuery, [cleanName]);

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
    console.log(`User registered with ID: ${result.rows[0].id}`);

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
  io.to("room" + room.getId()).emit(event, data);
}

function newUser(name) {
  const user = Users.addUser(name);
  const rooms = Rooms.getForcedRooms();

  rooms.forEach((room) => {
    addUserToRoom(user, room);
  });

  return user;
}

function newRoom(name, user, options) {
  const room = Rooms.addRoom(name, options);
  addUserToRoom(user, room);
  return room;
}

function newChannel(name, description, private, user) {
  return newRoom(name, user, {
    description: description,
    private: private,
  });
}

function newDirectRoom(user_a, user_b) {
  const room = Rooms.addRoom(`Direct-${user_a.name}-${user_b.name}`, {
    direct: true,
    private: true,
  });

  addUserToRoom(user_a, room);
  addUserToRoom(user_b, room);

  return room;
}

function getDirectRoom(user_a, user_b) {
  const rooms = Rooms.getRooms().filter(
    (r) =>
      r.direct &&
      ((r.members[0] == user_a.name && r.members[1] == user_b.name) ||
        (r.members[1] == user_a.name && r.members[0] == user_b.name))
  );

  if (rooms.length == 1) return rooms[0];
  else return newDirectRoom(user_a, user_b);
}

function addUserToRoom(user, room) {
  user.addSubscription(room);
  room.addMember(user);

  sendToRoom(room, "update_user", {
    room: room.getId(),
    username: user,
    action: "added",
    members: room.getMembers(),
  });
}

function removeUserFromRoom(user, room) {
  user.removeSubscription(room);
  room.removeMember(user);

  sendToRoom(room, "update_user", {
    room: room.getId(),
    username: user,
    action: "removed",
    members: room.getMembers(),
  });
}

function addMessageToRoom(roomId, username, msg) {
  const room = Rooms.getRoom(roomId);

  msg.time = new Date().getTime();

  if (room) {
    sendToRoom(room, "new message", {
      username: username,
      message: msg.message,
      room: msg.room,
      time: msg.time,
      direct: room.direct,
    });

    room.addMessage(msg);
  }
}

function setUserActiveState(socket, username, state) {
  const user = Users.getUser(username);

  if (user) user.setActiveState(state);

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

  socket.on("new message", (msg) => {
    if (userLoggedIn) {
      console.log(msg);
      addMessageToRoom(msg.room, username, msg);
    }
  });

  /////////////////////////////
  // request for direct room //
  /////////////////////////////

  socket.on("request_direct_room", (req) => {
    if (userLoggedIn) {
      const user_a = Users.getUser(req.to);
      const user_b = Users.getUser(username);

      if (user_a && user_b) {
        const room = getDirectRoom(user_a, user_b);
        const roomCID = "room" + room.getId();
        socket.join(roomCID);
        if (socketmap[user_a.name]) socketmap[user_a.name].join(roomCID);

        socket.emit("update_room", {
          room: room,
          moveto: true,
        });
      }
    }
  });

  socket.on("add_channel", (req) => {
    if (userLoggedIn) {
      const user = Users.getUser(username);
      console.log(req);
      const room = newChannel(req.name, req.description, req.private, user);
      const roomCID = "room" + room.getId();
      socket.join(roomCID);

      socket.emit("update_room", {
        room: room,
        moveto: true,
      });

      if (!room.private) {
        const publicChannels = Rooms.getRooms().filter(
          (r) => !r.direct && !r.private
        );
        socket.broadcast.emit("update_public_channels", {
          publicChannels: publicChannels,
        });
      }
    }
  });

  socket.on("join_channel", (req) => {
    if (userLoggedIn) {
      const user = Users.getUser(username);
      const room = Rooms.getRoom(req.id);

      if (!room.direct && !room.private) {
        addUserToRoom(user, room);

        const roomCID = "room" + room.getId();
        socket.join(roomCID);

        socket.emit("update_room", {
          room: room,
          moveto: true,
        });
      }
    }
  });

  socket.on("add_user_to_channel", (req) => {
    if (userLoggedIn) {
      const user = Users.getUser(req.user);
      const room = Rooms.getRoom(req.channel);

      if (!room.direct) {
        addUserToRoom(user, room);

        if (socketmap[user.name]) {
          const roomCID = "room" + room.getId();
          socketmap[user.name].join(roomCID);

          socketmap[user.name].emit("update_room", {
            room: room,
            moveto: false,
          });
        }
      }
    }
  });

  socket.on("leave_channel", (req) => {
    if (userLoggedIn) {
      const user = Users.getUser(username);
      const room = Rooms.getRoom(req.id);

      if (!room.direct && !room.forceMembership) {
        removeUserFromRoom(user, room);

        const roomCID = "room" + room.getId();
        socket.leave(roomCID);

        socket.emit("remove_room", {
          room: room.getId(),
        });
      }
    }
  });

  ///////////////
  // user join //
  ///////////////

  socket.on("join", (p_username) => {
    if (userLoggedIn) return;

    username = p_username;
    userLoggedIn = true;
    socketmap[username] = socket;

    const user = Users.getUser(username) || newUser(username);

    const rooms = user.getSubscriptions().map((s) => {
      socket.join("room" + s);
      return Rooms.getRoom(s);
    });

    const publicChannels = Rooms.getRooms().filter(
      (r) => !r.direct && !r.private
    );

    socket.emit("login", {
      users: Users.getUsers().map((u) => ({
        username: u.name,
        active: u.active,
      })),
      rooms: rooms,
      publicChannels: publicChannels,
    });

    setUserActiveState(socket, username, true);
  });

  ////////////////
  // reconnects //
  ////////////////

  socket.on("reconnect", () => {
    if (userLoggedIn) setUserActiveState(socket, username, true);
  });

  /////////////////
  // disconnects //
  /////////////////

  socket.on("disconnect", () => {
    if (userLoggedIn) setUserActiveState(socket, username, false);
  });
});
