

# VS\_CODE-Chat\_Extension

A Visual Studio Code extension that integrates AI-powered chat capabilities directly into your editor, enhancing your coding experience with intelligent assistance.


## Table of Contents

* [Introduction](#introduction)
* [Features](#features)
* [Installation](#installation)
* [Usage](#usage)
* [Configuration](#configuration)
* [Dependencies](#dependencies)
* [Examples](#examples)
* [Troubleshooting](#troubleshooting)
* [Contributors](#contributors)


## Introduction

The VS\_CODE-Chat\_Extension brings conversational AI directly into Visual Studio Code.
By leveraging models like **Gemini** and **Gemma**, it allows developers to interact with their codebase through natural language, facilitating tasks such as code generation, modification, explanation, and intelligent file-level operations.



## Features

* **AI-Powered Chat Interface**: Interact with AI to assist with development tasks inside VS Code.
* **Multi-Model Support**: Switch between AI models like Gemini and Gemma based on your requirements.
* **Tool-Driven Code Interaction**: Use AI toolCalls to modify code files directly via structured commands.
* **RAG-Based Contextual Indexing**: Retrieve relevant file context using a Retrieval-Augmented Generation (RAG) pipeline.
* **Version Fetching Capabilities**: Automatically fetch framework/library versions for up-to-date code assistance.
* **System Prompt Customization**: Tailor AI behavior using modifiable system prompts.
* **Session History**: Retain past interactions to maintain conversation flow and context.

## Installation

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/Ahilash05/VS_CODE-Chat_Extension.git
   ```

2. **Navigate to the Project Directory**:

   ```bash
   cd VS_CODE-Chat_Extension
   ```

3. **Install Dependencies**:

   ```bash
   npm install
   ```

4. **Launch in VS Code**:

   * Open the folder in Visual Studio Code.
   * Press `F5` to start a new Extension Development Host.


## Usage

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Search and select `Chat: Open Chat Interface`.
3. Type your queries or tasks. For example:

   * Ask for code explanations.
   * Request code snippets.
   * Modify code directly with toolCalls.


## Configuration

* **System Prompt**:
  Modify the `systemPrompt.js` file to change how the assistant behaves.

* **Model Configuration**:
  Customize how Gemini and Gemma are invoked via `geminiWrapper.js` and `gemmaWrapper.js`.

* **Extension Settings**:
  Adjust behaviors in the extension settings panel of VS Code if supported.


## Dependencies

* [Visual Studio Code](https://code.visualstudio.com/)
* [Node.js](https://nodejs.org/)
* Other dependencies as listed in `package.json`:

  * e.g., `@google/generative-ai`, file I/O libraries, and indexing tools.


## Examples

###  Code Generation

* *User*: “Generate a React login form with state handling.”
* *AI*: Provides a full component code snippet.

### Code Explanation

* *User*: “Explain what this reducer function does.”
* *AI*: Breaks down the logic and flow.

###  Code Modification via toolCalls

* *User*: “Rename all instances of `oldFunction` to `newFunction` in this file.”
* *AI*: Uses structured toolCalls to safely modify the file contents.

###  File Context Retrieval (RAG)

* When a user query references a function not in the current editor view, the system:

  * Uses a RAG-based approach to search through indexed project files.
  * Retrieves relevant snippets and context before crafting a response.

###  Version Fetching

* *User*: “Use the latest version of Express in this code.”
* *AI*: Automatically fetches the latest version of the package and updates the `package.json` or code accordingly.

---

## Troubleshooting

* **Extension Doesn’t Start**:

  * Ensure you ran `npm install` and opened the project properly.
  * Check output in Developer Tools (`Help > Toggle Developer Tools`).

* **No Response from Chat**:

  * Verify internet access and API credentials for models (if required).
  * Ensure correct model wrappers are configured.

* **Files Not Being Modified**:

  * Confirm file permissions in your workspace.
  * Check the toolCalls logic for errors or permission issues.

---

## Contributors

* [Ahilash05](https://github.com/Ahilash05)

---

Let me know if you’d like badges, GIFs, or VS Code Marketplace publishing instructions added as well!
