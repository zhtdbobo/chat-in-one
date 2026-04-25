const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // App info & update
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    onUpdateStatus: (callback) => {
        const fn = (e, data) => callback(data);
        ipcRenderer.on('update-status', fn);
        return () => ipcRenderer.removeListener('update-status', fn);
    },

    // Settings API
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    testProviderConnection: (payload) => ipcRenderer.invoke('test-provider-connection', payload),
    summarizeChat: (payload) => ipcRenderer.invoke('summarize-chat', payload),
    fetchProviderModels: (payload) => ipcRenderer.invoke('fetch-provider-models', payload),
    exportProviders: (providers) => ipcRenderer.invoke('export-providers', providers),
    exportProvidersToFile: (providers) => ipcRenderer.invoke('export-providers-to-file', providers),

    // Generic file save
    saveJsonFile: (payload) => ipcRenderer.invoke('save-json-file', payload),

    // Chats API
    getChats: () => ipcRenderer.invoke('get-chats'),
    saveChats: (chats) => ipcRenderer.invoke('save-chats', chats),

    // Stream Chat API
    sendMessageStream: (requestData) => ipcRenderer.send('send-message-stream', requestData),
    stopStream: () => ipcRenderer.invoke('stop-stream'),
    updateTitlebarTheme: (theme) => ipcRenderer.send('update-titlebar-theme', theme),

    // Window Management API
    isMaximized: () => ipcRenderer.invoke('is-maximized'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    unmaximizeWindow: () => ipcRenderer.invoke('unmaximize-window'),

    // Listeners
    onStreamStart: (callback) => ipcRenderer.on('stream-start', (event, data) => callback(data)),
    onStreamChunk: (callback) => ipcRenderer.on('stream-chunk', (event, data) => callback(data)),
    onStreamEnd: (callback) => ipcRenderer.on('stream-end', (event, data) => callback(data)),
    onStreamError: (callback) => ipcRenderer.on('stream-error', (event, data) => callback(data))
});
