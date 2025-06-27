const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const toolHandlers = require('./toolHandlers');
const askGemma = require('./gemmaWrapper');
const askGemini = require('./geminiWrapper');
const chatHistory = require('./chatHistory');
const threadManager = require('./threadManager');

const htmlPath = path.join(__dirname, 'chat.html');
function getChatHtml(highlightJsUri, highlightCssUri, markedJsUri) {
  let html = fs.readFileSync(path.join(__dirname, 'chat.html'), 'utf-8');

  return html
    .replace('<!--HIGHLIGHT_JS-->', `<script src="${highlightJsUri}"></script>`)
    .replace('<!--HIGHLIGHT_CSS-->', `<link rel="stylesheet" href="${highlightCssUri}">`)
    .replace('<!--MARKED_JS-->', `<script src="${markedJsUri}"></script>`);
}


const toolDefinitions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'toolDefinitions.json'), 'utf-8')
);

function activate(context) {
  console.log('[Moo_LLM] Extension activated');
  const provider = new MooChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('moollm.chatView', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('moollm.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.moollm-chat-panel-container');
    })
  );

  provider.initialized = false;
}

class MooChatViewProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this.currentThreadId = null;
    this.webviewView = null;
  }

  async resolveWebviewView(webviewView) {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionUri.fsPath, 'media'))
      ]
    };
    const webview = webviewView.webview;

const highlightJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'highlight.min.js'));
const highlightCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'github-dark.min.css'));
const markedJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'marked.min.js'));

