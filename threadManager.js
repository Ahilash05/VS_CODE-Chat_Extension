const fs = require('fs');
const path = require('path');

class ThreadManager {
    constructor() {
        this.threadsPath = path.join(__dirname, 'threads');
        this.ensureThreadsDirectory();
        this.operationLock = new Map(); // Prevent concurrent operations on same thread
    }

    ensureThreadsDirectory() {
        if (!fs.existsSync(this.threadsPath)) {
            fs.mkdirSync(this.threadsPath, { recursive: true });
        }
    }

    // Async wrapper for thread operations to prevent race conditions
    async executeThreadOperation(threadId, operation) {
        const lockKey = threadId || 'global';
        
        // Wait for any existing operation on this thread to complete
        if (this.operationLock.has(lockKey)) {
            await this.operationLock.get(lockKey);
        }

        // Create new promise for this operation
        const operationPromise = new Promise(async (resolve, reject) => {
            try {
                const result = await operation();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });

        this.operationLock.set(lockKey, operationPromise);
        
        try {
            const result = await operationPromise;
            this.operationLock.delete(lockKey);
            return result;
        } catch (error) {
            this.operationLock.delete(lockKey);
            throw error;
        }
    }

    async createThread(name = null) {
        return await this.executeThreadOperation('global', async () => {
            const threadId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
            const threadPath = path.join(this.threadsPath, `${threadId}.json`);
            const threadData = {
                id: threadId,
                name: name || 'Untitled Thread',
                created: new Date().toISOString(),
                messages: []
            };
            
            try {
                await fs.promises.writeFile(threadPath, JSON.stringify(threadData, null, 2));
                console.log(`[ThreadManager] Created thread: ${threadId} at ${threadPath}`);
                
                // Verify the file was created
                if (await this.verifyThreadExists(threadId)) {
                    return threadId;
                } else {
                    throw new Error('Thread file verification failed');
                }
            } catch (error) {
                console.error(`[ThreadManager] Error creating thread ${threadId}:`, error);
                throw error;
            }
        });
    }

    async verifyThreadExists(threadId) {
        if (!threadId) return false;
        
        const threadPath = path.join(this.threadsPath, `${threadId}.json`);
        try {
            await fs.promises.access(threadPath, fs.constants.F_OK);
            console.log(`[ThreadManager] Verified thread exists: ${threadId}`);
            return true;
        } catch (error) {
            console.log(`[ThreadManager] Thread does not exist: ${threadId}`, error.code);
            return false;
        }
    }

    async getThread(threadId) {
        if (!threadId) {
            console.warn('[ThreadManager] getThread called with null/undefined threadId');
            return null;
        }
        
        return await this.executeThreadOperation(threadId, async () => {
            const threadPath = path.join(this.threadsPath, `${threadId}.json`);
            
            try {
                if (await this.verifyThreadExists(threadId)) {
                    const data = await fs.promises.readFile(threadPath, 'utf-8');
                    const parsedData = JSON.parse(data);
                    
                    // Ensure thread has required structure
                    if (!parsedData.id || !parsedData.messages) {
                        throw new Error('Invalid thread structure');
                    }
                    
                    return parsedData;
                }
                console.warn(`[ThreadManager] Thread file not found: ${threadPath}`);
                return null;
            } catch (error) {
                console.error(`[ThreadManager] Error reading thread ${threadId}:`, error);
                return null;
            }
        });
    }
    
    getThreadDescription(threadId) {
        if (!threadId) return "Invalid thread ID";
        
        // This needs to be synchronous for UI updates, but we'll make it safer
        try {
            const threadPath = path.join(this.threadsPath, `${threadId}.json`);
            if (!fs.existsSync(threadPath)) return "Thread not found";
            
            const data = fs.readFileSync(threadPath, 'utf-8');
            const thread = JSON.parse(data);
            
            if (thread.name && thread.name !== 'Untitled Thread') return thread.name;
            if (!thread.messages || thread.messages.length === 0) {
                return "Empty thread";
            }
            
            // Find first user message to use as description
            const firstUserMessage = thread.messages.find(msg => msg.type === 'user');
            if (firstUserMessage) {
                const description = firstUserMessage.content.length > 50 
                    ? firstUserMessage.content.substring(0, 47) + '...' 
                    : firstUserMessage.content;
                return description;
            }
            return "Thread without user messages";
        } catch (error) {
            console.error(`[ThreadManager] Error getting thread description for ${threadId}:`, error);
            return "Error loading thread";
        }
    }

    async addMessageToThread(threadId, message) {
        if (!threadId) {
            console.error('[ThreadManager] addMessageToThread called with null/undefined threadId');
            return false;
        }
        
        return await this.executeThreadOperation(threadId, async () => {
            const threadPath = path.join(this.threadsPath, `${threadId}.json`);
            
            try {
                if (await this.verifyThreadExists(threadId)) {
                    const data = await fs.promises.readFile(threadPath, 'utf-8');
                    const threadData = JSON.parse(data);
                    
                    threadData.messages.push({
                        ...message,
                        timestamp: new Date().toISOString(),
                        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9)
                    });
                    
                    await fs.promises.writeFile(threadPath, JSON.stringify(threadData, null, 2));
                    console.log(`[ThreadManager] Added message to thread ${threadId}`);
                    return true;
                } else {
                    console.error(`[ThreadManager] Thread file not found for adding message: ${threadPath}`);
                    return false;
                }
            } catch (error) {
                console.error(`[ThreadManager] Error adding message to thread ${threadId}:`, error);
                return false;
            }
        });
    }

