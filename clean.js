const fs = require('fs');
const { STORE_CONFIG, CATEGORIES, PRODUCTS } = require('./products.js');

const seen = new Set();
const unique = [];

PRODUCTS.forEach(p => {
    // Se a imagem for externa e quebrada, removemos
    if (p.image && !p.image.startsWith('assets/')) {
        delete p.image;
    }
    const key = (p.code || '') + '_' + p.name;
    if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
    }
});

console.log('Total produtos unicos:', unique.length);

const output = `// Banco de Dados de Produtos - Agro Salinas
// Total de itens: ${unique.length}

const STORE_CONFIG = ${JSON.stringify(STORE_CONFIG, null, 4)};

const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 4)};

const PRODUCTS = ${JSON.stringify(unique, null, 4)};

if (typeof module !== 'undefined') {
    module.exports = { STORE_CONFIG, CATEGORIES, PRODUCTS };
}
`;

fs.writeFileSync('./products.js', output, 'utf8');
console.log('products.js atualizado com sucesso!');
