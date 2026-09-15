const fs = require('fs');
const path = require('path');

const projectDir = __dirname;

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);
  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const baseDir = path.join(projectDir, 'assets/produtos');
const allFiles = getAllFiles(baseDir);
const validExts = ['.jpg', '.jpeg', '.png', '.webp'];

const imageMap = new Map();

allFiles.forEach(f => {
  const ext = path.extname(f).toLowerCase();
  if (validExts.includes(ext)) {
    const code = path.basename(f, ext).trim();
    const relPath = path.relative(projectDir, f).replace(/\\/g, '/');
    imageMap.set(code, relPath);
  }
});

console.log(`Encontradas ${imageMap.size} fotos em assets/produtos:`);
for (const [code, p] of imageMap.entries()) {
  console.log(` - Código ${code} -> ${p}`);
}

const productsJsPath = path.join(projectDir, 'products.js');
const { STORE_CONFIG, CATEGORIES, PRODUCTS } = require(productsJsPath);

let updatedCount = 0;

PRODUCTS.forEach(prod => {
  const codeStr = (prod.code !== undefined && prod.code !== null) ? prod.code.toString().trim() : '';
  if (codeStr && imageMap.has(codeStr)) {
    prod.image = imageMap.get(codeStr);
    updatedCount++;
    console.log(`[VINCULADO] ${prod.code}: ${prod.name} => ${prod.image}`);
  }
});

console.log(`\nAtualizados ${updatedCount} produtos em products.js.`);

const outputContent = `// Banco de Dados de Produtos - Agro Salinas
// Total de itens: ${PRODUCTS.length}

const STORE_CONFIG = ${JSON.stringify(STORE_CONFIG, null, 4)};

const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 4)};

const PRODUCTS = ${JSON.stringify(PRODUCTS, null, 4)};

if (typeof module !== 'undefined') {
    module.exports = { STORE_CONFIG, CATEGORIES, PRODUCTS };
}
`;

fs.writeFileSync(productsJsPath, outputContent, 'utf8');
console.log('Arquivo products.js gravado com sucesso!');
