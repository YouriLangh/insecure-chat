module.exports = (pool) => ({
  getUserByName: async (name) => {
    const res = await pool.query("SELECT * FROM users WHERE name = $1", [
      name.toLowerCase(),
    ]);
    return res.rows[0] || null;
  },

  getUsers: async () => {
    const res = await pool.query("SELECT name, active FROM users");
    return res.rows;
  },

  getUserRoomIds: async (userId) => {
    const res = await pool.query(
      "SELECT room_id FROM user_rooms WHERE user_id = $1",
      [userId]
    );
    return res.rows.map((row) => row.room_id);
  },

  addUserToRoom: async (userId, roomId) => {
    await pool.query(
      `INSERT INTO user_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roomId]
    );
  },

  removeUserFromRoom: async (userId, roomId) => {
    await pool.query(
      `DELETE FROM user_rooms WHERE user_id = $1 AND room_id = $2`,
      [userId, roomId]
    );
  },

  setUserActiveState: async (username, active) => {
    await pool.query("UPDATE users SET active = $1 WHERE name = $2", [
      active,
      username.toLowerCase(),
    ]);
  },
});
