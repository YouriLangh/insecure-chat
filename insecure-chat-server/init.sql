-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) UNIQUE NOT NULL,
    salt VARCHAR(255) UNIQUE NOT NULL,
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

-- Create User-Rooms Relationship Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_rooms (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
);

-- Create Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
