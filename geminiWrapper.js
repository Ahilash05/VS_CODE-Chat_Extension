const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const toolHandlers = require('./toolHandlers');

const systemPrompt = require('./systemPrompt');

const toolDefinitions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'toolDefinitions.json'), 'utf-8')
);

const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCCFvhpGUomcClNhdzr_hhEVVgm2ok1vsk';
const MODEL_NAME = 'gemini-2.5-flash';

function initGeminiClient() {
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    return genAI.getGenerativeModel({ model: MODEL_NAME });
  } catch (error) {
    console.error('[Moo_LLM] Error initializing Gemini client:', error);
    throw new Error(`Failed to initialize Gemini client: ${error.message}`);
  }
}

async function processResponse(response) {
  const toolCallMatch = response.match(/\[TOOL_CALL:([\s\S]*?)\]/);

  if (toolCallMatch) {
    try {
      const toolCall = JSON.parse(toolCallMatch[1]);
      const toolFn = toolHandlers[toolCall.name];

      if (typeof toolFn === 'function') {
        return await toolFn(toolCall.parameters || {});
      }

      return `Tool "${toolCall.name}" not found.`;
    } catch (error) {
      console.error('[Moo_LLM] Error processing tool call:', error);
      return `Error processing tool call: ${error.message}`;
    }
  }

  return response;
}

/**
 * Send a request to the Gemini API with simulated character streaming.
 * @param {string} userInput - The user's input message
 * @param {(chunk: string) => void} onChunk - Called for each character
 * @param {(final: string) => void} onEnd - Called once after the stream ends
 */
async function askGemini(userInput, onChunk, onEnd) {
  try {
    const model = initGeminiClient();
    const prompt = `${systemPrompt}\n\nUser message: ${userInput}`;

    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    });

    let fullResponse = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        const chars = text.split('');
        for (const char of chars) {
          await new Promise(r => setTimeout(r, 5)); // typing speed per character
          fullResponse += char;
          if (onChunk) onChunk(char);
        }
      }
    }

    const processed = await processResponse(fullResponse);
    if (onEnd) onEnd(processed);
  } catch (error) {
    console.error('[Moo_LLM] Error calling Gemini API (stream):', error);
    throw new Error(`Error calling Gemini API: ${error.message}`);
  }
}

module.exports = askGemini;
