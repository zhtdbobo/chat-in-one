// state.js - Global state and DOM elements

// Initial app state
let state = {
    settings: {},
    chats: [],
    currentChatId: null,
    isStreaming: false,
    currentStreamDiv: null,
    isExportMode: false,
    activeSkillId: null,
    enabledMcpServerIds: [],
    _newlyCreatedId: null,
    isNewFreshChat: false,
    isComparisonMode: false,
    selectedComparisonModels: [], // array of "providerId|modelName"
    comparisonStreams: {} // modelName -> DOM element mapping
};

// DOM Elements
const chatListEl = document.getElementById('chat-list');
const messageContainer = document.getElementById('message-container');
const messagesList = document.getElementById('messages-list'); // 新增：专门存放消息的容器
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');
const aboutBtn = document.getElementById('about-btn');
const companionsBtn = document.getElementById('companions-btn');

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');

// Conversation Settings Modal
const conversationSettingsModal = document.getElementById('conversation-settings-modal');
const closeConversationSettingsBtn = document.getElementById('close-conversation-settings-btn');
const cancelConversationSettingsBtn = document.getElementById('cancel-conversation-settings-btn');
const saveConversationSettingsBtn = document.getElementById('save-conversation-settings-btn');
const conversationSettingsBtn = document.getElementById('conversation-settings-btn');

// About Modal
const aboutModal = document.getElementById('about-modal');
const closeAboutBtn = document.getElementById('close-about-btn');

// Companions Modal
const companionsModal = document.getElementById('companions-modal');
const closeCompanionsBtn = document.getElementById('close-companions-btn');
const addCompanionBtn = document.getElementById('add-companion-btn');

// Status badging & controls
const currentChatTitle = document.getElementById('current-chat-title');
const welcomeScreen = document.getElementById('welcome-screen');
const toggleSearchBtn = document.getElementById('toggle-search-btn');

// Comparison View Elements
const comparisonToggleBtn = document.getElementById('comparison-toggle-btn');
const multiModelSelectBtn = document.getElementById('multi-model-select-btn');
const multiModelModal = document.getElementById('multi-model-modal');
const multiModelList = document.getElementById('multi-model-list');
const confirmMultiModelBtn = document.getElementById('confirm-multi-model-btn');
const cancelMultiModelBtn = document.getElementById('cancel-multi-model-btn');
const closeMultiModelBtn = document.getElementById('close-multi-model-btn');