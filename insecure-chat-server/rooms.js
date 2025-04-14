module.exports = (pool) => {
  // Helper function to fetch room members
  const getRoomMembers = async (roomId) => {
    const membersQuery = await pool.query(
      `SELECT u.name FROM user_rooms ur
       JOIN users u ON u.id = ur.user_id
       WHERE ur.room_id = $1`,
      [roomId]
    );
    return membersQuery.rows.map((row) => row.name);
  };

  // Helper function to fetch room messages and convert time to readable format
  const getRoomMessages = async (roomId) => {
    const messagesQuery = await pool.query(
      `SELECT m.username, m.message, m.time
       FROM messages m
       WHERE m.room_id = $1
       ORDER BY m.time ASC`,
      [roomId]
    );
    // Convert time to readable format
    return messagesQuery.rows.map((msg) => ({
      ...msg,
      time: Number(msg.time),
    }));
  };

  return {
    getRoomMembers,
    getRoomMessages,

    // Add a room
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
      const room = res.rows[0];
      if (!room) return null;
      room.members = [];
      room.history = [];
      return room;
    },

    // Get a single room with members and messages
    getRoom: async (id) => {
      const roomQuery = await pool.query("SELECT * FROM rooms WHERE id = $1", [
        id,
      ]);
      const room = roomQuery.rows[0];

      if (!room) return null;

      // Fetch members for the room
      room.members = await getRoomMembers(id);

      // Fetch message history for the room
      room.history = await getRoomMessages(id);

      return room;
    },

    // Get all rooms with their members and history
    getRooms: async () => {
      const roomsQuery = await pool.query("SELECT * FROM rooms");
      const rooms = roomsQuery.rows;

      // For each room, fetch its members and history
      for (let room of rooms) {
        // Fetch members
        room.members = await getRoomMembers(room.id);

        // Fetch message history
        room.history = await getRoomMessages(room.id);
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
        `DELETE FROM user_rooms WHERE user_id = $1 AND room_id = $2`,
        [userId, roomId]
      );
    },

    getForcedRooms: async () => {
      const res = await pool.query(
        "SELECT * FROM rooms WHERE force_membership = true"
      );
      return res.rows;
    },
  };
};
