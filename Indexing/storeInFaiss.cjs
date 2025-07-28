const fs = require('fs');
const { IndexFlatL2 } = require('faiss-node');

const VECTOR_FILE = 'embedding_vector_e5.json';
const INDEX_FILE = 'faiss.index';

function storeInFaiss() {
  try {
    const vectors = JSON.parse(fs.readFileSync(VECTOR_FILE, 'utf8'));

    if (!Array.isArray(vectors) || !Array.isArray(vectors[0])) {
      throw new Error('Expected a non-empty 2D array of vectors.');
    }

    const dimension = vectors[0].length;

    const flatData = [];
    for (const vec of vectors) {
      if (vec.length !== dimension) {
        throw new Error('Inconsistent vector dimension detected.');
      }
      flatData.push(...vec);
    }

    const index = new IndexFlatL2(dimension);
    index.add(flatData);
    index.write(INDEX_FILE);
    console.log("Vector has been succesfully stored in FaissDB");
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

storeInFaiss();
