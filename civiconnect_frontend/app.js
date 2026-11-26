// ===== APNI AWS VALUES YAHAN DAALO =====
const CONFIG = {
  region: "ap-south-1",
  clientId: "YOUR_COGNITO_APP_CLIENT_ID",
  apiUrl: "https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com"
};
// =======================================

let pendingUser = {};   // used for email verification after signup

function $(id) { return document.getElementById(id); }

function showSection(id) {
  ["homeSection", "loginSection", "signupSection", "verifySection", "dashboardSection"].forEach(function (s) {
    $(s).classList.toggle("hidden", s !== id);
  });
  window.scrollTo(0, 0);
}

function setMsg(id, text, type) {
  $(id).textContent = text;
  $(id).className = "msg " + (type || "");
}

// ---------- Cognito ----------
async function cognito(action, body) {
  const res = await fetch("https://cognito-idp." + CONFIG.region + ".amazonaws.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService." + action
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.__type);
  return data;
}

async function signup() {
  try {
    pendingUser = { email: $("signupEmail").value.trim(), password: $("signupPassword").value };
    await cognito("SignUp", {
      ClientId: CONFIG.clientId,
      Username: pendingUser.email,
      Password: pendingUser.password,
      UserAttributes: [
        { Name: "email", Value: pendingUser.email },
        { Name: "name", Value: $("signupName").value }
      ]
    });
    showSection("verifySection");
  } catch (err) {
    setMsg("signupMsg", err.message, "error");
  }
}

async function verifyEmail() {
  try {
    await cognito("ConfirmSignUp", {
      ClientId: CONFIG.clientId,
      Username: pendingUser.email,
      ConfirmationCode: $("verifyCode").value.trim()
    });
    $("loginEmail").value = pendingUser.email;
    showSection("loginSection");
    setMsg("loginMsg", "Email verified. Please login now.", "success");
  } catch (err) {
    setMsg("verifyMsg", err.message, "error");
  }
}

async function login() {
  try {
    const data = await cognito("InitiateAuth", {
      ClientId: CONFIG.clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: $("loginEmail").value.trim(),
        PASSWORD: $("loginPassword").value
      }
    });
    sessionStorage.setItem("idToken", data.AuthenticationResult.IdToken);
    openDashboard();
  } catch (err) {
    setMsg("loginMsg", err.message, "error");
  }
}

function logout() {
  sessionStorage.clear();
  location.reload();
}

function openDashboard() {
  showSection("dashboardSection");
  $("logoutBtn").classList.remove("hidden");
  $("authBtn").textContent = "My Dashboard";
  loadComplaints();
}

// ---------- API Gateway ----------
async function callApi(path, method, body) {
  const res = await fetch(CONFIG.apiUrl + path, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": sessionStorage.getItem("idToken")
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function submitComplaint() {
  try {
    setMsg("complaintMsg", "Submitting...");
    const files = Array.from($("images").files).slice(0, 3);
    const imageKeys = [];

    // 1) Upload each image to S3 (using a presigned URL)
    for (const file of files) {
      const up = await callApi("/upload-url", "POST", { contentType: file.type });
      const put = await fetch(up.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!put.ok) throw new Error("Image upload failed");
      imageKeys.push(up.key);
    }

    // 2) Save complaint in DynamoDB (Lambda sends the SNS email)
    const result = await callApi("/complaints", "POST", {
      title: $("title").value,
      category: $("category").value,
      location: $("location").value,
      description: $("description").value,
      images: imageKeys
    });

    setMsg("complaintMsg", "Complaint registered successfully. ID: " + result.complaintId, "success");
    $("title").value = "";
    $("location").value = "";
    $("description").value = "";
    $("images").value = "";
    loadComplaints();
  } catch (err) {
    setMsg("complaintMsg", err.message, "error");
  }
}

async function loadComplaints() {
  const tbody = $("complaintList");
  try {
    const list = await callApi("/complaints", "GET");
    tbody.innerHTML = "";
    if (list.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5'>No complaints yet.</td></tr>";
      return;
    }
    list.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    list.forEach(function (c) {
      const tr = document.createElement("tr");
      const cells = [c.complaintId, c.title, c.category, new Date(c.createdAt).toLocaleDateString()];
      cells.forEach(function (text) {
        const td = document.createElement("td");
        td.textContent = text;       // textContent: safe from HTML injection
        tr.appendChild(td);
      });
      const td = document.createElement("td");
      const span = document.createElement("span");
      span.className = "status " + c.status.replace(" ", "");
      span.textContent = c.status;
      td.appendChild(span);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = "<tr><td colspan='5' class='error'>" + err.message + "</td></tr>";
  }
}

// ---------- Navigation ----------
function goTo(sectionId) {
  showSection("homeSection");
  $(sectionId).scrollIntoView();
}

function authClick() {
  if (sessionStorage.getItem("idToken")) openDashboard();
  else showSection("loginSection");
}

function reportIssue() {
  if (sessionStorage.getItem("idToken")) {
    openDashboard();
  } else {
    showSection("loginSection");
    setMsg("loginMsg", "Please login to register a complaint.");
  }
}

// ---------- Track complaint (public, no login required) ----------
async function trackComplaint() {
  const id = $("trackId").value.trim().toUpperCase();
  const box = $("trackResult");
  if (!id) { box.textContent = "Please enter a Complaint ID."; return; }
  box.textContent = "Searching...";
  try {
    const res = await fetch(CONFIG.apiUrl + "/track/" + encodeURIComponent(id));
    const c = await res.json();
    if (!res.ok) throw new Error(c.message || "Complaint not found");
    box.innerHTML = "";
    const div = document.createElement("div");
    div.className = "result-box";
    div.textContent = c.title + " (" + c.category + ") - " + new Date(c.createdAt).toLocaleDateString() + " - ";
    const span = document.createElement("span");
    span.className = "status " + c.status.replace(" ", "");
    span.textContent = c.status;
    div.appendChild(span);
    box.appendChild(div);
  } catch (err) {
    box.innerHTML = "";
    const e = document.createElement("span");
    e.className = "error";
    e.textContent = err.message;
    box.appendChild(e);
  }
}

// On page load: if already logged in, show the "My Dashboard" button
if (sessionStorage.getItem("idToken")) {
  $("authBtn").textContent = "My Dashboard";
  $("logoutBtn").classList.remove("hidden");
}
