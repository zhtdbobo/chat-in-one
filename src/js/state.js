// state.js - Global state and DOM elements

// Initial app state
let state = {
    settings: {}, // will hold endpoint, apiKey, modelName, systemPrompt
    chats: [],    // Array of { id, title, messages: [] }
    currentChatId: null,
    isStreaming: false,
    currentStreamDiv: null
};

// DOM Elements
const chatListEl = document.getElementById('chat-list');
const messageContainer = document.getElementById('message-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');
const aboutBtn = document.getElementById('about-btn');
const companionsBtn = document.getElementById('companions-btn');

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');

// About Modal
const aboutModal = document.getElementById('about-modal');
const closeAboutBtn = document.getElementById('close-about-btn');

// Companions Modal
const companionsModal = document.getElementById('companions-modal');
const closeCompanionsBtn = document.getElementById('close-companions-btn');
const cancelCompanionsBtn = document.getElementById('cancel-companions-btn');
const saveCompanionsBtn = document.getElementById('save-companions-btn');
const addCompanionBtn = document.getElementById('add-companion-btn');

// Status badging & controls
const currentChatTitle = document.getElementById('current-chat-title');
const welcomeScreen = document.getElementById('welcome-screen');
const toggleSearchBtn = document.getElementById('toggle-search-btn');
const toggleThinkingBtn = document.getElementById('toggle-thinking-btn');