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

module.exports = {
  Greeting: ({ name }) => {
    return `Greetings ${name}!,What can I do for you?`;
  },

  GetModuleVersion: ({ moduleName }) => {
    try {
      if (moduleName.toLowerCase() === 'node' || moduleName.toLowerCase() === 'nodejs') {
        return `Node.js ${process.version}`;
      }
      if (moduleName.toLowerCase() === 'javascript' || moduleName.toLowerCase() === 'js') {
        return `JavaScript (V8) ${process.versions.v8}`;
      }
      if (moduleName.toLowerCase() === 'python') {
        try {
          return execSync('python --version').toString().trim();
        } catch (e) {
          try {
            return execSync('python3 --version').toString().trim();
          } catch (e2) {
            return 'Python is not installed';
          }
        }
      }

      const packageJsonPath = path.resolve(process.cwd(), 'node_modules', moduleName, 'package.json');
      const packageJson = require(packageJsonPath);
      return `${moduleName} ${packageJson.version}`;
    } catch (npmError) {
      try {
        return execSync(`${moduleName} --version`).toString().trim();
      } catch (cmdError) {
        return `Could not determine version of ${moduleName}`;
      }
    }
  },

  GetNodeVersion: () => {
    try {
      return `Node.js ${process.version}`;
    } catch (error) {
      return 'Node.js version not available';
    }
  },

  GetPythonVersion: () => {
    try {
      return execSync('python --version').toString().trim();
    } catch (e) {
      try {
        return execSync('python3 --version').toString().trim();
      } catch {
        return 'Python is not installed';
      }
    }
  },

  GetJavaScriptVersion: () => {
    try {
      return `JavaScript (V8) ${process.versions.v8}`;
    } catch {
      return 'JavaScript version not available';
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
  }
};