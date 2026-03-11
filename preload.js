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

    // Chats API
    getChats: () => ipcRenderer.invoke('get-chats'),
    saveChats: (chats) => ipcRenderer.invoke('save-chats', chats),

    // Stream Chat API
    sendMessageStream: (requestData) => ipcRenderer.send('send-message-stream', requestData),
    stopStream: () => ipcRenderer.invoke('stop-stream'),
    updateTitlebarTheme: (theme) => ipcRenderer.send('update-titlebar-theme', theme),

    // Listeners
    onStreamStart: (callback) => ipcRenderer.on('stream-start', (event, data) => callback(data)),
    onStreamChunk: (callback) => ipcRenderer.on('stream-chunk', (event, data) => callback(data)),
    onStreamEnd: (callback) => ipcRenderer.on('stream-end', (event, data) => callback(data)),
    onStreamError: (callback) => ipcRenderer.on('stream-error', (event, data) => callback(data))
});
