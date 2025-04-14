const io = require("socket.io-client");
const electron = require("electron");
const sanitizeHtml = require("sanitize-html");
const crypto = require("crypto");
const SERVER = "localhost";
const PORT = 3000;

$(function () {
  // Get user data
  electron.ipcRenderer.send("get-user-data");

  electron.ipcRenderer.on("user-data", function (event, data) {
    load(data);
  });
});

function load(userdata) {
  console.log("Loading UI", userdata);

  // Initialize variables
  const $window = $(window);
  const $messages = $(".messages"); // Messages area
  const $inputMessage = $("#input-message"); // Input message input box
  const $usernameLabel = $("#user-name");
  const $roomList = $("#room-list");
  const $userList = $("#user-list");
  let publicKeyMap = {};

  let username = userdata.name;
  $usernameLabel.text(username);

  // Connect to server
  let connected = false;
  let socket = io(`wss://${SERVER}:${PORT}`, {
    transports: ["websocket"],
    secure: true,
    rejectUnauthorized: false,
    // ca,
  });

  let modalShowing = false;

  $("#addChannelModal")
    .on("hide.bs.modal", () => {
      modalShowing = false;
    })
    .on("show.bs.modal", () => {
      console.log("show");
      modalShowing = true;
    });

  ///////////////
  // User List //
  ///////////////

  let users = {};

  function updateUsers(p_users) {
    p_users.forEach((u) => (users[u.username] = u));
    updateUserList();
  }

  function updateUser(username, active) {
    if (!users[username]) users[username] = { username: username };

    users[username].active = active;

    updateUserList();
  }

  function updateUserList() {
    const $uta = $("#usersToAdd");
    $uta.empty();

    $userList.empty();
    for (let [un, user] of Object.entries(users)) {
      if (username !== user.username)
        $userList.append(`
          <li onclick="setDirectRoom(this)" data-direct="${
            user.username
          }" class="${user.active ? "online" : "offline"}">${user.username}</li>
        `);
      // append it also to the add user list
      $uta.append(`
          <button type="button" class="list-group-item list-group-item-action" data-bs-dismiss="modal" onclick="addToChannel('${user.username}')">${user.username}</button>
        `);
    }
  }

  ///////////////
  // Room List //
  ///////////////

  let rooms = [];

  function updateRooms(p_rooms) {
    rooms = p_rooms;
    updateRoomList();
  }

  function updateRoom(room) {
    const index = rooms.findIndex((r) => r.id === room.id);
    if (index !== -1) {
      rooms[index] = room;
    } else {
      // old code:
      rooms.push(room);
    }
    updateRoomList();
  }

  function removeRoom(id) {
    const index = rooms.findIndex((r) => r.id === id);
    if (index !== -1) {
      rooms.splice(index, 1);
    }
    updateRoomList();
  }

  function updateRoomList() {
    $roomList.empty();
    rooms.forEach((r) => {
      if (!r.direct)
        $roomList.append(`
          <li onclick="setRoom(${r.id})"  data-room="${r.id}" class="${
          r.private ? "private" : "public"
        }">${r.name}</li>
        `);
    });
  }

  function updateChannels(channels) {
    const c = $("#channelJoins");

    c.empty();
    channels.forEach((r) => {
      const room = rooms.find((ro) => ro.id === r.id);
      if (!room)
        c.append(`
          <button type="button" class="list-group-item list-group-item-action" data-bs-dismiss="modal" onclick="joinChannel(${r.id})">${r.name}</button>
        `);
    });
  }

  //////////////
  // Chatting //
  //////////////

  let currentRoom = false;

  function setRoom(id) {
    let oldRoom = currentRoom;
    const room = rooms.find((r) => r.id === id);
    currentRoom = room;
    if (!room.history) {
      console.error("Room history not found:", room);
      return;
    }
    $messages.empty();
    room.history.forEach((m) => addChatMessage(m));

    $userList.find("li").removeClass("active");
    $roomList.find("li").removeClass("active");

    if (room.direct) {
      const idx = room.members.indexOf(username) == 0 ? 1 : 0;
      const user = room.members[idx];
      setDirectRoomHeader(user);

      $userList
        .find(`li[data-direct="${user}"]`)
        .addClass("active")
        .removeClass("unread")
        .attr("data-room", room.id);
    } else {
      $("#channel-name").text("#" + room.name);
      $("#channel-description").text(
        `👤 ${room.members.length} | ${room.description}`
      );
      $roomList
        .find(`li[data-room=${room.id}]`)
        .addClass("active")
        .removeClass("unread");
    }

    $(".roomAction").css(
      "visibility",
      room.direct || room.forceMembership ? "hidden" : "visible"
    );
  }
  window.setRoom = setRoom;

  function setDirectRoomHeader(user) {
    $("#channel-name").text(user);
    $("#channel-description").text(`Direct message with ${user}`);
  }

  function setToDirectRoom(user) {
    setDirectRoomHeader(user);
    socket.emit("request_direct_room", { to: user });
  }

  window.setDirectRoom = (el) => {
    const user = el.getAttribute("data-direct");
    const room = el.getAttribute("data-room");

    if (room) {
      setRoom(parseInt(room));
    } else {
      setToDirectRoom(user);
    }
  };

  function sendMessage() {
    let message = $inputMessage.val();
    let msgPayload;
    if (message && connected && currentRoom !== false) {
      $inputMessage.val("");
      const cleanMessage = sanitizeHtml(message);

      if (currentRoom.private || currentRoom.direct) {
        const aesKey = crypto.randomBytes(32); // AES-256
        const iv = crypto.randomBytes(16);

        // Encrypt the message with AES
        const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
        let encryptedMsg = cipher.update(cleanMessage, "utf8", "base64");
        encryptedMsg += cipher.final("base64");

        // Encrypt AES key for each recipient
        const encryptedKeys = {};

        currentRoom.members.forEach((member) => {
          if (publicKeyMap[member]) {
            try {
              const encryptedKey = crypto.publicEncrypt(
                publicKeyMap[member],
                aesKey
              );
              encryptedKeys[member] = encryptedKey.toString("base64");
            } catch (err) {
              console.error(`Failed to encrypt for ${member}:`, err);
            }
          }
        });

        msgPayload = {
          username: username,
          room: currentRoom.id,
          message: encryptedMsg,
          iv: iv.toString("base64"),
          encryptedKeys,
        };
      } else {
        msgPayload = {
          username: username,
          message: cleanMessage,
          room: currentRoom.id,
        };
      }
      socket.emit("new message", msgPayload);
    }
  }
  function addEncryptedChatMessage(msg) {
    let time = new Date(msg.time).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "numeric",
      minute: "numeric",
    });
    console.log("Adding encrypted message:", msg);
    let decryptedMessage = "[Could not decrypt]";
    // Step 1: Decrypt AES key with user's private RSA key
    try {
      const encryptedAESKey = Buffer.from(msg.keys[username], "base64");
      if (!encryptedAESKey) return; // If the user wasn't part of the channel when the messages were sent, dont attempt to decrypt as he does not have acces
      // to the old symmetric key.
      const privateKey = userdata.privateKey;

      const aesKey = crypto.privateDecrypt(privateKey, encryptedAESKey);

      // Step 2: Decrypt the message with AES key + IV
      const iv = Buffer.from(msg.iv, "base64");
      const encryptedMsg = Buffer.from(msg.message, "base64");

      const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
      decryptedMessage = decipher.update(encryptedMsg, "base64", "utf8");
      decryptedMessage += decipher.final("utf8");
    } catch (err) {
      console.error("Decryption failed:", err);
    }
    // Step 3: Sanitize and render
    const cleanMessage = sanitizeHtml(decryptedMessage, {
      allowedTags: [],
      allowedAttributes: {},
    });

    $messages.append(`
      <div class="message">
        <div class="message-avatar"></div>
        <div class="message-textual">
          <span class="message-user">${msg.username}</span>
          <span class="message-time">${time}</span>
          <span class="message-content">${cleanMessage}</span>
        </div>
      </div>
    `);

    $messages[0].scrollTop = $messages[0].scrollHeight;
  }
  function addChatMessage(msg) {
    let time = new Date(msg.time).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "numeric",
      minute: "numeric",
    });
    // Step 3: Sanitize and render
    const cleanMessage = sanitizeHtml(msg.message, {
      allowedTags: [],
      allowedAttributes: {},
    });

    $messages.append(`
      <div class="message">
        <div class="message-avatar"></div>
        <div class="message-textual">
          <span class="message-user">${msg.username}</span>
          <span class="message-time">${time}</span>
          <span class="message-content">${cleanMessage}</span>
        </div>
      </div>
    `);

    $messages[0].scrollTop = $messages[0].scrollHeight;
  }

  function messageNotify(msg) {
    if (msg.direct)
      $userList.find(`li[data-direct="${msg.username}"]`).addClass("unread");
    else $roomList.find(`li[data-room=${msg.room}]`).addClass("unread");
  }

  function addChannel() {
    const name = $("#inp-channel-name").val();
    const description = $("#inp-channel-description").val();
    const private_ = $("#inp-private").is(":checked");

    // Sanitizing names & description
    const cleanName = sanitizeHtml(name);
    const cleanDescription = sanitizeHtml(description);
    socket.emit("add_channel", {
      name: cleanName,
      description: cleanDescription,
      private: private_,
    });
  }
  window.addChannel = addChannel;

  function joinChannel(id) {
    socket.emit("join_channel", { id: id });
  }
  window.joinChannel = joinChannel;

  function addToChannel(user) {
    socket.emit("add_user_to_channel", { channel: currentRoom.id, user: user });
  }
  window.addToChannel = addToChannel;

  function leaveChannel() {
    socket.emit("leave_channel", { id: currentRoom.id });
  }
  window.leaveChannel = leaveChannel;

  /////////////////////
  // Keyboard events //
  /////////////////////

  $window.on("keydown", (event) => {
    if (modalShowing) return;

    // Autofocus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $inputMessage.trigger("focus");
    }

    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      sendMessage();
    }

    // don't add newlines
    if (event.which === 13 || event.which === 10) {
      event.preventDefault();
    }
  });

  ///////////////////
  // server events //
  ///////////////////

  // Whenever the server emits -login-, log the login message
  socket.on("login", (data) => {
    connected = true;
    updateUsers(data.users);
    updateRooms(data.rooms);
    updateChannels(data.publicChannels);
    console.log("I logged in.");
    if (data.rooms.length > 0) {
      setRoom(data.rooms[0].id);
    }
  });

  socket.on("new_public_key", (data) => {
    console.log("Received public key for new member:", data.username);
    publicKeyMap[data.username] = data.publicKey;
  });

  socket.on("update_public_channels", (data) => {
    updateChannels(data.publicChannels);
  });

  // Whenever the server emits 'new message', update the chat body
  socket.on("new message", (msg) => {
    const roomId = msg.room;
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      room.history.push(msg);
    }

    if (roomId == currentRoom.id)
      if (room.private || room.direct) {
        addEncryptedChatMessage(msg);
      } else {
        addChatMessage(msg);
      }
    else messageNotify(msg);
  });

  socket.on("update_user", (data) => {
    const room = rooms.find((r) => r.id === data.room);

    if (room) {
      room.members = data.members;

      if (room === currentRoom) setRoom(data.room);
    }
  });

  socket.on("user_state_change", (data) => {
    updateUser(data.username, data.active);
  });

  socket.on("receive_public_keys", (keys) => {
    for (const [user, key] of Object.entries(keys)) {
      if (!publicKeyMap[user]) {
        console.log("Added new public key for:", user);
        publicKeyMap[user] = key;
      }
    }
  });

  socket.on("update_room", (data) => {
    updateRoom(data.room);
    if (data.moveto) setRoom(data.room.id);
    // if (data.room.private || data.room.direct) {
    //   console.log("I update the public key map", data);
    // }
  });

  socket.on("remove_room", (data) => {
    removeRoom(data.room);
    if (currentRoom.id == data.room) setRoom(1);
  });

  ////////////////
  // Connection //
  ////////////////

  socket.on("connect", () => {
    console.log("connect");
    socket.emit("join", username);
  });

  socket.on("disconnect", () => {
    console.log("disconnect");
  });

  socket.on("reconnect", () => {
    console.log("reconnect");

    // join
    socket.emit("join", username);
  });

  socket.on("reconnect_error", () => {
    console.log("reconnect_error");
  });
}
