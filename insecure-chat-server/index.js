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
const jwt = require("jsonwebtoken");
const IOrateLimit = require("./rateLimiter");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "30m";

app.use(express.json());
app.use(helmet());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // limit to 100 requests per 15 min per IP
  message: "Too many attempts. Try again later.",
});

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
  minVersion: "TLSv1.2", // Reject anything below TLS 1.2
  maxVersion: "TLSv1.3", // Only allow TLS 1.2 and 1.3 Sourced from: https://stackoverflow.com/questions/44629256/configure-https-agent-to-allow-only-tls1-2-for-outgoing-requests on 18/04 By Youri Langhendries
};
const server = https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS server running at https://localhost:${port}`);
});

const io = require("socket.io")(server);
// Parse JWT token during ws handshake, once approved users will not have to refresh their tokens
io.use((socket, next) => {
  try {
    const token = socket.handshake.headers.authorization || "";

    if (!token) return next(new Error("Authentication error")); // If we dont receive a valid token, send a connection error to the client.

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return next(new Error("Authentication failed"));
      socket.user = user; // pass along user data
      next();
    });
  } catch (err) {
    return next(new Error("Auth parse error"));
  }
});

app.post("/register", authLimiter, async (req, res) => {
  const { name, password, publicKey } = req.body;
  // Enforce input length limits
  if (name.length > 100 || password.length > 100) {
    return res.status(400).send("Input too long");
  }
  // Sanitize input, not really necessary.
  const cleanName = sanitizeHtml(name);
  const cleanPwd = sanitizeHtml(password);

  // Check if the input contains only alphanumeric characters (and underscores)
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

    const findUserResult = await pool.query(findUserQuery, [cleanName]); // Case sensitive!! Needed as frontend UI uses the name we find.

    if (findUserResult.rows.length > 0) {
      return res.status(400).send("User already exists");
    }

    const hashedPassword = await bcrypt.hash(cleanPwd, 10);

    // Insert the new user into the database
    const query = `
      INSERT INTO users (name, password, public_key)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;

    const values = [cleanName, hashedPassword, publicKey];

    const result = await pool.query(query, values);
    const user_id = result.rows[0].id;
    console.log(`User registered with ID: ${user_id}`);

    const forcedRoomsRes = await pool.query(
      `SELECT id FROM rooms WHERE force_membership = true`
    );
    const forcedRooms = forcedRoomsRes.rows;
    // Add user to each forced room
    for (const room of forcedRooms) {
      let aa = await addUserToRoom(result.rows[0], room);
    }

    res.status(200).send("Registration successful");
  } catch (error) {
    console.error("Registration failed:", error);
    res.status(500).send("Registration error");
  }
});

app.post("/login", authLimiter, async (req, res) => {
  const { name, password } = req.body;
  // Enforce input length limits
  if (name.length > 100 || password.length > 100) {
    return res.status(400).send("Input too long");
  }
  // Sanitize input, not really necessary.
  const cleanName = sanitizeHtml(name);
  const cleanPwd = sanitizeHtml(password);
  // Check if the input contains only alphanumeric characters (and underscores)
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
    // If user exists, check the password with the stored, hashed password
    const hashedUserPwd = findUserResult.rows[0].password;
    const samePwd = await bcrypt.compare(password, hashedUserPwd);

    if (!samePwd) {
      return res.status(400).send("Incorrect credentials");
    }
    const token = jwt.sign({ name: cleanName }, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });
    res.json({ token });
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
  let room = await Rooms.addRoom(name, options);
  room = await addUserToRoom(user, room);
  return room;
}

async function newChannel(name, description, private, user) {
  return await newRoom(name, user, {
    description: description,
    private: private,
  });
}

async function newDirectRoom(user_a, user_b) {
  let room = await Rooms.addRoom(`Direct-${user_a.name}-${user_b.name}`, {
    direct: true,
    private: true,
  });

  room = await addUserToRoom(user_a, room);
  room = await addUserToRoom(user_b, room);
  return room;
}

async function getDirectRoom(user_a, user_b) {
  let rooms = await Rooms.getRooms();
  rooms = rooms.filter(
    (r) =>
      r.direct &&
      ((r.members[0] == user_a.name && r.members[1] == user_b.name) ||
        (r.members[1] == user_a.name && r.members[0] == user_b.name))
  );

  if (rooms.length == 1) return rooms[0];
  else {
    return await newDirectRoom(user_a, user_b);
  }
}

async function addUserToRoom(user, room) {
  await Users.addSubscription(user.id, room.id);
  await Rooms.addMember(room.id, user.id);
  const members = await Rooms.getRoomMembers(room.id);
  sendToRoom(room, "update_user", {
    room: room.id,
    username: user,
    action: "added",
    members: members,
  });

  room.members = members;
  return room;
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
  let basePayload;
  if (!room) return;

  if (room.private || room.direct) {
    basePayload = {
      username: username,
      message: msg.message,
      room: msg.room,
      time: msg.time,
      iv: msg.iv,
      direct: room.direct,
      keys: msg.encryptedKeys,
    };

    // Insert into messages table and get message ID
    const insertMsgQuery = `
    INSERT INTO messages (room_id, username, iv, message, time)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `;
    const result = await pool.query(insertMsgQuery, [
      roomId,
      username,
      basePayload.iv,
      basePayload.message,
      basePayload.time,
    ]);

    const messageId = result.rows[0].id;
    // Insert encrypted AES keys per recipient
    const encryptedKeys = basePayload.keys;

    for (const [recipient, encryptedKey] of Object.entries(encryptedKeys)) {
      const insertKeyQuery = `
      INSERT INTO message_keys (message_id, recipient, encrypted_key)
      VALUES ($1, $2, $3)
    `;
      await pool.query(insertKeyQuery, [messageId, recipient, encryptedKey]);
    }
  } else {
    const insertMsgQuery = `
    INSERT INTO messages (room_id, username, message, time)
    VALUES ($1, $2, $3, $4);
  `;
    await pool.query(insertMsgQuery, [roomId, username, msg.message, msg.time]);

    basePayload = {
      username: username,
      message: msg.message,
      room: msg.room,
      time: msg.time,
      direct: room.direct,
    };
  }
  // Send message to room (with all encrypted keys if needed)
  sendToRoom(room, "new message", {
    ...basePayload,
  });
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
    // Use rate limiting to prevent spamming
    if (!IOrateLimit(socket)) {
      console.log("Rate limit exceeded for messaging", socket.user.name);
      return socket.emit("rate_error", "Rate limit exceeded");
    }

    if (userLoggedIn) {
      await addMessageToRoom(msg.room, username, msg);
    }
  });

  /////////////////////////////
  // request for direct room //
  /////////////////////////////

  socket.on("request_direct_room", async (req) => {
    // Use rate limiting to prevent spamming
    if (!IOrateLimit(socket)) {
      console.log(
        "Rate limit exceeded for direct room requests",
        socket.user.name
      );
      return socket.emit("rate_error", "Rate limit exceeded");
    }
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
    // Use rate limiting to prevent spamming
    if (!IOrateLimit(socket)) {
      return socket.emit("rate_error", "Rate limit exceeded");
    }
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
    if (!IOrateLimit(socket)) {
      console.log("Switching channels too fast!", socket.user.name);
      return socket.emit("rate_error", "Rate limit exceeded");
    }
    if (userLoggedIn) {
      const user = await Users.getUserByName(username);
      let room = await Rooms.getRoom(req.id);

      if (!room.direct && !room.private) {
        room = await addUserToRoom(user, room);

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
    if (!IOrateLimit(socket)) {
      console.log("Adding too many users to channels!", socket.user.name);
      return socket.emit("rate_error", "Rate limit exceeded");
    }
    if (userLoggedIn) {
      const user = await Users.getUserByName(req.user); // The user being added
      let room = await Rooms.getRoom(req.channel);

      if (!room.direct) {
        room = await addUserToRoom(user, room);

        if (socketmap[user.name]) {
          const roomCID = "room" + room.id;
          socketmap[user.name].join(roomCID);
        }
      }
    }
  });

  socket.on("leave_channel", async (req) => {
    if (!IOrateLimit(socket)) {
      console.log("Leaving channels too quickly!", socket.user.name);
      return socket.emit("rate_error", "Rate limit exceeded");
    }
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
    username = socket.user.name;
    userLoggedIn = true;
    socketmap[username] = socket;
    const user = await Users.getUserByName(username);
    const roomIds = await Users.getSubscriptions(user.id);
    const rooms = [];

    for (const roomId of roomIds) {
      const id = roomId.room_id;
      socket.join("room" + id);
      const room = await Rooms.getRoom(id);
      rooms.push(room);
    }

    const publicChannels = rooms.filter((r) => !r.direct && !r.private);
    const users = await Users.getUsers();
    const publicKeys = {};

    users.forEach((u) => {
      publicKeys[u.name] = u.public_key;
    });

    socket.emit("login", {
      users: users.map((u) => ({ username: u.name, active: u.active })),
      rooms,
      publicChannels,
    });

    socket.emit("receive_public_keys", publicKeys);

    const publicKeyEvent = {
      username: user.name,
      publicKey: user.public_key,
    };

    socket.broadcast.emit("new_public_key", publicKeyEvent);
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
    console.log("Disconnecting the user...");
    IOrateLimit.clear(socket.id);
    if (userLoggedIn) await setUserActiveState(socket, username, false);
  });
});
