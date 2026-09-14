const fs = require('fs');
const path = require('path');
const { STORE_CONFIG, CATEGORIES, PRODUCTS } = require('./products.js');

const granelDir = './assets/granel';

// 1. Corrigir extensões duplicadas .png.png para .png
const allFiles = fs.readdirSync(granelDir);
allFiles.forEach(file => {
    if (file.endsWith('.png.png')) {
        const newName = file.replace(/\.png\.png$/, '.png');
        const oldPath = path.join(granelDir, file);
        const newPath = path.join(granelDir, newName);
        if (fs.existsSync(newPath)) {
            fs.unlinkSync(oldPath);
        } else {
            fs.renameSync(oldPath, newPath);
        }
        console.log(`Renomeado: ${file} -> ${newName}`);
    }
});

// 2. Ler arquivos válidos
const files = fs.readdirSync(granelDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
console.log(`Total de imagens encontradas: ${files.length}`);

const granelProducts = [];
let count = 0;

files.forEach(file => {
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);

    // Formato: Nome - Peso - PrecoKg - PrecoTotal
    const parts = baseName.split('-').map(p => p.trim());
    if (parts.length < 3) {
        console.log(`Pulando arquivo fora do padrão: ${file}`);
        return;
    }

    count++;
    let rawName = parts[0];
    let weightStr = parts[1];
    let priceKgStr = parts.length >= 4 ? parts[2] : '';
    let totalPriceStr = parts.length >= 4 ? parts[3] : parts[2];

    // Limpar valores
    const price = parseFloat(totalPriceStr.replace('R$', '').replace(',', '.').trim()) || 0;
    const cleanWeight = weightStr.replace(/kg/i, '').trim().replace('.', ',');
    const cleanPriceKg = priceKgStr ? priceKgStr.replace(/kg/i, '').replace('R$', '').trim().replace('.', ',') : '';

    // Formatar Nome
    rawName = rawName.replace(/^Racao\b/i, 'RAÇÃO').replace(/\bRacao\b/gi, 'RAÇÃO');
    rawName = rawName.toUpperCase();

    // Determinar Subcategoria
    let subcategory = 'Cães';
    const upper = rawName;
    if (
        upper.includes('PASSARO') || 
        upper.includes('PÁSSARO') || 
        upper.includes('GIRASSOL') || 
        upper.includes('CANARIO') || 
        upper.includes('CANÁRIO') || 
        upper.includes('CALOPSITA') || 
        upper.includes('CATURRITA') || 
        upper.includes('CANJICA') ||
        upper.includes('MILHO') ||
        upper.includes('KICANTO') ||
        upper.includes('BICOFINO')
    ) {
        subcategory = 'Pássaros & Agro';
    } else if (
        upper.includes('GATO') || 
        upper.includes('CAT') || 
        upper.includes('FELINO') || 
        upper.includes('WHISKAS') || 
        upper.includes('PRIMOGATO') || 
        upper.includes('MIMOS') || 
        upper.includes('KIARA')
    ) {
        subcategory = 'Gatos';
    }

    const subInfo = cleanPriceKg ? `Embalagem Pesada e Selada (R$ ${cleanPriceKg}/kg)` : 'Embalagem Pesada e Selada';
    const code = `GRA${String(count).padStart(2, '0')}`;

    granelProducts.push({
        id: `granel_real_${count}`,
        code: code,
        name: rawName,
        category: 'granel',
        subcategory: subcategory,
        price: price,
        unit: `pct (${cleanWeight} kg)`,
        featured: true,
        badge: `Pacote ${cleanWeight} kg`,
        image: `assets/granel/${file.replace(/\.png\.png$/, '.png')}`,
        extraInfo: subInfo
    });
});

console.log(`Total de produtos a granel cadastrados: ${granelProducts.length}`);

// Remover granel antigos de exemplo e placeholders sem preço
const nonGranelProducts = PRODUCTS.filter(p => p.category !== 'granel' && p.price > 0 && !p.id.toString().startsWith('granel_'));

// Novos granel no topo
const updatedProducts = [...granelProducts, ...nonGranelProducts];

const output = `// Banco de Dados de Produtos - Agro Salinas
// Total de produtos: ${updatedProducts.length}

const STORE_CONFIG = ${JSON.stringify(STORE_CONFIG, null, 4)};

const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 4)};

const PRODUCTS = ${JSON.stringify(updatedProducts, null, 4)};

if (typeof module !== 'undefined') {
    module.exports = { STORE_CONFIG, CATEGORIES, PRODUCTS };
}
`;

fs.writeFileSync('./products.js', output, 'utf8');
console.log(`products.js atualizado com sucesso com ${updatedProducts.length} produtos!`);
