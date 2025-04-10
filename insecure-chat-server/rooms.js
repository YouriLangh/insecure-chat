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
    return res.rows[0];
  },

  getRoom: async (id) => {
    const res = await pool.query("SELECT * FROM rooms WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  getRooms: async () => {
    const res = await pool.query("SELECT * FROM rooms");
    return res.rows;
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
