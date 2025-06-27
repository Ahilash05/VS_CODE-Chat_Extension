const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const toolHandlers = require('./toolHandlers');

// Load system prompt
const systemPrompt = require('./systemPrompt');

// Load tool definitions
const toolDefinitions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'toolDefinitions.json'), 'utf-8')
);

// Configuration
const MODEL_NAME = process.env.GEMMA_MODEL || 'gemma:2b';
const OLLAMA_PATH = process.env.OLLAMA_PATH || 'ollama';

/**
 * Process the Gemma response to extract and handle tool calls
 * @param {string} response - The raw response from Gemma
 * @returns {Promise<string>} - The processed response
 */
async function processResponse(response) {
  const toolCallMatch = response.match(/\[TOOL_CALL:([\s\S]*?)\]/);

  if (toolCallMatch) {
    try {
      const toolCall = JSON.parse(toolCallMatch[1]);
      const toolFn = toolHandlers[toolCall.name];

      if (typeof toolFn === 'function') {
        const result = await toolFn(toolCall.parameters || {});
        return response.replace(toolCallMatch[0], result);
      }

      console.log('[Moo_LLM] Tool not found, fetching from Ollama fallback');
      return await fetchFromOllama(response.replace(toolCallMatch[0], ''));
    } catch (error) {
      console.error('[Moo_LLM] Error processing tool call:', error);
      return await fetchFromOllama(response.replace(toolCallMatch[0], ''));
    }
  }

  return response;
}

/**
 * Send a request to the local Gemma model via Ollama with streaming.
 * @param {string} userInput - The user's input message
 * @param {(chunk: string) => void} onChunk - Called for each output chunk
 * @param {(final: string) => void} onEnd - Called when output ends
 */
async function askGemma(userInput, onChunk, onEnd) {
  const cleanInput = userInput.replace(/\[TOOL_CALL:[^\]]*\]/g, '').trim();
  const prompt = `${systemPrompt}\n\nUser message: ${cleanInput}`;

  const child = spawn(OLLAMA_PATH, ['run', MODEL_NAME], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let fullOutput = '';
  let buffer = '';
  let errorOutput = '';
  let isStreaming = false;

  console.log(`[Moo_LLM] Running Gemma model: ${MODEL_NAME}`);

  // Stream characters one by one from buffer
  const streamChars = () => {
    if (isStreaming || buffer.length === 0) return;
    isStreaming = true;

    const chars = buffer.split('');
    buffer = ''; // clear buffer so new data can accumulate

    let index = 0;
    const interval = setInterval(() => {
      if (index >= chars.length) {
        clearInterval(interval);
        isStreaming = false;
        streamChars(); // check for new buffered data
        return;
      }
      const char = chars[index++];
      fullOutput += char;
      if (onChunk) onChunk(char);
    }, 5); // control character speed here (ms)
  };

  child.stdout.on('data', (data) => {
    buffer += data.toString();
    streamChars(); // trigger character output
  });

  child.stderr.on('data', (data) => {
    errorOutput += data.toString();
    console.error(`[Moo_LLM] Gemma stderr: ${data.toString()}`);
  });

  child.on('error', (err) => {
    console.error('[Moo_LLM] Failed to start Ollama:', err);
  });

  child.on('close', () => {
    const waitUntilDone = () => {
      if (isStreaming || buffer.length > 0) {
        setTimeout(waitUntilDone, 10);
      } else {
        processResponse(fullOutput.trim()).then(onEnd);
      }
    };
    waitUntilDone();
  });

  child.stdin.write(prompt);
  child.stdin.end();
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
