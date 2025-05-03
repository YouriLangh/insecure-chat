const { ipcRenderer } = require("electron");

function toggleAuth(mode) {
  console.log(`Toggling auth mode to ${mode}`);
  document.getElementById("login-section").style.display =
    mode === "login" ? "block" : "none";
  document.getElementById("signup-section").style.display =
    mode === "signup" ? "block" : "none";
  document.getElementById("signupUserName").value =
    mode === "login" ? "" : document.getElementById("signupUserName").value;
  document.getElementById("signupPassword").value =
    mode === "login" ? "" : document.getElementById("signupPassword").value;
}

function login() {
  const userName = document.getElementById("loginUserName").value;
  const password = document.getElementById("loginPassword").value;
  ipcRenderer.send("login", { name: userName, password: password });
}

function signup() {
  const userName = document.getElementById("signupUserName").value;
  const password = document.getElementById("signupPassword").value;
  ipcRenderer.send("register", { name: userName, password: password });
}

window.addEventListener("DOMContentLoaded", () => {
  // Bind login/signup buttons
  document.querySelector(".btn-primary").addEventListener("click", login);
  document.querySelector(".btn-success").addEventListener("click", signup);

  // Bind text links
  const signupLink = document.getElementById("show-signup");
  const loginLink = document.getElementById("show-login");

  if (signupLink)
    signupLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAuth("signup");
    });
  if (loginLink)
    loginLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAuth("login");
    });
});

// Handle registration success
ipcRenderer.on("registration-success", () => {
  toggleAuth("login");
});
