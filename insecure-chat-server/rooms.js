module.exports = (pool) => ({
  addRoom: async (name, options = {}) => {
    const res = await pool.query(
      `INSERT INTO rooms (name, description, force_membership, private, direct)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
      [
        name,
        options.description || "",
        !!options.forceMembership,
        !!options.private,
        !!options.direct,
      ]
    );
    console.log(
      "Adding a room, with name: ",
      name,
      "returning the object: ",
      res.rows[0]
    );
    return res.rows[0];
  },

  // Todo, fetch the members and messages and store them in members, and .history fields. to send ot frontend
  getRoom: async (id) => {
    const roomQuery = await pool.query("SELECT * FROM rooms WHERE id = $1", [
      id,
    ]);
    const room = roomQuery.rows[0];

    if (!room) return null;

    // Fetch members for the room
    const membersQuery = await pool.query(
      `SELECT u.name FROM user_rooms ur
       JOIN users u ON u.id = ur.user_id
       WHERE ur.room_id = $1`,
      [id]
    );
    room.members = membersQuery.rows.map((row) => row.name);

    // Fetch message history for the room
    const messagesQuery = await pool.query(
      `SELECT m.username, m.message, m.time
       FROM messages m
       WHERE m.room_id = $1
       ORDER BY m.time ASC`,
      [id]
    );
    room.history = messagesQuery.rows;

    return room;
  },

  // Get all rooms with their members and history
  getRooms: async () => {
    const roomsQuery = await pool.query("SELECT * FROM rooms");
    const rooms = roomsQuery.rows;

    // For each room, fetch its members and history
    for (let room of rooms) {
      // Fetch members
      const membersQuery = await pool.query(
        `SELECT u.name FROM user_rooms ur
         JOIN users u ON u.id = ur.user_id
         WHERE ur.room_id = $1`,
        [room.id]
      );
      room.members = membersQuery.rows.map((row) => row.name);

      // Fetch message history
      const messagesQuery = await pool.query(
        `SELECT m.username, m.message, m.time
         FROM messages m
         WHERE m.room_id = $1
         ORDER BY m.time ASC`,
        [room.id]
      );
      room.history = messagesQuery.rows;
    }

    return rooms;
  },
  addMember: async (roomId, userId) => {
    const res = await pool.query(
      `INSERT INTO user_rooms (user_id, room_id)
           VALUES ($1, $2)`,
      [userId, roomId]
    );
  },
  removeMember: async (roomId, userId) => {
    const res = await pool.query(
      `REMOVE FROM user_rooms WHERE user_id = $1 AND room_id = $2`,
      [userId, roomId]
    );
  },

  getForcedRooms: async () => {
    const res = await pool.query(
      "SELECT * FROM rooms WHERE force_membership = true"
    );
    return res.rows;
  },

  getRoomMembers: async (roomId) => {
    const res = await pool.query(
      `SELECT u.name FROM user_rooms ur
         JOIN users u ON u.id = ur.user_id
         WHERE ur.room_id = $1`,
      [roomId]
    );
    return res.rows.map((row) => row.name);
  },
});
