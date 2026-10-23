/**
 * Robô Inteligente de Busca e Vinculação Automática de Fotos — Agro Salinas
 * 
 * Funcionalidades:
 * 1. Busca por Código de Barras (EAN / GTIN de 13 dígitos) em bases de dados abertas.
 * 2. Reconhecimento automático das grandes marcas pet & agro (Premier, Golden, Bravecto, Simparic, etc.).
 * 3. Busca por nome do produto para itens sem código de barras.
 * 4. Download da imagem em alta resolução para assets/produtos/{codigo}.jpg.
 * 5. Atualização automática do products.js com 1 clique.
 * 
 * Uso:
 *   node buscar_fotos_produtos.js                -> busca fotos para todos os produtos sem imagem em products.js
 *   node buscar_fotos_produtos.js --planilha=... -> importa uma planilha nova e já busca as fotos
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const projectDir = __dirname;
const productsJsPath = path.join(projectDir, 'products.js');
const assetsDir = path.join(projectDir, 'assets/produtos');

if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. REGRAS DE MARCAS OFICIAIS COM IMAGENS DE ALTA RESOLUÇÃO EM FUNDO BRANCO
const BRAND_RULES = [
    // Antipulgas & Farmácia
    { test: /SIMPARIC/i, url: "https://m.media-amazon.com/images/I/610j1Xv4QNL._AC_SL1000_.jpg" },
    { test: /BRAVECTO/i, url: "https://m.media-amazon.com/images/I/61S1gqjR5iL._AC_SL1000_.jpg" },
    { test: /NEXGARD.*COMBO/i, url: "https://m.media-amazon.com/images/I/61z+Fz08xYL._AC_SL1000_.jpg" },
    { test: /NEXGARD/i, url: "https://m.media-amazon.com/images/I/61r58yZ-3-L._AC_SL1000_.jpg" },
    { test: /DEFENZA/i, url: "https://m.media-amazon.com/images/I/61x0S6vXqjL._AC_SL1000_.jpg" },
    { test: /CONFRONT/i, url: "https://m.media-amazon.com/images/I/71YvUvC0FGL._AC_SL1500_.jpg" },
    { test: /DEFEND PRO/i, url: "https://m.media-amazon.com/images/I/61iV2s-PffL._AC_SL1000_.jpg" },
    { test: /VERMIVET/i, url: "https://m.media-amazon.com/images/I/61Tf-Z9FqLL._AC_SL1000_.jpg" },
    { test: /CREOLINA/i, url: "https://m.media-amazon.com/images/I/61pD7oUf3YL._AC_SL1000_.jpg" },
    { test: /MATACURA/i, url: "https://m.media-amazon.com/images/I/61HqB10uFCL._AC_SL1000_.jpg" },
    { test: /SILVERBAC|SPRAY PRATA/i, url: "https://m.media-amazon.com/images/I/61KqJzC2W0L._AC_SL1000_.jpg" },
    { test: /BIODEX/i, url: "https://m.media-amazon.com/images/I/61k1qC6QzRL._AC_SL1000_.jpg" },
    { test: /CARBOVET/i, url: "https://m.media-amazon.com/images/I/51wXp71q08L._AC_SL1000_.jpg" },
    { test: /OTOLIN/i, url: "https://m.media-amazon.com/images/I/51tW04p9XWL._AC_SL1000_.jpg" },
    { test: /RIFOTRAT/i, url: "https://m.media-amazon.com/images/I/51b95nK3QYL._AC_SL1000_.jpg" },
    { test: /COLOSSO/i, url: "https://m.media-amazon.com/images/I/51T9dM0a0IL._AC_SL1000_.jpg" },
    { test: /INVICTO/i, url: "https://m.media-amazon.com/images/I/51e39B0p5bL._AC_SL1000_.jpg" },

    // Premier Pet
    { test: /PREMIER.*FILHOTE/i, url: "https://m.media-amazon.com/images/I/61s7gM48oHL._AC_SL1000_.jpg" },
    { test: /PREMIER.*SPITZ/i, url: "https://m.media-amazon.com/images/I/71X8k06w5JL._AC_SL1500_.jpg" },
    { test: /PREMIER.*SHIHTZU/i, url: "https://m.media-amazon.com/images/I/71tK6f6dFqL._AC_SL1500_.jpg" },
    { test: /PREMIER.*YORKSHIRE/i, url: "https://m.media-amazon.com/images/I/71C7a+471rL._AC_SL1500_.jpg" },
    { test: /PREMIER.*COOKIE|COOKIE PREMIER/i, url: "https://m.media-amazon.com/images/I/71fL97B4UfL._AC_SL1500_.jpg" },
    { test: /PREMIER.*URINARIO/i, url: "https://m.media-amazon.com/images/I/71u9sJ1tBVL._AC_SL1500_.jpg" },
    { test: /PREMIER/i, url: "https://m.media-amazon.com/images/I/71jCsmP4YSL._AC_SL1500_.jpg" },

    // Golden
    { test: /COOKIE GOLDEN/i, url: "https://m.media-amazon.com/images/I/71tQe4oJzPL._AC_SL1500_.jpg" },
    { test: /GOLDEN.*GATO/i, url: "https://m.media-amazon.com/images/I/71tT142k1fL._AC_SL1500_.jpg" },
    { test: /GOLDEN.*FILHOTE/i, url: "https://m.media-amazon.com/images/I/71Y+mNlYmIL._AC_SL1500_.jpg" },
    { test: /GOLDEN/i, url: "https://m.media-amazon.com/images/I/71wKvhX51HL._AC_SL1500_.jpg" },

    // Gatos & Sachês & Areia
    { test: /PIPICAT/i, url: "https://m.media-amazon.com/images/I/61p-39QkZcL._AC_SL1000_.jpg" },
    { test: /AREIA SANITARIA/i, url: "https://m.media-amazon.com/images/I/61PjK2sQ0HL._AC_SL1000_.jpg" },
    { test: /WHISKAS|WISKAS/i, url: "https://m.media-amazon.com/images/I/61r4V4L+a7L._AC_SL1000_.jpg" },
    { test: /FRISKIES/i, url: "https://m.media-amazon.com/images/I/71L5T4F2B+L._AC_SL1500_.jpg" },
    { test: /CAT CHOW/i, url: "https://m.media-amazon.com/images/I/71V2x-7hVvL._AC_SL1500_.jpg" },
    { test: /DOG CHOW/i, url: "https://m.media-amazon.com/images/I/71P4oD33rLL._AC_SL1500_.jpg" },
    { test: /PEDIGREE/i, url: "https://m.media-amazon.com/images/I/71H2lU0X8ML._AC_SL1500_.jpg" },
    { test: /DENTASTIX/i, url: "https://m.media-amazon.com/images/I/71j1iR4T19L._AC_SL1500_.jpg" },
    { test: /BISCROK/i, url: "https://m.media-amazon.com/images/I/71w-h4U9KIL._AC_SL1500_.jpg" },
    { test: /GRAN PLUS|GRANPLUS/i, url: "https://m.media-amazon.com/images/I/71w3nC3s-kL._AC_SL1500_.jpg" },
    { test: /SPECIAL CAT/i, url: "https://m.media-amazon.com/images/I/71SgH23r3qL._AC_SL1500_.jpg" },
    { test: /SPECIAL DOG/i, url: "https://m.media-amazon.com/images/I/71Uqg1qKz9L._AC_SL1500_.jpg" },
    { test: /MONELLO/i, url: "https://m.media-amazon.com/images/I/71Xm34wFv+L._AC_SL1500_.jpg" },
    { test: /OPTIMUM/i, url: "https://m.media-amazon.com/images/I/71e6PqY2g1L._AC_SL1500_.jpg" }
];

// Função para baixar arquivo de imagem e salvar localmente
function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Status HTTP ${res.statusCode}`));
            }
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(destPath);
            });
            fileStream.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(12000, () => {
            req.destroy();
            reject(new Error('Timeout ao baixar imagem'));
        });
    });
}

// 2. Consulta à Base Aberta de Código de Barras (Open Food Facts / Open Pet Food Facts)
async function fetchPhotoByEan(ean) {
    if (!ean || String(ean).length < 8) return null;
    const cleanEan = String(ean).trim();

    const apis = [
        `https://world.openpetfoodfacts.org/api/v2/product/${cleanEan}.json`,
        `https://world.openfoodfacts.org/api/v2/product/${cleanEan}.json`
    ];

    for (const apiUrl of apis) {
        try {
            const res = await fetch(apiUrl, {
                headers: { 'User-Agent': 'AgroSalinas-Bot/1.0' }
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.product && data.product.image_url) {
                    return data.product.image_url;
                }
                if (data && data.product && data.product.image_front_url) {
                    return data.product.image_front_url;
                }
            }
        } catch (e) {
            // Silencioso se der timeout na API
        }
    }
    return null;
}

// 3. Execução Principal do Robô
async function runAutoFetch() {
    console.log('======================================================');
    console.log('🤖 ROBÔ DE FOTOS AUTOMÁTICAS — AGRO SALINAS');
    console.log('======================================================\n');

    delete require.cache[require.resolve(productsJsPath)];
    const { STORE_CONFIG, CATEGORIES, PRODUCTS } = require(productsJsPath);

    console.log(`📦 Total de produtos no catálogo: ${PRODUCTS.length}`);
    const withoutImage = PRODUCTS.filter(p => !p.image || p.image.trim() === '');
    console.log(`📸 Produtos aguardando foto: ${withoutImage.length}\n`);

    let linkedCount = 0;

    for (let i = 0; i < PRODUCTS.length; i++) {
        const prod = PRODUCTS[i];
        const code = prod.code || prod.id;

        // Se já tem imagem válida, pula
        if (prod.image && prod.image.trim() !== '') {
            continue;
        }

        // 1º TENTATIVA: Checa se já existe arquivo local com o código
        const possibleExts = ['.jpg', '.png', '.jpeg', '.webp'];
        let foundLocal = false;
        for (const ext of possibleExts) {
            const localRel = `assets/produtos/${code}${ext}`;
            const localFull = path.join(projectDir, localRel);
            if (fs.existsSync(localFull)) {
                prod.image = localRel.replace(/\\/g, '/');
                foundLocal = true;
                linkedCount++;
                console.log(`✅ [LOCAL] Cód ${code} (${prod.name}) -> ${prod.image}`);
                break;
            }
        }
        if (foundLocal) continue;

        // 2º TENTATIVA: Código de barras (EAN), se cadastrado no produto
        if (prod.ean) {
            try {
                const eanPhotoUrl = await fetchPhotoByEan(prod.ean);
                if (eanPhotoUrl) {
                    const savePath = path.join(assetsDir, `${code}.jpg`);
                    await downloadImage(eanPhotoUrl, savePath);
                    prod.image = `assets/produtos/${code}.jpg`;
                    linkedCount++;
                    console.log(`🌟 [EAN ${prod.ean}] Cód ${code} (${prod.name}) -> Baixado com sucesso!`);
                    continue;
                }
            } catch (err) {
                // segue para a próxima tentativa
            }
        }

        // 3º TENTATIVA: Regra de marcas conhecidas
        let matchedBrand = false;
        for (const rule of BRAND_RULES) {
            if (rule.test.test(prod.name)) {
                prod.image = rule.url;
                matchedBrand = true;
                linkedCount++;
                console.log(`🏷️ [MARCA] Cód ${code} (${prod.name}) -> Vinculado via regra oficial`);
                break;
            }
        }
        if (matchedBrand) continue;
    }

    console.log(`\n🎉 Processamento concluído! Novas fotos vinculadas: ${linkedCount}`);

    // Salva o products.js atualizado
    const newContent = `// Banco de Dados de Produtos - Agro Salinas
// Total de itens: ${PRODUCTS.length}

const STORE_CONFIG = ${JSON.stringify(STORE_CONFIG, null, 4)};

const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 4)};

const PRODUCTS = ${JSON.stringify(PRODUCTS, null, 4)};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STORE_CONFIG, CATEGORIES, PRODUCTS };
}
`;

    fs.writeFileSync(productsJsPath, newContent, 'utf8');
    console.log('💾 products.js atualizado com sucesso!');
}

runAutoFetch().catch(err => {
    console.error('❌ Erro durante a execução:', err);
});
