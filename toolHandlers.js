const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const askModel = require('./geminiWrapper'); // or use './gemmaWrapper'
const Diff = require('diff');

// Precise line-by-line comparison to find only actually changed lines
function getActualChangedLines(originalText, fixedText) {
  const originalLines = originalText.split('\n');
  const fixedLines = fixedText.split('\n');
  const changedLines = [];
  
  console.log('=== DEBUGGING LINE COMPARISON ===');
  console.log('Original lines count:', originalLines.length);
  console.log('Fixed lines count:', fixedLines.length);
  
  // Compare each line directly
  const maxLines = Math.max(originalLines.length, fixedLines.length);
  
  for (let i = 0; i < maxLines; i++) {
    const originalLine = i < originalLines.length ? originalLines[i] : '';
    const fixedLine = i < fixedLines.length ? fixedLines[i] : '';
    
    // Normalize whitespace for comparison but keep original for highlighting
    const originalTrimmed = originalLine.trim();
    const fixedTrimmed = fixedLine.trim();
    
    // Only mark as changed if:
    // 1. Line content is actually different (ignoring pure whitespace changes)
    // 2. Line was added (original doesn't exist but fixed does)
    // 3. Line was substantively modified
    if (originalTrimmed !== fixedTrimmed && fixedLine !== '') {
      changedLines.push(i);
      console.log(`Line ${i} CHANGED:`);
      console.log(`  Original: "${originalLine}"`);
      console.log(`  Fixed:    "${fixedLine}"`);
    }
  }
  
  console.log('Final changed lines:', changedLines);
  console.log('=== END DEBUGGING ===');
  
  return changedLines;
}

// Fallback: Use structured diff but with better logic
function getChangedLinesWithStructuredDiff(originalText, fixedText) {
  const changes = Diff.diffLines(originalText, fixedText, { ignoreWhitespace: false });
  const changedLines = [];
  let currentLineIndex = 0;
  
  console.log('Structured diff analysis:');
  
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = change.value.split('\n');
    
    // Remove empty trailing line if it exists
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    console.log(`Change ${i}:`, {
      added: change.added,
      removed: change.removed,
      lineCount: lines.length,
      startIndex: currentLineIndex
    });
    
    if (change.added) {
      // These are new/modified lines in the fixed version
      for (let j = 0; j < lines.length; j++) {
        changedLines.push(currentLineIndex + j);
      }
      currentLineIndex += lines.length;
    } else if (change.removed) {
      // These lines were removed, don't increment counter
      // (they don't exist in the new file)
      continue;
    } else {
      // Unchanged lines
      currentLineIndex += lines.length;
    }
  }
  
  console.log('Structured diff changed lines:', changedLines);
  return changedLines;
}


