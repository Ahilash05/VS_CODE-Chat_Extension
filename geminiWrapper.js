const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');




const systemPrompt = require('./systemPrompt');

const toolDefinitions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'toolDefinitions.json'), 'utf-8')
);

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
 * Send a request to the Gemini API with simulated character streaming.
 * @param {string} userInput - The user's input message
 * @param {(chunk: string) => void} onChunk - Called for each character
 * @param {(final: string) => void} onEnd - Called once after the stream ends
 */
async function askGemini(userInput, onChunk, onEnd) {
  return new Promise(async (resolve, reject) => {
    try {
      const model = initGeminiClient();
      const isToolCall = userInput.includes('--- START CODE ---') && userInput.includes('--- END CODE ---');
      const prompt = isToolCall ? userInput : `${systemPrompt}\n\nUser message: ${userInput}`;

      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

          // Stream only non-tool-call content
          if (!text.includes('[TOOL_CALL:')) {
            const chars = text.split('');
            for (const char of chars) {
              await new Promise(r => setTimeout(r, 5));
              if (onChunk) onChunk(char);
            }
          }
        }
      }

     
      if (onEnd) onEnd(fullResponse);
      resolve(fullResponse); 

    } catch (error) {
      console.error('[Moo_LLM] Error calling Gemini API (stream):', error);
      reject(new Error(`Error calling Gemini API: ${error.message}`));
    }
  });
}


module.exports = askGemini;
