module.exports = (pool) => ({
  // Replaced all user functions with database equivalents

  // Retrieve a user by their username
  getUserByName: async (name) => {
    const res = await pool.query("SELECT * FROM users WHERE name = $1", [name]);
    return res.rows[0] || null;
  },

  // Get all the users in the database
  getUsers: async () => {
    const res = await pool.query("SELECT * FROM users");
    return res.rows;
  },
  // Add a user to a room with the roomId
  addUserToRoom: async (userId, roomId) => {
    await pool.query(
      `INSERT INTO user_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roomId]
    );
  },
  // Remove a user from a room with the roomId
  removeUserFromRoom: async (userId, roomId) => {
    await pool.query(
      `DELETE FROM user_rooms WHERE user_id = $1 AND room_id = $2`,
      [userId, roomId]
    );
  },
  // Alter the active state of a user.
  setUserActiveState: async (username, active) => {
    await pool.query("UPDATE users SET active = $1 WHERE name = $2", [
      active,
      username,
    ]);
  },
  // Add a subscription for the user to a room
  addSubscription: async (userId, roomId) => {
    await pool.query(
      `INSERT INTO subscriptions (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [userId, roomId]
    );
  },
  // Remove a subscription for the user to a room
  removeSubscription: async (userId, roomId) => {
    await pool.query(
      `DELETE FROM subscriptions WHERE user_id = $1 AND room_id = $2`,
      [userId, roomId]
    );
  },
  // Get all subscriptions for a user
  getSubscriptions: async (userId) => {
    const res = await pool.query(
      `SELECT room_id FROM subscriptions WHERE user_id = $1`,
      [userId]
    );
    return res.rows;
  },
});