// Helper function to extract code snippets from search results
function extractCodeSnippets(searchResult) {
  const snippets = [];
  
  console.log('=== DEBUGGING SEARCH RESULT EXTRACTION ===');
  console.log('Raw search result:', searchResult);
  
  // Match pattern: [1] (score: 0.1234) functionName (Language - filepath)
  const resultPattern = /\[(\d+)\]\s*\(score:\s*([\d.]+)\)\s*(.+?)\s*\((.+?)\s*-\s*(.+?)\)\s*\n([\s\S]*?)(?=\n\[|$)/g;
  
  let match;
  while ((match = resultPattern.exec(searchResult)) !== null) {
    const [, resultNum, score, name, language, file, code] = match;
    
    console.log(`Found result ${resultNum}:`, {
      name: name.trim(),
      language: language.trim(),
      file: file.trim(),
      codeLength: code.trim().length
    });
    
    snippets.push({
      name: name.trim(),
      language: language.trim(),
      file: file.trim(),
      code: code.trim(),
      score: parseFloat(score)
    });
  }
  
  // Fallback: if regex doesn't work, try manual parsing
  if (snippets.length === 0) {
    console.log('Regex failed, trying manual parsing...');
    
    // Split by result markers like [1], [2], [3]
    const parts = searchResult.split(/\n\[(\d+)\]/);
    
    for (let i = 1; i < parts.length; i += 2) {
      const resultNum = parts[i];
      const content = parts[i + 1];
      
      if (!content) continue;
      
      // Look for the pattern: (score: X.XXXX) Name (Language - File)
      const headerMatch = content.match(/\(score:\s*([\d.]+)\)\s*(.+?)\s*\((.+?)\s*-\s*(.+?)\)/);
      
      if (headerMatch) {
        const [, score, name, language, file] = headerMatch;
        
        // Extract code after the header line
        const lines = content.split('\n');
        let codeLines = [];
        let foundHeader = false;
        
        for (const line of lines) {
          if (line.includes('(score:') && line.includes(name)) {
            foundHeader = true;
            continue;
          }
          if (foundHeader && line.trim()) {
            codeLines.push(line);
          }
        }
        
        const code = codeLines.join('\n').trim();
        
        if (code) {
          console.log(`Manual parsing found result ${resultNum}:`, {
            name: name.trim(),
            language: language.trim(),
            file: file.trim(),
            codeLength: code.length
          });
          
          snippets.push({
            name: name.trim(),
            language: language.trim(),
            file: file.trim(),
            code: code,
            score: parseFloat(score)
          });
        }
      }
    }
  }
  
  console.log(`Total snippets extracted: ${snippets.length}`);
  console.log('=== END DEBUGGING ===');
  
  return snippets;
}

module.exports = {
  Greeting: ({ name }) => {
    return `Greetings ${name}!,What can I do for you?`;
  },

  GetVersionCommand: ({ command }) => {
    if (!command || typeof command !== 'string') {
      return 'Please provide a version command to run.';
    }
    try {
      let output = '';
      try {
        output = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch (e) {
        // Some commands only output to stderr
        output = e.stdout?.toString().trim() || e.stderr?.toString().trim() || e.message;
      }
      return output.split('\n')[0];
    } catch (err) {
      return `Error running command: ${err.message}`;
    }
  },

  GetOSInfo: () => {
    const platform = os.platform();
    if (platform === 'win32') return 'You are currently Running on Windows';
    if (platform === 'linux' && os.release().toLowerCase().includes('ubuntu')) return 'You are currently Running on Ubuntu';
    return `You are currently Running on ${platform}`;
  },

  FixErrorsInCurrentFile: async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 'No file is currently open in the editor.';

    const document = editor.document;
    const fileName = document.fileName;
    const originalText = document.getText();
    const lineCount = originalText.split('\n').length;

    // Improved, stricter prompt
    const prompt = `
You are an expert code fixer. The following file has ${lineCount} lines.
Your task:
- Fix ALL syntax and logic errors.
- Output the ENTIRE corrected file, line by line.
- DO NOT minify, collapse, or summarize. Each line in the input should correspond to a line in the output.
- DO NOT use ellipses (...), explanations, or markdown.
- If you cannot fix a line, copy it as-is.
- Output ONLY the code, nothing else.

Original code:
${originalText}
`;

    try {
        console.log('Sending prompt to AI model...');
        console.log('Original code length:', originalText.length);
        console.log('Original line count:', lineCount);
        
        const fixedCode = await askModel(prompt);
        
        console.log('Received response length:', fixedCode ? fixedCode.length : 0);
        console.log('Response preview:', fixedCode ? fixedCode.substring(0, 200) : 'null/empty');
        
        if (!fixedCode || typeof fixedCode !== 'string') {
            return 'Error: Model returned no response.';
        }

        let cleanedCode = fixedCode
            .replace(/^```[\w]*\n?/, '')  // Remove opening markdown
            .replace(/\n?```$/, '')       // Remove closing markdown
            .replace(/^Here's the corrected code:\s*/i, '') // Remove common AI prefixes
            .replace(/^The corrected code is:\s*/i, '')
            .replace(/^Corrected code:\s*/i, '')
            .replace(/^Fixed code:\s*/i, '')
            .trim();

        console.log('Cleaned code length:', cleanedCode.length);
        console.log('Cleaned code preview:', cleanedCode.substring(0, 200));
        
        const fixedLineCount = cleanedCode.split('\n').length;
        console.log(`Original lines: ${lineCount}, Fixed lines: ${fixedLineCount}`);
        
        // Check for truncation - if fixed code is significantly shorter, it's likely truncated
        if (fixedLineCount < lineCount * 0.8 || cleanedCode.length < originalText.length * 0.7) {
            console.error('Code appears to be truncated!');
            
            // Try a simpler prompt for truncation issues
            const retryPrompt = `
You are an expert code fixer. The original file had ${lineCount} lines, but your previous response had only ${fixedLineCount} lines.

You must return the COMPLETE corrected file, line by line, with the same number of lines as the input (or very close). DO NOT minify, collapse, summarize, or use ellipses (...). If you cannot fix a line, copy it as-is. Output ONLY the code, nothing else.

Original code:
${originalText}
`;
            
            console.log('Retrying with completion prompt...');
            const retryResponse = await askModel(retryPrompt);
            
            if (retryResponse && retryResponse.length > cleanedCode.length) {
                cleanedCode = retryResponse
                    .replace(/^```[\w]*\n?/, '')
                    .replace(/\n?```$/, '')
                    .trim();
                console.log('Retry successful, new length:', cleanedCode.length);
            } else {
                return `Warning: AI model is truncating the response. \nOriginal: ${lineCount} lines (${originalText.length} chars)\nReceived: ${fixedLineCount} lines (${cleanedCode.length} chars)\n\nYou may need to try again or check your AI model configuration.`;
            }
        }

        // Final validation
        if (cleanedCode.length < 20) {
            return 'Error: AI model returned insufficient code. Please try again.';
        }

        return {
            preview: cleanedCode,
            fileName: path.basename(fileName),
            originalText
        };
    } catch (err) {
        console.error('Error in FixErrorsInCurrentFile:', err);
        return `Error fixing file: ${err.message}`;
    }
  },

  ApplyFixedCodeToCurrentFile: async (fixedCode) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }

    try {
      const document = editor.document;
      const originalText = document.getText();
      
      
      let changedLineNumbers = getActualChangedLines(originalText, fixedCode);
      
     
      if (changedLineNumbers.length === 0) {
        changedLineNumbers = getChangedLinesWithStructuredDiff(originalText, fixedCode);
      }
      
      console.log('Final changed lines to highlight:', changedLineNumbers);
      
      
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
      );
      edit.replace(document.uri, fullRange, fixedCode);
      
      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        throw new Error('Failed to apply changes');
      }
      
      // Save the file
      await document.save();
      
      // Highlight only the changed lines
      if (changedLineNumbers.length > 0) {
        const fixedLines = fixedCode.split('\n');
        const decorationRanges = [];
        
        changedLineNumbers.forEach(lineNum => {
          // Make sure the line exists in the fixed code
          if (lineNum < fixedLines.length) {
            const range = new vscode.Range(
              new vscode.Position(lineNum, 0),
              new vscode.Position(lineNum, fixedLines[lineNum].length)
            );
            decorationRanges.push({ range });
          }
        });
        
        if (decorationRanges.length > 0) {
          // Create highlighting decoration
          const highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow background
            border: '1px solid #FFD700', // Gold border
            borderRadius: '2px',
            isWholeLine: true
          });
          
          // Apply highlighting
          editor.setDecorations(highlightDecoration, decorationRanges);
          
          // Remove highlighting after 8 seconds
          setTimeout(() => {
            highlightDecoration.dispose();
          }, 8000);
          
          console.log(`Highlighted ${decorationRanges.length} changed lines`); 
        }
      }
      
      vscode.window.showInformationMessage(
        ` Applied ${changedLineNumbers.length} line changes to ${path.basename(document.fileName)}`
      );
      
    } catch (error) {
      console.error('Error applying fix:', error);
      vscode.window.showErrorMessage(`Failed to apply changes: ${error.message}`);
    }
  },

