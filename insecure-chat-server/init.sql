-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) UNIQUE NOT NULL,
    public_key TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT FALSE
);

-- Create Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    force_membership BOOLEAN DEFAULT FALSE,
    private BOOLEAN DEFAULT FALSE,
    direct BOOLEAN DEFAULT FALSE
);

-- Create User-Rooms Relationship Table
CREATE TABLE IF NOT EXISTS user_rooms (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
);

-- Create Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    iv TEXT DEFAULT NULL,
    message TEXT NOT NULL,
    time BIGINT NOT NULL
);

-- Create Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
);

-- Create Message Keys Table
CREATE TABLE IF NOT EXISTS message_keys (
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    PRIMARY KEY (message_id, recipient)
);