    async deleteThread(threadId) {
        if (!threadId) {
            console.error('[ThreadManager] deleteThread called with null/undefined threadId');
            return false;
        }
        
        return await this.executeThreadOperation(threadId, async () => {
            console.log(`[ThreadManager] Attempting to delete thread: ${threadId}`);
            const threadPath = path.join(this.threadsPath, `${threadId}.json`);
            console.log(`[ThreadManager] Thread path: ${threadPath}`);
            
            try {
                // Check if file exists before attempting deletion
                if (await this.verifyThreadExists(threadId)) {
                    console.log(`[ThreadManager] Thread file exists, attempting to delete...`);
                    
                    // Add a small delay to ensure any pending operations are complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    try {
                        await fs.promises.unlink(threadPath);
                        console.log(`[ThreadManager] Unlink operation completed for: ${threadPath}`);
                    } catch (unlinkError) {
                        console.error(`[ThreadManager] Error during unlink operation:`, unlinkError);
                        return false;
                    }
                    
                    // Add a small delay to ensure file system has processed the deletion
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Verify deletion
                    const stillExists = await this.verifyThreadExists(threadId);
                    if (!stillExists) {
                        console.log(`[ThreadManager] Successfully deleted thread: ${threadId}`);
                        return true;
                    } else {
                        console.error(`[ThreadManager] Thread file still exists after deletion attempt: ${threadPath}`);
                        // Try to check file stats for debugging
                        try {
                            const stats = await fs.promises.stat(threadPath);
                            console.log(`[ThreadManager] File stats:`, stats);
                        } catch (statError) {
                            console.log(`[ThreadManager] Could not get file stats:`, statError);
                        }
                        return false;
                    }
                } else {
                    console.warn(`[ThreadManager] Thread file does not exist: ${threadPath}`);
                    // List all files in the directory for debugging
                    try {
                        const files = await fs.promises.readdir(this.threadsPath);
                        console.log(`[ThreadManager] Available thread files:`, files);
                    } catch (dirError) {
                        console.error(`[ThreadManager] Error reading threads directory:`, dirError);
                    }
                    return false;
                }
            } catch (error) {
                console.error(`[ThreadManager] Error deleting thread ${threadId}:`, error);
                return false;
            }
        });
    }

    async listThreads() {
        return await this.executeThreadOperation('global', async () => {
            try {
                if (!fs.existsSync(this.threadsPath)) {
                    console.warn('[ThreadManager] Threads directory does not exist');
                    return [];
                }
                
                const files = await fs.promises.readdir(this.threadsPath);
                const threadIds = files
                    .filter(file => file.endsWith('.json'))
                    .map(file => file.replace('.json', ''))
                    .sort((a, b) => {
                        // Extract timestamp from thread ID for sorting
                        const aTime = a.split('_')[0];
                        const bTime = b.split('_')[0];
                        return parseInt(bTime) - parseInt(aTime); // Sort by timestamp (newest first)
                    });
                
                console.log(`[ThreadManager] Found ${threadIds.length} threads:`, threadIds);
                return threadIds;
            } catch (error) {
                console.error('[ThreadManager] Error listing threads:', error);
                return [];
            }
        });
    }

    async setThreadName(threadId, name) {
        if (!threadId) {
            console.error('[ThreadManager] setThreadName called with null/undefined threadId');
            return false;
        }
        
        return await this.executeThreadOperation(threadId, async () => {
            const threadPath = path.join(this.threadsPath, `${threadId}.json`);
            
            try {
                if (await this.verifyThreadExists(threadId)) {
                    const data = await fs.promises.readFile(threadPath, 'utf-8');
                    const threadData = JSON.parse(data);
                    threadData.name = name;
                    await fs.promises.writeFile(threadPath, JSON.stringify(threadData, null, 2));
                    console.log(`[ThreadManager] Set thread name for ${threadId}: ${name}`);
                    return true;
                } else {
                    console.error(`[ThreadManager] Cannot set name - thread file not found: ${threadPath}`);
                    return false;
                }
            } catch (error) {
                console.error(`[ThreadManager] Error setting thread name for ${threadId}:`, error);
                return false;
            }
        });
    }

    async getAllThreadsMeta() {
        const threadIds = await this.listThreads();
        const threadsMeta = [];
        
        for (const id of threadIds) {
            try {
                const thread = await this.getThread(id);
                threadsMeta.push({
                    id,
                    name: thread && thread.name ? thread.name : 'Untitled Thread',
                    created: thread && thread.created ? thread.created : new Date().toISOString(),
                    messageCount: thread && thread.messages ? thread.messages.length : 0
                });
            } catch (error) {
                console.error(`[ThreadManager] Error getting meta for thread ${id}:`, error);
                // Include corrupted thread in list for cleanup purposes
                threadsMeta.push({
                    id,
                    name: 'Corrupted Thread',
                    created: new Date().toISOString(),
                    messageCount: 0,
                    corrupted: true
                });
            }
        }
        
        return threadsMeta;
    }

    // Helper method to clean up any orphaned or corrupted thread files
    async cleanupThreads() {
        return await this.executeThreadOperation('global', async () => {
            try {
                const files = await fs.promises.readdir(this.threadsPath);
                let cleaned = 0;
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(this.threadsPath, file);
                        try {
                            const data = await fs.promises.readFile(filePath, 'utf-8');
                            const parsedData = JSON.parse(data);
                            if (!parsedData.id || !parsedData.created) {
                                console.log(`[ThreadManager] Removing corrupted thread file: ${file}`);
                                await fs.promises.unlink(filePath);
                                cleaned++;
                            }
                        } catch (parseError) {
                            console.log(`[ThreadManager] Removing unparseable thread file: ${file}`);
                            await fs.promises.unlink(filePath);
                            cleaned++;
                        }
                    }
                }
                
                if (cleaned > 0) {
                    console.log(`[ThreadManager] Cleaned up ${cleaned} corrupted thread files`);
                }
                
                return cleaned;
            } catch (error) {
                console.error('[ThreadManager] Error during cleanup:', error);
                return 0;
            }
        });
    }

    // Debug method to get thread directory info
    async getDebugInfo() {
        try {
            const exists = fs.existsSync(this.threadsPath);
            const files = exists ? await fs.promises.readdir(this.threadsPath) : [];
            const threadIds = await this.listThreads();
            
            return {
                threadsPath: this.threadsPath,
                directoryExists: exists,
                fileCount: files.length,
                files: files,
                threadIds: threadIds
            };
        } catch (error) {
            return {
                threadsPath: this.threadsPath,
                error: error.message
            };
        }
    }
}

module.exports = new ThreadManager();