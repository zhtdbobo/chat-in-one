const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Settings API
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // Chats API
    getChats: () => ipcRenderer.invoke('get-chats'),
    saveChats: (chats) => ipcRenderer.invoke('save-chats', chats),

    // Stream Chat API
    sendMessageStream: (requestData) => ipcRenderer.send('send-message-stream', requestData),
    updateTitlebarTheme: (theme) => ipcRenderer.send('update-titlebar-theme', theme),

    // Listeners
    onStreamStart: (callback) => ipcRenderer.on('stream-start', (event, data) => callback(data)),
    onStreamChunk: (callback) => ipcRenderer.on('stream-chunk', (event, data) => callback(data)),
    onStreamEnd: (callback) => ipcRenderer.on('stream-end', (event, data) => callback(data)),
    onStreamError: (callback) => ipcRenderer.on('stream-error', (event, data) => callback(data))
});
