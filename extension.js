const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const toolHandlers = require('./toolHandlers');
const askGemma = require('./gemmaWrapper');
const askGemini = require('./geminiWrapper');
const chatHistory = require('./chatHistory');
const threadManager = require('./threadManager');
const CodeLensProvider = require('./codeLensProvider');


const htmlPath = path.join(__dirname, 'chat.html');
function getChatHtml(highlightJsUri, highlightCssUri, markedJsUri) {
  let html = fs.readFileSync(path.join(__dirname, 'chat.html'), 'utf-8');

  return html
    .replace('<!--HIGHLIGHT_JS-->', `<script src="${highlightJsUri}"></script>`)
    .replace('<!--HIGHLIGHT_CSS-->', `<link rel="stylesheet" href="${highlightCssUri}">`)
    .replace('<!--MARKED_JS-->', `<script src="${markedJsUri}"></script>`);
}




function activate(context) {
  initializeGlobalState(context);
  console.log('[Moo_LLM] Extension activated');

// Auto-index workspace on activation
context.subscriptions.push(
  vscode.workspace.onDidChangeWorkspaceFolders(async () => {
    await autoIndexWorkspace();
  })
);

// Index immediately when extension activates
setTimeout(async () => {
  await autoIndexWorkspace();
}, 2000); // Small delay to ensure workspace is fully loaded

async function autoIndexWorkspace() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return;
  
  try {
    console.log('[Moo_LLM] Auto-indexing workspace:', workspaceFolder);
    const { execSync } = require('child_process');
    const IndexingDir = path.join(__dirname, 'Indexing');
    
    // Run indexing pipeline
    execSync(`node "${path.join(IndexingDir, 'index.cjs')}" "${workspaceFolder}"`, { cwd: IndexingDir });
    execSync(`node "${path.join(IndexingDir, 'generateEmbedding.js')}"`, { cwd: IndexingDir });
    execSync(`node "${path.join(IndexingDir, 'storeInFaiss.cjs')}"`, { cwd: IndexingDir });
    
    console.log('[Moo_LLM] Workspace indexing completed');
  } catch (error) {
    console.error('[Moo_LLM] Auto-indexing failed:', error);
  }
}


  [{ language: 'javascript' }, { language: 'typescript' }, { language: 'python' }].map(lang => ({
  scheme: 'file', language: lang
})).forEach(selector => {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, new CodeLensProvider())
  );
});

  context.subscriptions.push(
  vscode.languages.registerCodeLensProvider(
    { scheme: 'file', language: 'javascript' },
    new CodeLensProvider()
  )
);

context.subscriptions.push(
  vscode.commands.registerCommand('extension.analyzeLine', async (document, line) => {
    vscode.window.showInformationMessage(`Analyzing line ${line + 1}...`);

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const decoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: '← Modified',
        color: 'red',
        margin: '0 0 0 1em'
      }
    });

    const position = new vscode.Position(line , 0);
    const range = new vscode.Range(position, position);

    editor.setDecorations(decoration, [{ range }]);
  })
);

  const provider = new MooChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('moollm.chatView', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('moollm.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.moollm-chat-panel-container');
    })
  );
  context.subscriptions.push(
  vscode.commands.registerCommand('moollm.fixErrors', async () => {
    const toolHandlers = require('./toolHandlers');
    const result = await toolHandlers.FixErrorsInCurrentFile();
    vscode.window.showInformationMessage(result);
  })
);

  provider.initialized = false;
}

// Global state management
let globalState = null;

function initializeGlobalState(context) {
  globalState = context.globalState;
}

function saveGlobalChatState(threadId, messages, threads) {
  if (!globalState) return;
  
  const chatState = {
    currentThreadId: threadId,
    availableThreads: threads,
    lastActiveTime: Date.now(),
    messages: messages
  };
  
  globalState.update('moollm.chatState', chatState);
  console.log('[Moo_LLM] Global state saved');
}

