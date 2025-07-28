import fs from 'fs';
import { pipeline, env } from '@xenova/transformers';


env.localModelPath = 'D:\\Moo_LLM\\Indexing\\models';



const inputFile = 'parsed_tokens.json';
const outputVectorFile = 'embedding_vector_e5.json';
const mapFile = 'token_index_map.json';


let tokens;
try {
  tokens = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  console.log(` Loaded ${tokens.length} tokens from ${inputFile}`);
} catch (e) {
  console.error(` Failed to load ${inputFile}:`, e.message);
  process.exit(1);
}

// Load embedding model
let extractor;
try {
  extractor = await pipeline('feature-extraction', 'intfloat/e5-small-v2', {
    localFilesOnly: true,
    quantized: false,
  });
  console.log(' Local E5 model loaded. Generating embeddings...');
} catch (e) {
  console.error(' Failed to load local E5 model:', e.message);
  process.exit(1);
}

// Output vector and index mapping
const vectors = [];
const tokenIndexMap = {};

for (let i = 0; i < tokens.length; i++) {
  const item = tokens[i];
  const text = item?.snippet;

  if (typeof text !== 'string' || text.trim() === '') {
    console.warn(` Skipping empty or invalid snippet at index ${i}`, item);
    continue;
  }

  try {
    const formattedText = `passage: ${text}`;
    const output = await extractor(formattedText, {
      pooling: 'mean',
      normalize: true,
    });

    const vector = Array.from(output.data);

    if (!Array.isArray(vector) || vector.length === 0 || vector.some(v => typeof v !== 'number')) {
      console.warn(` Malformed vector at index ${i}, skipping.`);
      continue;
    }

    const index = vectors.length;
    vectors.push(vector);
    tokenIndexMap[index] = {
      token: item.token,
      file: item.file,
      language: item.language,
    };
  } catch (e) {
    console.warn(` Error embedding token at index ${i}:`, e.message);
  }
}

// Write vector and mapping files
fs.writeFileSync(outputVectorFile, JSON.stringify(vectors, null, 2));
fs.writeFileSync(mapFile, JSON.stringify(tokenIndexMap, null, 2));

console.log(` Saved ${vectors.length} vectors to ${outputVectorFile}`);
console.log(` Saved index-to-token map to ${mapFile}`);
console.log(` Embedding dimension: ${vectors[0]?.length ?? 'unknown'}`);
