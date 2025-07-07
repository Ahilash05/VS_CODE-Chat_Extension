const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const systemPrompt = require('./systemPrompt');

const API_KEY = process.env.GEMINI_API_KEY ||' AIzaSyDXhEFn3udY4fabwPWe7kbdegqDphnhn7s';
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

/**
 * Format conversation history for Gemini model
 * @param {Array} messages - Array of message objects with type, content, etc.
 * @returns {Array} - Formatted conversation for Gemini API
 */
function formatConversationForGemini(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const contents = [];
  
  // Add system prompt as first message
  contents.push({
    role: 'user',
    parts: [{ text: systemPrompt }]
  });
  
  contents.push({
    role: 'model',
    parts: [{ text: 'I understand. I will follow these instructions and help you with your coding tasks.' }]
  });

  // Add conversation history
  messages.forEach(msg => {
    if (msg.type === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.type === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }]
      });
    }
  });

  return contents;
}

/**
 * Send a request to the Gemini API with simulated character streaming.
 * @param {string|Array} input - Either a string (legacy) or array of message objects
 * @param {(chunk: string) => void} onChunk - Called for each character
 * @param {(final: string) => void} onEnd - Called once after the stream ends
 */
async function askGemini(input, onChunk, onEnd) {
  return new Promise(async (resolve, reject) => {
    try {
      const model = initGeminiClient();
      
      let contents;
      
      // Handle both legacy string input and new conversation history array
      if (typeof input === 'string') {
        // Legacy single message format
        const isToolCall = input.includes('--- START CODE ---') && input.includes('--- END CODE ---');
        const prompt = isToolCall ? input : `${systemPrompt}\n\nUser message: ${input}`;
        
        contents = [{ role: 'user', parts: [{ text: prompt }] }];
      } else if (Array.isArray(input)) {
        // New conversation history format
        contents = formatConversationForGemini(input);
      } else {
        reject(new Error('Invalid input format: expected string or array'));
        return;
      }

      const result = await model.generateContentStream({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
      });

      let fullResponse = '';

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullResponse += text;
        }
      }

      const hasToolCall = fullResponse.includes('[TOOL_CALL:');
      
      if (hasToolCall) {
        if (onEnd) onEnd(fullResponse);
      } else {
        const chars = fullResponse.split('');
        for (const char of chars) {
          await new Promise(r => setTimeout(r, 5));
          if (onChunk) onChunk(char);
        }
        if (onEnd) onEnd(fullResponse);
      }

      resolve(fullResponse);

    } catch (error) {
      console.error('[Moo_LLM] Error calling Gemini API (stream):', error);
      reject(new Error(`Error calling Gemini API: ${error.message}`));
    }
  });
}

module.exports = askGemini;