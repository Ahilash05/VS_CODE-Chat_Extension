const fs = require('fs');
const path = require('path');

class ChatHistory {
    constructor() {
        this.historyFile = path.join(__dirname, 'chat_history.json');
        this.globalHistoryFile = path.join(__dirname, 'global_chat_history.json');
        this.history = this.loadHistory();
        this.globalHistory = this.loadGlobalHistory();
        this.maxHistorySize = 10000;
        this.operationLock = false;
    }

    async executeWithLock(operation) {
        while (this.operationLock) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.operationLock = true;
        try {
            const result = await operation();
            return result;
        } finally {
            this.operationLock = false;
        }
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, 'utf8');
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    return parsed.filter(msg =>
                        msg && typeof msg === 'object' &&
                        msg.type && msg.content && msg.timestamp
                    );
                }
            }
            return [];
        } catch (error) {
            console.error('[ChatHistory] Error loading chat history:', error);
            this.backupCorruptedFile(this.historyFile);
            return [];
        }
    }

    loadGlobalHistory() {
        try {
            if (fs.existsSync(this.globalHistoryFile)) {
                const data = fs.readFileSync(this.globalHistoryFile, 'utf8');
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    return parsed.filter(msg =>
                        msg && typeof msg === 'object' &&
                        msg.type && msg.content && msg.timestamp
                    );
                }
            }
            return [];
        } catch (error) {
            console.error('[ChatHistory] Error loading global chat history:', error);
            this.backupCorruptedFile(this.globalHistoryFile);
            return [];
        }
    }

    async saveHistory() {
        return await this.executeWithLock(async () => {
            try {
                if (this.history.length > this.maxHistorySize) {
                    this.history = this.history.slice(-this.maxHistorySize);
                }
                await fs.promises.writeFile(this.historyFile, JSON.stringify(this.history, null, 2), 'utf8');
                console.log(`[ChatHistory] Saved ${this.history.length} messages to history`);
                return true;
            } catch (error) {
                console.error('[ChatHistory] Error saving chat history:', error);
                return false;
            }
        });
    }

    async saveGlobalHistory() {
        return await this.executeWithLock(async () => {
            try {
                if (this.globalHistory.length > this.maxHistorySize) {
                    this.globalHistory = this.globalHistory.slice(-this.maxHistorySize);
                }
                await fs.promises.writeFile(this.globalHistoryFile, JSON.stringify(this.globalHistory, null, 2), 'utf8');
                console.log(`[ChatHistory] Saved ${this.globalHistory.length} messages to global history`);
                return true;
            } catch (error) {
                console.error('[ChatHistory] Error saving global chat history:', error);
                return false;
            }
        });
    }

    async addMessage(message) {
        if (!message || typeof message !== 'object') {
            console.warn('[ChatHistory] Invalid message object provided');
            return false;
        }

        if (!message.type || !message.content) {
            console.warn('[ChatHistory] Message missing required fields (type, content)');
            return false;
        }

        try {
            const chatMessage = {
                id: this.generateMessageId(),
                type: message.type,
                content: message.content,
                model: message.model || 'unknown',
                timestamp: message.timestamp || new Date().toISOString(),
                threadId: message.threadId || null
            };

            this.history.push(chatMessage);
            this.globalHistory.push(chatMessage);

            const historySaved = await this.saveHistory();
            const globalSaved = await this.saveGlobalHistory();

            if (historySaved && globalSaved) {
                console.log(`[ChatHistory] Added message: ${message.type} - ${message.content.substring(0, 50)}...`);
                return true;
            } else {
                console.error('[ChatHistory] Failed to save message to one or both history files');
                return false;
            }
        } catch (error) {
            console.error('[ChatHistory] Error adding message:', error);
            return false;
        }
    }

    getHistory(limit = null) {
        const historyToReturn = limit ? this.history.slice(-limit) : this.history;
        return historyToReturn.map(msg => ({
            ...msg,
            timestamp: msg.timestamp || new Date().toISOString()
        }));
    }

    getGlobalHistory(limit = null) {
        const historyToReturn = limit ? this.globalHistory.slice(-limit) : this.globalHistory;
        return historyToReturn.map(msg => ({
            ...msg,
            timestamp: msg.timestamp || new Date().toISOString()
        }));
    }

    getHistoryByThread(threadId, limit = null) {
        if (!threadId) return [];
        const threadMessages = this.globalHistory.filter(msg => msg.threadId === threadId);
        return limit ? threadMessages.slice(-limit) : threadMessages;
    }

    async clearHistory() {
        return await this.executeWithLock(async () => {
            try {
                this.history = [];
                const saved = await this.saveHistory();
                if (saved) {
                    console.log('[ChatHistory] Cleared session history');
                    return true;
                }
                return false;
            } catch (error) {
                console.error('[ChatHistory] Error clearing history:', error);
                return false;
            }
        });
    }

    async clearGlobalHistory() {
        return await this.executeWithLock(async () => {
            try {
                this.globalHistory = [];
                const saved = await this.saveGlobalHistory();
                if (saved) {
                    console.log('[ChatHistory] Cleared global history');
                    return true;
                }
                return false;
            } catch (error) {
                console.error('[ChatHistory] Error clearing global history:', error);
                return false;
            }
        });
    }

    async clearThreadHistory(threadId) {
        if (!threadId) return false;

        return await this.executeWithLock(async () => {
            try {
                const originalCount = this.globalHistory.length;
                this.globalHistory = this.globalHistory.filter(msg => msg.threadId !== threadId);
                const removedCount = originalCount - this.globalHistory.length;
                const saved = await this.saveGlobalHistory();
                if (saved) {
                    console.log(`[ChatHistory] Removed ${removedCount} messages for thread ${threadId}`);
                    return true;
                }
                return false;
            } catch (error) {
                console.error(`[ChatHistory] Error clearing thread history for ${threadId}:`, error);
                return false;
            }
        });
    }

    generateMessageId() {
        return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    }

    backupCorruptedFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const backupPath = filePath + '.backup.' + Date.now();
                fs.copyFileSync(filePath, backupPath);
                console.log(`[ChatHistory] Backed up corrupted file to: ${backupPath}`);
            }
        } catch (error) {
            console.error('[ChatHistory] Error backing up corrupted file:', error);
        }
    }

    searchMessages(query, options = {}) {
        const {
            type = null,
            threadId = null,
            limit = 100,
            caseSensitive = false
        } = options;

        let searchIn = threadId ? this.getHistoryByThread(threadId) : this.globalHistory;

        if (type) {
            searchIn = searchIn.filter(msg => msg.type === type);
        }

        const searchQuery = caseSensitive ? query : query.toLowerCase();

        const results = searchIn.filter(msg => {
            const content = caseSensitive ? msg.content : msg.content.toLowerCase();
            return content.includes(searchQuery);
        });

        return results.slice(-limit);
    }

    getStatistics() {
        const stats = {
            totalMessages: this.globalHistory.length,
            userMessages: 0,
            assistantMessages: 0,
            byModel: {},
            threads: {}
        };

        for (const msg of this.globalHistory) {
            if (msg.type === 'user') stats.userMessages++;
            else if (msg.type === 'assistant') stats.assistantMessages++;

            const model = msg.model || 'unknown';
            if (!stats.byModel[model]) stats.byModel[model] = 0;
            stats.byModel[model]++;

            const threadId = msg.threadId || 'none';
            if (!stats.threads[threadId]) stats.threads[threadId] = 0;
            stats.threads[threadId]++;
        }

        return stats;
    }
}

module.exports = new ChatHistory();