CreateFile: async ({ filePath, content, useCurrentDirectory = false }) => {
    if (!filePath || content === undefined) {
        return 'Error: filePath and content are required';
    }

    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return 'Error: No workspace folder is open';
        }

        let targetPath;
        
        if (useCurrentDirectory) {
            // Get the directory of the currently active file
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const currentFileDir = path.dirname(activeEditor.document.uri.fsPath);
                targetPath = path.join(currentFileDir, filePath);
            } else {
                // Fallback to workspace root if no active editor
                targetPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
            }
        } else {
            // FIXED: Only create in the specified path, not both locations
            targetPath = path.resolve(workspaceFolder.uri.fsPath, filePath);
        }

        const uri = vscode.Uri.file(targetPath);

        // Create directory structure if it doesn't exist
        const dir = path.dirname(targetPath);
        if (!require('fs').existsSync(dir)) {
            require('fs').mkdirSync(dir, { recursive: true });
        }

        // Check if file already exists to prevent duplicates
        if (require('fs').existsSync(targetPath)) {
            return `Error: File already exists: ${path.basename(filePath)}`;
        }

        // Use VSCode's WorkspaceEdit API for file creation
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(uri, { ignoreIfExists: false, overwrite: false });
        edit.insert(uri, new vscode.Position(0, 0), content);

        const success = await vscode.workspace.applyEdit(edit);
        
        if (success) {
            // Auto-open the created file
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
            
            // Return ONLY the success message with filename
            return ` File created successfully: ${path.basename(filePath)}`;
        } else {
            throw new Error('Failed to apply workspace edit');
        }

    } catch (error) {
        return `Error creating file: ${error.message}`;
    }
},

