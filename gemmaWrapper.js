const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load system prompt
const systemPrompt = require('./systemPrompt');

// Configuration
const MODEL_NAME = process.env.GEMMA_MODEL || 'gemma:2b';
const OLLAMA_PATH = process.env.OLLAMA_PATH || 'ollama';

/**
 * Format conversation history for Gemma model
 * @param {Array} messages - Array of message objects with type, content, etc.
 * @returns {string} - Formatted conversation string
 */
function formatConversationHistory(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  const conversationParts = messages.map(msg => {
    if (msg.type === 'user') {
      return `Human: ${msg.content}`;
    } else if (msg.type === 'assistant') {
      return `Assistant: ${msg.content}`;
    }
    return '';
  }).filter(part => part.length > 0);

  return conversationParts.join('\n\n');
}

/**
 * Send a request to the local Gemma model via Ollama with streaming.
 * @param {string|Array} input - Either a string (legacy) or array of message objects
 * @param {(chunk: string) => void} onChunk - Called for each output chunk
 * @param {(final: string) => void} onEnd - Called when output ends
 */
async function askGemma(input, onChunk, onEnd) {
  return new Promise((resolve, reject) => {
    const OLLAMA_PATH = process.env.OLLAMA_PATH || 'ollama';
    const MODEL_NAME = process.env.GEMMA_MODEL || 'gemma:2b';

    let prompt;
    
    // Handle both legacy string input and new conversation history array
    if (typeof input === 'string') {
      // Legacy single message format
      const cleanInput = input.replace(/\[TOOL_CALL:[^\]]*\]/g, '').trim();
      prompt = `${systemPrompt}\n\nUser message: ${cleanInput}`;
    } else if (Array.isArray(input)) {
      // New conversation history format
      const conversationHistory = formatConversationHistory(input);
      prompt = `${systemPrompt}\n\nConversation History:\n${conversationHistory}\n\nPlease respond to the latest message in the conversation above.`;
    } else {
      reject(new Error('Invalid input format: expected string or array'));
      return;
    }

    const child = spawn(OLLAMA_PATH, ['run', MODEL_NAME], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let fullOutput = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      fullOutput += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[Gemma stderr]: ${data.toString()}`);
    });

    child.on('error', (err) => {
      console.error('[Gemma Error]:', err);
      reject(err);
    });

    child.on('close', () => {
      const final = fullOutput.trim();
      
      const hasToolCall = final.includes('[TOOL_CALL:');
      
      if (hasToolCall) {
        if (onEnd) onEnd(final);
      } else {
        const chars = final.split('');
        let index = 0;
        
        const streamInterval = setInterval(() => {
          if (index >= chars.length) {
            clearInterval(streamInterval);
            if (onEnd) onEnd(final);
            return;
          }
          
          const char = chars[index++];
          if (onChunk) onChunk(char);
        }, 5);
      }
      
      resolve(final);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Check if Ollama and the model are installed.
 * @returns {Promise<boolean>}
 */
async function checkOllamaAndModel() {
  return new Promise((resolve) => {
    const child = spawn(OLLAMA_PATH, ['list'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('error', () => {
      console.error('[Moo_LLM] Ollama not found or not installed');
      resolve(false);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Moo_LLM] Ollama list command failed with code ${code}`);
        resolve(false);
        return;
      }

      const modelName = MODEL_NAME.split(':')[0];
      const hasModel = output.includes(modelName);

      if (!hasModel) {
        console.warn(`[Moo_LLM] Model "${MODEL_NAME}" not found`);
      }

      resolve(hasModel);
    });
  });
}

/**
 * Basic fallback (non-streaming) prompt execution.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function fetchFromOllama(prompt) {
  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';

    const child = spawn(OLLAMA_PATH, ['run', MODEL_NAME], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('error', (err) => {
      reject(`Failed to start Ollama: ${err.message}`);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(`Ollama process exited with code ${code}: ${errorOutput}`);
        return;
      }

      if (!output.trim()) {
        reject('Ollama returned empty response');
        return;
      }

      resolve(output.trim());
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

module.exports = askGemma;