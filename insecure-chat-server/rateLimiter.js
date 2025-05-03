// Use rate limiting to prevent spamming. All actions are counted towards the limit. (sending a message, joining a room, etc.)
const rateLimitMap = new Map();

function IOrateLimit(socket, limit = 10, interval = 10000) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(socket.id) || [];

  // Remove timestamps older than the interval
  const filtered = timestamps.filter((ts) => now - ts < interval);

  if (filtered.length >= limit) {
    return false; // limit exceeded
  }

  filtered.push(now);
  rateLimitMap.set(socket.id, filtered);
  return true; // allowed
}
IOrateLimit.clear = (socketId) => {
  rateLimitMap.delete(socketId);
  console.log("Cleared rate limit map for socket:", socketId);
};

module.exports = IOrateLimit;