EditFile: async ({ filePath, instructions }) => {
  const fs = require('fs');
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', filePath);

  if (!fs.existsSync(fullPath)) return `Error: File not found at ${fullPath}`;
  const uri = vscode.Uri.file(fullPath);

  const originalText = fs.readFileSync(fullPath, 'utf-8');
  const prompt = `
You are a code editing assistant. Please edit the following file according to these instructions:

Instructions:
${instructions}

Original file content:
${originalText}

Return ONLY the full edited content. Do not include explanations, comments, or markdown.
`;

  try {
    const editedCode = await askModel(prompt);

    const cleaned = editedCode
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .replace(/^Here's the.*?:\s*/i, '')
      .trim();

    // Compute changed lines
    const changedLines = getActualChangedLines(originalText, cleaned) || getChangedLinesWithStructuredDiff(originalText, cleaned);

    // Overwrite file
    fs.writeFileSync(fullPath, cleaned, 'utf-8');

    // Highlight if open
    const openEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === fullPath);
    if (openEditor && changedLines.length) {
      const fixedLines = cleaned.split('\n');
      const decorations = changedLines.map(line => ({
        range: new vscode.Range(
          new vscode.Position(line, 0),
          new vscode.Position(line, fixedLines[line]?.length || 1)
        )
      }));

      const highlightDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)',
        border: '1px solid #FFD700',
        isWholeLine: true
      });

      openEditor.setDecorations(highlightDecoration, decorations);
      setTimeout(() => highlightDecoration.dispose(), 8000);
    }

    return `File edited successfully: ${path.basename(filePath)} (${changedLines.length} lines changed)`;

  } catch (err) {
    return `Error editing file: ${err.message}`;
  }
},




