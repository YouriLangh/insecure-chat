const { app, BrowserWindow, ipcMain } = require("electron");
const { error } = require("node:console");
const path = require("node:path");
const sanitizeHtml = require("sanitize-html");

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
};
// Regex to enforce just characters in a name

ipcMain.on("login", function (event, data) {
  // From reading documentation, we know that sanitize-html still allows for certain edge cases:
  const dirtyTest = "<>alert('xss')"; // Is sanitized to :  &lt;&gt;alert('xss')

  // Sanitizing user input on login
  const clean = sanitizeHtml(data.name);
  // Ensure only characters & digits are used
  const isValidUsername = /^[a-zA-Z0-9_]+$/.test(clean);
  console.log("User login name (post clean): ", clean);

  // Ensure a maximum size and minimum size for names
  if (clean.length > 5 && clean.length < 15 && isValidUsername) {
    userData.name = clean;
    openChat(BrowserWindow.getAllWindows()[0], data);
  }
});

ipcMain.on("get-user-data", function (event, arg) {
  event.sender.send("user-data", userData);
  console.log("I am printing this", userData);
});
