
const $ = (selector) => document.querySelector(selector);

const chatArea = $("#chatArea");
const welcome = $("#welcome");
const messagesEl = $("#messages");
const form = $("#chatForm");
const input = $("#messageInput");
const sendBtn = $("#sendBtn");
const typingRow = $("#typingRow");
const historyList = $("#historyList");
const sidebar = $("#sidebar");
const toast = $("#toast");

let messages = [];
let conversations = [];
let activeConversationId = null;
let isLoading = false;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Format basic Markdown in AI responses.
function formatText(text) {
  let safe = escapeHTML(text);
  const codeBlocks = [];

  safe = safe.replace(
    /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g,
    (_, language, code) => {
      const index = codeBlocks.length;
      codeBlocks.push(
        `<pre><code>${code.trimEnd()}</code></pre>`
      );
      return `%%CODEBLOCK${index}%%`;
    }
  );

  safe = safe
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\s*[-*] (.+)$/gm, "• $1")
    .replace(/\n/g, "<br>");

  safe = safe.replace(
    /%%CODEBLOCK(\d+)%%/g,
    (_, index) => codeBlocks[Number(index)]
  );

  return safe;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function updateWelcome() {
  welcome.hidden = messages.length > 0;
}

function addMessage(role, content, save = true) {
  const isUser = role === "user";

  const wrapper = document.createElement("div");
  wrapper.className = `message ${isUser ? "user" : "assistant"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = isUser ? "U" : "✳";

  const body = document.createElement("div");
  body.className = "message-body";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = isUser ? "You" : "Nova AI";

  const textElement = document.createElement("div");
  textElement.className = "message-text";

  textElement.innerHTML = isUser
    ? escapeHTML(content).replace(/\n/g, "<br>")
    : formatText(content);

  body.append(name, textElement);

  if (!isUser) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy response";

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(content);
        showToast("Response copied!");
      } catch {
        showToast("Copy failed. Please select the text manually.");
      }
    });

    actions.append(copy);
    body.append(actions);
  }

  if (isUser) {
    wrapper.append(body, avatar);
  } else {
    wrapper.append(avatar, body);
  }

  messagesEl.append(wrapper);

  if (save) {
    messages.push({ role, content });
    updateWelcome();
  }

  scrollToBottom();
}

function updateHistory() {
  historyList.innerHTML = "";

  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Your conversations will appear here.";
    historyList.append(empty);
    return;
  }

  conversations.slice().reverse().forEach((conversation) => {
    const button = document.createElement("button");
    button.className = "history-item";
    button.textContent = conversation.title;
    button.title = conversation.title;

    button.addEventListener("click", () => {
      loadConversation(conversation.id);
    });

    historyList.append(button);
  });
}

function saveCurrentConversation() {
  if (!activeConversationId || !messages.length) return;

  const conversation = conversations.find(
    (item) => item.id === activeConversationId
  );

  if (!conversation) return;

  conversation.messages = [...messages];

  const firstUserMessage = messages.find(
    (message) => message.role === "user"
  );

  conversation.title = firstUserMessage
    ? firstUserMessage.content.slice(0, 36)
    : "New conversation";

  updateHistory();
}

function createNewChat() {
  if (isLoading) {
    showToast("Please wait for Nova's response.");
    return;
  }

  saveCurrentConversation();

  activeConversationId = crypto.randomUUID();
  messages = [];

  conversations.push({
    id: activeConversationId,
    title: "New conversation",
    messages: []
  });

  messagesEl.innerHTML = "";
  updateWelcome();
  updateHistory();

  input.value = "";
  input.focus();

  sidebar.classList.remove("open");
}

function loadConversation(id) {
  if (isLoading) return;

  saveCurrentConversation();

  const conversation = conversations.find(
    (item) => item.id === id
  );

  if (!conversation) return;

  activeConversationId = id;
  messages = [...conversation.messages];
  messagesEl.innerHTML = "";

  messages.forEach((message) => {
    addMessage(message.role, message.content, false);
  });

  updateWelcome();
  sidebar.classList.remove("open");
}

function setLoading(loading) {
  isLoading = loading;
  typingRow.hidden = !loading;
  sendBtn.disabled = loading;
  input.disabled = loading;

  sendBtn.innerHTML = loading ? "…" : "<span>↑</span>";

  if (loading) scrollToBottom();
}

async function sendMessage(text) {
  text = text.trim();

  if (!text || isLoading) return;

  if (!activeConversationId) {
    activeConversationId = crypto.randomUUID();

    conversations.push({
      id: activeConversationId,
      title: text.slice(0, 36),
      messages: []
    });
  }

  // Add the user's message first.
  addMessage("user", text);

  input.value = "";
  input.style.height = "auto";

  // IMPORTANT: The backend expects { role, text }.
  // Gemini uses "model" for assistant replies.
  const conversationHistory = messages
    .filter(
      (message) =>
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      text: message.content
    }));

  setLoading(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: conversationHistory
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `Server error (${response.status})`
      );
    }

    const answer = data.answer || data.text || data.reply;

    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error(
        "Nova returned an empty response. Please try again."
      );
    }

    addMessage("assistant", answer);
    saveCurrentConversation();

  } catch (error) {
    console.error("Nova AI error:", error);

    addMessage(
      "assistant",
      `Sorry, something went wrong: ${error.message}\n\nPlease check your backend and Gemini API configuration.`
    );

    saveCurrentConversation();

  } finally {
    setLoading(false);
    input.disabled = false;
    input.focus();
  }
}

// Send a message using the form.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

// Automatically resize the input.
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

// Enter sends; Shift + Enter creates a new line.
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// Welcome-screen suggested prompts.
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.dataset.prompt);
  });
});

$("#newChat").addEventListener("click", createNewChat);

$("#clearBtn").addEventListener("click", () => {
  if (isLoading) return;

  createNewChat();
  showToast("Ready for a fresh conversation.");
});

$("#menuBtn").addEventListener("click", () => {
  sidebar.classList.add("open");
});

$("#closeSidebar").addEventListener("click", () => {
  sidebar.classList.remove("open");
});

$("#homeBtn").addEventListener("click", () => {
  if (isLoading) return;
  createNewChat();
});

$("#historyBtn").addEventListener("click", () => {
  historyList.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

  if (window.innerWidth <= 760) {
    sidebar.classList.add("open");
  }
});

document.addEventListener("keydown", (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "k"
  ) {
    event.preventDefault();
    createNewChat();
  }

  if (event.key === "Escape") {
    sidebar.classList.remove("open");
  }
});

// Initialize the sidebar history.
updateHistory();
