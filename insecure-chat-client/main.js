const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const https = require("https");
const sanitizeHtml = require("sanitize-html");
const fs = require("fs");

const { generateKeyPairSync } = require("crypto");

const keysFilePath = path.join(__dirname, "user_keys.json");

// Load the stored keys from the JSON file, this way users can login different times
// and still have their keys available
function loadAllStoredKeys() {
  if (!fs.existsSync(keysFilePath)) return {};
  try {
    const fileContent = fs.readFileSync(keysFilePath, "utf8").trim();
    if (!fileContent) return {}; // Avoid parsing empty file
    return JSON.parse(fileContent);
  } catch (err) {
    console.error("Failed to read or parse keys file:", err);
    return {};
  }
}

// Store the private key of the user in a JSON file
function storeUserKey(username, privateKey) {
  const allKeys = loadAllStoredKeys();
  allKeys[username] = privateKey;

  try {
    const jsonContent = JSON.stringify(allKeys, null, 2);
    fs.writeFileSync(keysFilePath, jsonContent, "utf8");
  } catch (err) {
    console.error("Failed to write keys file:", err);
  }
}

const caPath = path.join(__dirname, "certs2", "rootCA.pem");
const ca = fs.readFileSync(caPath);

const agent = new https.Agent({ ca: ca });
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
function openLogin(win) {
  win.loadFile("public/login.html");
}

function openChat(win, data) {
  win.loadFile("public/chat.html");
}
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  openLogin(win);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let userData = {
  name: false,
  privateKey: false,
  token: false,
};
// Regex to enforce just characters in a name

ipcMain.on("login", function (event, data) {
  // Sanitizing user input on login
  const cleanName = sanitizeHtml(data.name);
  // Ensure only characters, underscores & digits are used in both the password & username
  const isValidUsername = /^[a-zA-Z0-9_]+$/.test(cleanName);
  const pwd = data.password;
  const cleanPwd = sanitizeHtml(pwd); // sanitize password aswell
  const isValidPwd = /^[a-zA-Z0-9_]+$/.test(cleanPwd);

  // Ensure a maximum size and minimum size for names
  if (
    cleanName.length >= 5 &&
    cleanName.length < 15 &&
    isValidUsername &&
    isValidPwd &&
    pwd === cleanPwd // Prevent any injections in the password field. Most likely overkill.
  ) {
    fetch("https://localhost:3000/login", {
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: cleanName,
        password: pwd,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((errorMessage) => {
            throw new Error(
              errorMessage || `Request failed with status ${res.status}`
            );
          });
        }
        return res.json();
      })
      .then((data) => {
        userData.name = cleanName;
        userData.token = data.token; // Store JWT
        const allKeys = loadAllStoredKeys(); // Retrieve the RSA keys from the JSON file and store in memory
        const storedKey = allKeys[cleanName];

        if (storedKey) {
          userData.privateKey = storedKey;
        } else {
          console.error(`No stored key found for ${cleanName}`);
        }

        openChat(BrowserWindow.getAllWindows()[0], data);
        event.reply("registration-success");
      })
      .catch((err) => {
        console.error("HTTPS request failed:", err);
        event.reply("registration-failed");
      });
  } else {
    console.log(
      "Invalid username or password. Ensure username is longer than 5 characters."
    );
    event.reply("registration-failed");
  }
});

/**
 * This function handles the registration of a new user.
 * It sanitizes the username and password, checks their validity,
 * generates a new RSA key pair, and sends a POST request to the server.
 * If successful, it stores the private key locally.
 */
ipcMain.on("register", function (event, data) {
  const cleanName = sanitizeHtml(data.name);
  const isValidUsername = /^[a-zA-Z0-9_]+$/.test(cleanName);
  const pwd = data.password;
  const cleanPwd = sanitizeHtml(pwd);
  const isValidPwd = /^[a-zA-Z0-9_]+$/.test(cleanPwd);

  if (
    cleanName.length >= 5 &&
    cleanName.length < 15 &&
    isValidUsername &&
    pwd.length >= 5 &&
    isValidPwd &&
    cleanPwd === pwd
  ) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    fetch("https://localhost:3000/register", {
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: cleanName,
        password: pwd,
        publicKey: publicKey,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((_) => {
            throw new Error(`Request failed with status ${res.status}`);
          });
        }
        return res.text();
      })
      .then((data) => {
        userData.name = cleanName;
        userData.privateKey = privateKey;
        storeUserKey(cleanName, privateKey);
        event.reply("registration-success");
      })
      .catch((err) => {
        console.error("HTTPS request failed:", err);
        event.reply("registration-failed");
      });
  } else {
    console.log(
      "Invalid username or password. Ensure both the password and username are of length >=5"
    );
    event.reply("registration-failed");
  }
});

ipcMain.on("get-user-data", function (event, arg) {
  event.sender.send("user-data", userData);
});
