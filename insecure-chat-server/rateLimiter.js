// Use rate limiting to prevent spamming. All actions are counted towards the limit. (sending a message, joining a room, etc.)
const rateLimitMap = new Map();
const RATE_LIMIT_NR_LIMIT = 20;
const RATE_LIMIT_TIME_THRESHOLD = 10 * 1000; // 10 seconds

function IOrateLimit(socket) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(socket.id) || [];

  // Remove timestamps older than the interval
  const filtered = timestamps.filter(
    (ts) => now - ts < RATE_LIMIT_TIME_THRESHOLD
  );

  if (filtered.length >= RATE_LIMIT_NR_LIMIT) {
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