webview.html = getChatHtml(highlightJsUri, highlightCssUri, markedJsUri);

    try {
      await this.initializeThreadSystem();
      await this.updateThreadUI();
    } catch (error) {
      console.error('[Moo_LLM] Error initializing thread system:', error);
      vscode.window.showErrorMessage('Failed to initialize chat threads');
    }
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleWebviewMessage(message);
    });
  }

  async initializeThreadSystem() {
    try {
      const existingThreads = await threadManager.listThreads();
      if (!this.initialized || existingThreads.length === 0) {
        console.log('[Moo_LLM] Creating initial thread...');
        const threadId = await threadManager.createThread();
        if (!threadId) throw new Error('Failed to create initial thread');
        this.currentThreadId = threadId;
        this.initialized = true;
        console.log(`[Moo_LLM] Created initial thread: ${threadId}`);
      } else {
        this.currentThreadId = existingThreads[0];
        console.log(`[Moo_LLM] Using existing thread: ${this.currentThreadId}`);
      }
    } catch (error) {
      console.error('[Moo_LLM] Error in initializeThreadSystem:', error);
      throw error;
    }
  }

  async updateThreadUI() {
    if (!this.webviewView || !this.currentThreadId) {
      console.warn('[Moo_LLM] Cannot update UI - missing webview or thread ID');
      return;
    }

    try {
      const thread = await threadManager.getThread(this.currentThreadId);
      if (thread) {
        this.webviewView.webview.postMessage({
          command: 'loadHistory',
          history: thread.messages || [],
          threadId: this.currentThreadId,
          isNewThread: !thread.messages || thread.messages.length === 0
        });
      }

      const threadIds = await threadManager.listThreads();
      const threads = await Promise.all(
        threadIds.map(async (id) => ({
          id,
          description: threadManager.getThreadDescription(id)
        }))
      );

      this.webviewView.webview.postMessage({
        command: 'updateThreads',
        threads,
        currentThreadId: this.currentThreadId
      });

    } catch (error) {
      console.error('[Moo_LLM] Error updating thread UI:', error);
      vscode.window.showErrorMessage('Failed to update thread interface');
    }
  }

  async handleWebviewMessage(message) {
    try {
      switch (message.command) {
        case 'switchThread':
          await this.handleSwitchThread(message.threadId);
          break;
        case 'newThread':
          await this.handleNewThread(message.model);
          break;
        case 'deleteThread':
          await this.handleDeleteThread(message.threadId, message.model);
          break;
        case 'ask':
          await this.handleAskMessage(message);
          break;
        default:
          console.warn(`[Moo_LLM] Unknown command: ${message.command}`);
      }
    } catch (error) {
      console.error(`[Moo_LLM] Error handling message ${message.command}:`, error);
      this.webviewView.webview.postMessage({
        command: 'error',
        message: `Error: ${error.message}`
      });
    }
  }

  async handleSwitchThread(threadId) {
    if (!threadId || threadId === this.currentThreadId) return;
    console.log(`[Moo_LLM] Switching to thread: ${threadId}`);
    try {
      const thread = await threadManager.getThread(threadId);
      if (thread) {
        this.currentThreadId = threadId;
        this.webviewView.webview.postMessage({
          command: 'switchedThread',
          threadId,
          messages: thread.messages || []
        });
        console.log(`[Moo_LLM] Successfully switched to thread: ${threadId}`);
      } else {
        throw new Error(`Thread ${threadId} not found`);
      }
    } catch (error) {
      console.error(`[Moo_LLM] Error switching thread:`, error);
      vscode.window.showErrorMessage(`Failed to switch to thread: ${error.message}`);
    }
  }

  async handleNewThread(model = 'gemma') {
    try {
      console.log('[Moo_LLM] Creating new thread...');
      const name = await generateThreadName(model);
      const threadId = await threadManager.createThread(name);
      if (!threadId) throw new Error('Failed to create new thread');
      await threadManager.setThreadName(threadId, name);
      this.currentThreadId = threadId;
      const thread = await threadManager.getThread(threadId);
      this.webviewView.webview.postMessage({
        command: 'switchedThread',
        threadId,
        messages: thread.messages || []
      });
      await this.updateThreadList();
      console.log(`[Moo_LLM] Successfully created and switched to new thread: ${threadId}`);
      vscode.window.showInformationMessage(`Created new thread: ${name}`);
    } catch (error) {
      console.error('[Moo_LLM] Error creating new thread:', error);
      vscode.window.showErrorMessage(`Failed to create new thread: ${error.message}`);
    }
  }

  async handleDeleteThread(threadId, model) {
    if (!threadId) {
      console.error('[Moo_LLM] Delete thread called with no thread ID');
      this.webviewView.webview.postMessage({
        command: 'error',
        operation: 'deleteThread',
        message: 'No thread ID provided'
      });
      return;
    }

    try {
      console.log(`[Moo_LLM] Attempting to delete thread: ${threadId}`);
      const threadExists = await threadManager.verifyThreadExists(threadId);
      if (!threadExists) {
        console.warn(`[Moo_LLM] Thread ${threadId} does not exist, cannot delete`);
        this.webviewView.webview.postMessage({
          command: 'error',
          operation: 'deleteThread',
          message: 'Thread does not exist or was already deleted'
        });
        return;
      }

      console.log(`[Moo_LLM] Calling threadManager.deleteThread for: ${threadId}`);
      const success = await threadManager.deleteThread(threadId);
      console.log(`[Moo_LLM] deleteThread result: ${success}`);

      if (success) {
        console.log(`[Moo_LLM] Successfully deleted thread: ${threadId}`);
        this.webviewView.webview.postMessage({
          command: 'threadDeleted',
          threadId
        });
        await this.updateThreadList();

        if (threadId === this.currentThreadId) {
          this.currentThreadId = null;
          this.webviewView.webview.postMessage({
            command: 'switchedThread',
            threadId: null,
            messages: []
          });
          vscode.window.showInformationMessage('Thread deleted. Please create or switch to another.');
        }
      } else {
        console.error(`[Moo_LLM] Thread deletion failed for: ${threadId}`);
        throw new Error('Thread deletion failed');
      }
    } catch (error) {
      console.error(`[Moo_LLM] Error deleting thread ${threadId}:`, error);
      this.webviewView.webview.postMessage({
        command: 'error',
        operation: 'deleteThread',
        message: `Failed to delete thread: ${error.message}`
      });
      vscode.window.showErrorMessage(`Failed to delete thread: ${error.message}`);
    }
  }

  async updateThreadList() {
    try {
      const threadIds = await threadManager.listThreads();
      const threads = await Promise.all(
        threadIds.map(async (id) => ({
          id,
          description: threadManager.getThreadDescription(id)
        }))
      );
      this.webviewView.webview.postMessage({
        command: 'updateThreads',
        threads,
        currentThreadId: this.currentThreadId
      });
    } catch (error) {
      console.error('[Moo_LLM] Error updating thread list:', error);
    }
  }

 async handleAskMessage(message) {
  const userInput = message.text;
  const model = message.model || 'gemma';
  const threadId = this.currentThreadId;
  if (!threadId) throw new Error('No active thread');

  try {
    const userMessage = {
      type: 'user',
      content: userInput,
      model,
      timestamp: new Date().toISOString()
    };

    const messageAdded = await threadManager.addMessageToThread(threadId, userMessage);
    if (!messageAdded) throw new Error('Failed to add user message to thread');
    chatHistory.addMessage(userMessage);

    this.webviewView.webview.postMessage({ command: 'thinking', model, threadId });
    this.webviewView.webview.postMessage({ command: 'streamStart' });

    let fullResponse = '';

    const onChunk = (chunk) => {
      fullResponse += chunk;
      this.webviewView.webview.postMessage({ command: 'streamChunk', text: chunk });
    };

    const onEnd = async () => {
      // Post-process tool calls if any
      const toolCallRegex = /\[TOOL_CALL:({[^}]+})\]/g;
      let match;
      let finalResponse = fullResponse;

      while ((match = toolCallRegex.exec(fullResponse)) !== null) {
        try {
          const toolCall = JSON.parse(match[1]);
          if (toolHandlers[toolCall.name]) {
            const result = await toolHandlers[toolCall.name](toolCall.parameters);
            finalResponse = finalResponse.replace(match[0], result);
          }
        } catch (toolErr) {
          console.error('[Moo_LLM] Tool call error:', toolErr);
        }
      }

      const assistantMessage = {
        type: 'assistant',
        content: finalResponse,
        model,
        timestamp: new Date().toISOString()
      };

      const responseAdded = await threadManager.addMessageToThread(threadId, assistantMessage);
      if (!responseAdded) throw new Error('Failed to add AI response to thread');

      chatHistory.addMessage(assistantMessage);
      this.webviewView.webview.postMessage({ command: 'streamEnd' });
    };

    if (model === 'gemini') {
      await askGemini(userInput, onChunk, onEnd);
    } else {
      await askGemma(userInput, onChunk, onEnd);
    }

  } catch (err) {
    console.error(`[Moo_LLM] Error in handleAskMessage:`, err);
    this.webviewView.webview.postMessage({
      command: 'response',
      text: `Error using ${model}: ${err.message || 'Unknown error'}`
    });
  }
 }

}

async function generateThreadName(model = 'gemma') {
  const prompt = 'Generate a concise, relevant 3-word topic for a new chat thread. Only output the topic, no extra text.';
  try {
    const name = model === 'gemini' ? await require('./geminiWrapper')(prompt) : await require('./gemmaWrapper')(prompt);
    return name.split(/\n|\./)[0].trim();
  } catch (e) {
    console.error('[Moo_LLM] Error generating thread name:', e);
    return 'New AI Thread';
  }
}

function deactivate() {
  console.log('[Moo_LLM] Extension deactivated');
}

module.exports = { activate, deactivate };
