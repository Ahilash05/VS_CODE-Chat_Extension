// searchInFaiss.cjs
const fs = require('fs');
const readline = require('readline');
const faiss = require('faiss-node');
const { pipeline, env } = require('@xenova/transformers');

// Config
const INDEX_FILE = 'faiss.index';
const MAP_FILE = 'token_index_map.json';
const TOP_K = 3;

//  Set local model path
env.localModelPath = 'D:\\vs_code_extension\\VS_CODE-Chat_Extension\\Indexing\\models';


// Load token metadata map
const tokenMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

// Setup readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Normalize vector to unit length
function normalizeVector(vec) {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
  return vec.map(x => x / norm);
}

async function main() {
  const query = process.argv[2] || await new Promise(resolve => {
    rl.question('🔍 Enter your query: ', resolve);
  });
  
  rl.close();
  
  // Load local E5 model
  const extractor = await pipeline('feature-extraction', 'intfloat/e5-small-v2', {
    localFilesOnly: true,
    quantized: false,
  });

  const formattedQuery = `query: ${query}`;
  const output = await extractor(formattedQuery, {
    pooling: 'mean',
    normalize: true,
  });

  // Normalize manually for cosine similarity
  const rawVector = Array.from(output.data);
  const queryVector = Array.from(output.data);

  // Load FAISS index
  const index = faiss.IndexFlatL2.read(INDEX_FILE);
  
  // Dynamic TOP_K based on available data (MOVED HERE)
  const totalVectors = index.ntotal();
  const dynamicTopK = Math.min(TOP_K, totalVectors);
  
  console.log(`Found ${totalVectors} indexed functions. Searching for top ${dynamicTopK} matches.`);

  // Search top K
  const results = index.search(queryVector, dynamicTopK);

  // Display results
  console.log('\n🔎 Top matches:');
  for (let i = 0; i < Math.min(dynamicTopK, results.labels.length); i++) {
    const idx = results.labels[i];
    const similarity = results.distances[i].toFixed(4);
    const tokenInfo = tokenMap[idx];
    const originalToken = tokenMap[idx] ? JSON.parse(fs.readFileSync('parsed_tokens.json', 'utf8'))[idx] : null;
    const { token: name, language, file } = tokenInfo;
    const code = originalToken ? originalToken.snippet : 'Code not available';

    console.log(`\n[${i + 1}] (score: ${similarity}) ${name} (${language} - ${file})\n${code}`);
  }
}

main();
