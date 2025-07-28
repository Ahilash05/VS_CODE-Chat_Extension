// codeLensProvider.js
const vscode = require('vscode');

class CodeLensProvider {
  provideCodeLenses(document, token) {
    const lenses = [];

    
    const firstLine = new vscode.Range(0, 0, 0, 0);

    lenses.push(new vscode.CodeLens(firstLine, {
      title: '🔧 Fix errors in file',
      tooltip: 'Ask the LLM to fix errors in the current file',
      command: 'moollm.fixErrors'
    }));

    return lenses;
  }
}

module.exports = CodeLensProvider;