function loadGlobalChatState() {
  if (!globalState) return null;
  
  const state = globalState.get('moollm.chatState');
  console.log('[Moo_LLM] Global state loaded:', state ? 'found' : 'not found');
  return state;
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
    // Try to restore from global state first
    const savedState = loadGlobalChatState();
    
    if (savedState && savedState.currentThreadId) {
      console.log('[Moo_LLM] Restoring from global state...');
      
      // Verify the saved thread still exists
      const threadExists = await threadManager.verifyThreadExists(savedState.currentThreadId);
      if (threadExists) {
        this.currentThreadId = savedState.currentThreadId;
        this.initialized = true;
        console.log(`[Moo_LLM] Restored thread: ${this.currentThreadId}`);
        return;
      }
    }
    
    // Fallback to existing logic
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

       if (thread && threads) {
    saveGlobalChatState(this.currentThreadId, thread.messages || [], threads);
  }

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
        case 'applyFix':
  await toolHandlers.ApplyFixedCodeToCurrentFile(message.code);
  this.webviewView.webview.postMessage({
    command: 'response',
    text: ' Changes have been applied and highlighted in the editor!'
  });
  break;
  case 'saveState':
  try {
    const thread = await threadManager.getThread(this.currentThreadId);
    const threadIds = await threadManager.listThreads();
    const threads = await Promise.all(
      threadIds.map(async (id) => ({
        id,
        description: threadManager.getThreadDescription(id)
      }))
    );
    saveGlobalChatState(this.currentThreadId, thread?.messages || [], threads);
  } catch (error) {
    console.error('[Moo_LLM] Error saving state:', error);
  }
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

  console.log('DEBUG: userInput =', userInput);

  try {
    const thread = await threadManager.getThread(threadId);
    const conversationHistory = thread.messages || [];

    const userMessage = {
      type: 'user',
      content: userInput,
      model,
      timestamp: new Date().toISOString()
    };

    const fullConversation = [...conversationHistory, userMessage];

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

    const onEnd = async (finalResponse) => {
  console.log('DEBUG: finalResponse =', finalResponse);
  
  
  const toolCallMatch = finalResponse.match(/\[TOOL_CALL:\s*(\{.*?\})\]/);
  
  if (toolCallMatch) {
    try {
      const toolCall = JSON.parse(toolCallMatch[1]);
      const toolName = toolCall.name;
      
      console.log('DEBUG: Found tool call:', toolName, toolCall.parameters);
      
      if (toolName === 'FixErrorsInCurrentFile') {
        const fix = await toolHandlers.FixErrorsInCurrentFile();
        console.log('DEBUG: Fix result:', fix);
        
        if (fix && typeof fix === 'object' && fix.preview) {
          this.webviewView.webview.postMessage({
            command: 'fixSuggestion',
            fileName: fix.fileName,
            code: fix.preview
          });
          
          const assistantMessage = {
            type: 'assistant',
            content: `I've analyzed your file and found some issues. Here's the suggested fix for ${fix.fileName}:\n\n\`\`\`\n${fix.preview}\n\`\`\``,
            model,
            timestamp: new Date().toISOString()
          };
          await threadManager.addMessageToThread(threadId, assistantMessage);
          chatHistory.addMessage(assistantMessage);
          
          
          this.webviewView.webview.postMessage({ command: 'streamEnd' });
          return;
        } else {
          const errorMsg = typeof fix === 'string' ? fix : 'Failed to generate fix';
          this.webviewView.webview.postMessage({
            command: 'response',
            text: errorMsg
          });
          this.webviewView.webview.postMessage({ command: 'streamEnd' });
          return;
        }
      }

      // Add these cases to your existing tool handling logic in handleAskMessage:

if (toolName === 'CreateFile' || toolName === 'EditFile' || toolName === 'ReadFile' || toolName === 'ShowDiff') {
  const result = await toolHandlers[toolName](toolCall.parameters || {});
  console.log('DEBUG: File operation result:', result);
  
  const assistantMessage = {
    type: 'assistant',
    content: result,
    model,
    timestamp: new Date().toISOString()
  };
  
  await threadManager.addMessageToThread(threadId, assistantMessage);
  chatHistory.addMessage(assistantMessage);
  
  this.webviewView.webview.postMessage({
    command: 'response',
    text: result
  });
  
  this.webviewView.webview.postMessage({ command: 'streamEnd' });
  return;
}


      
      // Replace the existing tool handling section in extension.js with this:

if (toolHandlers[toolName]) {
  const result = await toolHandlers[toolName](toolCall.parameters || {});
  console.log('DEBUG: Tool result:', result);
  
  // Special handling for CreateFile to ensure clean response
  let responseText = result;
  if (toolName === 'CreateFile' && typeof result === 'string') {
    // Extract only the success message, remove any extra content
    responseText = result.includes('File created successfully:') 
      ? result.split('File created successfully:')[1].split(',')[0].trim()
      : result;
    responseText = `File created successfully: ${responseText}`;
  }
  
  const assistantMessage = {
    type: 'assistant',
    content: responseText,
    model,
    timestamp: new Date().toISOString()
  };
  
  await threadManager.addMessageToThread(threadId, assistantMessage);
  chatHistory.addMessage(assistantMessage);
  
  this.webviewView.webview.postMessage({
    command: 'response',
    text: responseText
  });
  
  this.webviewView.webview.postMessage({ command: 'streamEnd' });
  return;
}
    } catch (error) {
      console.error('Error parsing/executing tool call:', error);
      
    }
  }
  
 
  console.log('DEBUG: Processing as regular response (no tool call found)');
  const assistantMessage = {
    type: 'assistant',
    content: finalResponse,
    model,
    timestamp: new Date().toISOString()
  };

  const responseAdded = await threadManager.addMessageToThread(threadId, assistantMessage);
  if (!responseAdded) throw new Error('Failed to add AI response to thread');

  chatHistory.addMessage(assistantMessage);

  // Save state after successful message exchange
const thread = await threadManager.getThread(threadId);
const threadIds = await threadManager.listThreads();
const threads = await Promise.all(
  threadIds.map(async (id) => ({
    id,
    description: threadManager.getThreadDescription(id)
  }))
);
saveGlobalChatState(threadId, thread.messages || [], threads);

  
  this.webviewView.webview.postMessage({ command: 'streamEnd' });
};

  if (model === 'gemini') {
      await askGemini(fullConversation, onChunk, onEnd);
    } else {
      await askGemma(fullConversation, onChunk, onEnd);
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
    if (model === 'gemini') {
  return (await require('./geminiWrapper')(prompt)).split(/\n|\./)[0].trim();
}  else {
  return (await require('./gemmaWrapper')(prompt)).split(/\n|\./)[0].trim();
}

  } catch (e) {
    console.error('[Moo_LLM] Error generating thread name:', e);
    return 'New AI Thread';
  }
}

function deactivate() {
  console.log('[Moo_LLM] Extension deactivated');
}

module.exports = { activate, deactivate };
