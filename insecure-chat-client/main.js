const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const https = require("https");
const sanitizeHtml = require("sanitize-html");
const fs = require("fs");

const caPath = path.join(__dirname, "certs", "rootCA.pem");
const ca = fs.readFileSync(caPath);

const agent = new https.Agent({ ca });

function openLogin(win) {
  win.loadFile("public/login.html");
}

function openChat(win, data) {
  win.loadFile("public/chat.html");
}
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
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
};
// Regex to enforce just characters in a name

ipcMain.on("login", function (event, data) {
  // From reading documentation, we know that sanitize-html still allows for certain edge cases:
  // "<>alert('xss')"  Is sanitized to :  &lt;&gt;alert('xss')

  // Sanitizing user input on login
  const cleanName = sanitizeHtml(data.name);
  // Ensure only characters & digits are used in both the password & username
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
        return res.text();
      })
      .then((data) => {
        userData.name = cleanName;
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
    fetch("https://localhost:3000/register", {
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
        return res.text();
      })
      .then((data) => {
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
  console.log("I am printing this", userData);
});
