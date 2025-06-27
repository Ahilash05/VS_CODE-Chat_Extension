const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

module.exports = {
  Greeting: ({ name }) => {
    return `Greetings ${name}!,What can I do for you?`;
  },

  GetModuleVersion: ({ moduleName }) => {
    try {
      // Handle special cases
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
      
      // For npm modules
      try {
        // Try to get version from package.json in node_modules
        const packageJsonPath = path.resolve(process.cwd(), 'node_modules', moduleName, 'package.json');
        const packageJson = require(packageJsonPath);
        return `${moduleName} ${packageJson.version}`;
      } catch (npmError) {
        // If not an npm module, try to get version using command line
        try {
          return execSync(`${moduleName} --version`).toString().trim();
        } catch (cmdError) {
          return `Could not determine version of ${moduleName}`;
        }
      }
    } catch (error) {
      return `Error checking version of ${moduleName}: ${error.message}`;
    }
  },
  
  // Keeping old functions for backward compatibility
  GetNodeVersion: () => {
    try {
      return `Node.js ${process.version}`;
    } catch (error) {
      return 'Node.js version not available';
    }
  },

  GetPythonVersion: () => {
    try {
      try {
        return execSync('python --version').toString().trim();
      } catch (e) {
        return execSync('python3 --version').toString().trim();
      }
    } catch (error) {
      return 'Python is not installed';
    }
  },

  GetJavaScriptVersion: () => {
    try {
      return `JavaScript (V8) ${process.versions.v8}`;
    } catch (error) {
      return 'JavaScript version not available';
    }
  },

  GetOSInfo: () => {
    const platform = os.platform();
    const isWindows = platform === 'win32';
    const isUbuntu = platform === 'linux' && os.release().toLowerCase().includes('ubuntu');
    
    if (isWindows) {
      return 'Running on Windows';
    } else if (isUbuntu) {
      return 'Running on Ubuntu';
    } else {
      return `Running on ${platform}`;
    }
  },

 FixErrorsInCurrentFile: async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return ' No file is currently open in the editor.';

  const document = editor.document;
  const fileName = document.fileName;
  const originalText = document.getText();

  // Choose your model wrapper
  const askModel = require('./gemmaWrapper'); // or './geminiWrapper'

  const prompt = `
You are an industry level development code expert. The following file contains syntax or logical errors. Fix all errors and return ONLY the corrected version of the entire file. Do not include explanations, comments, or markdown formatting.

--- START CODE ---
${originalText}
--- END CODE ---
`;

  try {
    const fixedCode = await askModel(prompt);

    // Replace the full document
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(originalText.length)
    );
    edit.replace(document.uri, fullRange, fixedCode);
    await vscode.workspace.applyEdit(edit);
    await document.save();

    return ` Fixed errors in: **${fileName}**\n\n\`\`\`c\n${fixedCode.trim()}\n\`\`\``;
  } catch (err) {
    return ` Error fixing file: ${err.message}`;
  }
}


};