IndexAndSearch: async ({ query, operation = "explain" }) => {
  const { execSync } = require('child_process');
  const vscode = require('vscode');
  const path = require('path');
  const IndexingDir = path.join(__dirname, 'Indexing');
  
  if (!query) return 'Please provide a search query.';
  
  // Get current workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return 'No workspace folder is open.';
  
  console.log('[IndexAndSearch] Indexing directory:', workspaceFolder);
  
  try {
    // 1. Parse files in current directory
    const indexScript = path.join(IndexingDir, 'index.cjs');
    execSync(`node "${indexScript}" "${workspaceFolder}"`, { cwd: IndexingDir, encoding: 'utf8' });
    
    // 2. Generate embeddings
    const genScript = path.join(IndexingDir, 'generateEmbedding.js');
    execSync(`node "${genScript}"`, { cwd: IndexingDir, encoding: 'utf8' });
    
    // 3. Store in Faiss
    const storeScript = path.join(IndexingDir, 'storeInFaiss.cjs');
    execSync(`node "${storeScript}"`, { cwd: IndexingDir, encoding: 'utf8' });
    
    // 4. Search and get raw results
    const searchScript = path.join(IndexingDir, 'searchInFaiss.cjs');
    const searchResult = execSync(`node "${searchScript}" "${query}"`, {
      cwd: IndexingDir,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });
    
    // 5. Extract code snippets from search results
    const codeSnippets = extractCodeSnippets(searchResult);
    
    if (codeSnippets.length === 0) {
      return `No matching code found for your query.\n\nRaw search result:\n${searchResult}`;
    }
    
    // 6. Create context-aware prompt based on operation type
    let prompt;
    
    switch (operation.toLowerCase()) {
      case 'refactor':
        prompt = `
You are a code refactoring expert. The user searched for: "${query}"

Here are the matching code snippets from their codebase:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}
Score: ${snippet.score}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please refactor these code snippets to improve:
- Code readability and maintainability
- Performance where applicable
- Following best practices for ${codeSnippets[0]?.language || 'the language'}
- Removing code duplication if any

Provide the refactored code with explanations of what was improved.
`;
        break;
        
      case 'debug':
        prompt = `
You are a debugging expert. The user searched for: "${query}"

Here are the matching code snippets that may contain bugs:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please analyze these code snippets and:
1. Identify any potential bugs, errors, or issues
2. Explain what could go wrong
3. Provide corrected versions of the code
4. Suggest improvements for robustness

Focus on logic errors, potential runtime exceptions, and edge cases.
`;
        break;
        
      case 'optimize':
        prompt = `
You are a performance optimization expert. The user searched for: "${query}"

Here are the matching code snippets to optimize:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please optimize these code snippets for:
- Better time complexity
- Reduced memory usage
- Improved algorithms where applicable
- Language-specific optimizations

Provide optimized versions with performance analysis and explanations.
`;
        break;
        
      case 'test':
        prompt = `
You are a test writing expert. The user searched for: "${query}"

Here are the matching code snippets that need tests:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please create comprehensive unit tests for these functions including:
- Happy path test cases
- Edge cases and boundary conditions
- Error handling scenarios
- Mock data where needed

Use appropriate testing frameworks for ${codeSnippets[0]?.language || 'the language'}.
`;
        break;
        
      case 'document':
        prompt = `
You are a documentation expert. The user searched for: "${query}"

Here are the matching code snippets that need documentation:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please provide comprehensive documentation including:
- Function/method descriptions
- Parameter explanations
- Return value documentation
- Usage examples
- Any important notes or warnings

Use appropriate documentation format for ${codeSnippets[0]?.language || 'the language'}.
`;
        break;
        
      case 'convert':
        prompt = `
You are a code conversion expert. The user searched for: "${query}"

Here are the code snippets to work with:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please help convert or adapt these code snippets as requested. If no specific target is mentioned, provide equivalent implementations in popular languages or suggest modern alternatives.
`;
        break;
        
      default: // 'explain' or any other operation
        prompt = `
You are a code analysis expert. The user searched for: "${query}"

Here are the matching code snippets from their codebase:

${codeSnippets.map((snippet, index) => `
--- Code Snippet ${index + 1} ---
File: ${snippet.file}
Language: ${snippet.language}
Function: ${snippet.name}
Score: ${snippet.score}

\`\`\`${snippet.language.toLowerCase()}
${snippet.code}
\`\`\`
`).join('\n')}

Please provide a comprehensive analysis including:
1. What each function does
2. How they relate to the search query
3. Key algorithms or patterns used
4. Potential improvements or concerns
5. How these functions might work together

Be thorough in your explanation and provide actionable insights.
`;
    }

    const aiResponse = await askModel(prompt);
    return aiResponse || 'Unable to process the code snippets.';
    
  } catch (err) {
    return `Error during indexing and search: ${err.message}\n${err.stdout?.toString() || ''}`;
  }
}

};