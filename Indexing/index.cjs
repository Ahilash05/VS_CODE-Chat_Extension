const Parser = require('tree-sitter');
const fs = require('fs');
const path = require('path');


const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const C = require('tree-sitter-c');
const CSharp = require('tree-sitter-c-sharp');
const JavaScript = require('tree-sitter-javascript');


const languages = {
  '.py': { name: 'Python', module: Python },
  '.java': { name: 'Java', module: Java },
  '.c': { name: 'C', module: C },
  '.cs': { name: 'C#', module: CSharp },
  '.js': { name: 'JavaScript', module: JavaScript },
};

// Helper to recursively get all files with supported extensions in a directory
function getAllSupportedFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllSupportedFiles(filePath));
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (languages[ext]) {
        results.push(filePath);
      }
    }
  });
  return results;
}

// Get directory from command line or default to current directory
const targetDir = process.argv[2] || '.';
let files = [];
try {
  files = getAllSupportedFiles(targetDir);
  if (files.length === 0) {
    console.error(`No supported files found in directory: ${targetDir}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Error reading directory: ${targetDir}`, err.message);
  process.exit(1);
}

const parsedTokenObjects = [];

files.forEach((filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const langMeta = languages[ext];

  if (!langMeta) {
    console.error(` Unsupported file extension: ${ext}`);
    return;
  }

  try {
    const parser = new Parser();
    parser.setLanguage(langMeta.module);

    const code = fs.readFileSync(filePath, 'utf8');
    const tree = parser.parse(code);
    const root = tree.rootNode;

    const visit = (node) => {
      if (
        ['function_definition', 'function_declaration', 'method_definition', 'method_declaration', 'function'].includes(node.type)
      ) {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) return;

        parsedTokenObjects.push({
          token: nameNode.text,
          file: filePath,
          language: langMeta.name,
          snippet: code.slice(node.startIndex, node.endIndex),
        });
      }

      for (let i = 0; i < node.namedChildCount; i++) {
        visit(node.namedChild(i));
      }
    };

    visit(root);
    console.log(` Parsed ${filePath} (${langMeta.name})`);
  } catch (err) {
    console.error(` Error parsing ${filePath} (${langMeta.name}):`, err.message);
  }
});

fs.writeFileSync('parsed_tokens.json', JSON.stringify(parsedTokenObjects, null, 2));
console.log(`✅ Saved ${parsedTokenObjects.length} function tokens to parsed_tokens.json`);
