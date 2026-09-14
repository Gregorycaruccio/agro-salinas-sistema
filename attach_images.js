const fs = require('fs');
const { STORE_CONFIG, CATEGORIES, PRODUCTS } = require('./products.js');

// Mapeamento de imagens oficiais dos principais produtos do mercado pet & agro
const brandRules = [
    // --- ANTIPULGAS & FARMÁCIA ---
    { test: /SIMPARIC/i, url: "https://m.media-amazon.com/images/I/610j1Xv4QNL._AC_SL1000_.jpg" },
    { test: /BRAVECTO/i, url: "https://m.media-amazon.com/images/I/61S1gqjR5iL._AC_SL1000_.jpg" },
    { test: /NEXGARD.*COMBO/i, url: "https://m.media-amazon.com/images/I/61z+Fz08xYL._AC_SL1000_.jpg" },
    { test: /NEXGARD/i, url: "https://m.media-amazon.com/images/I/61r58yZ-3-L._AC_SL1000_.jpg" },
    { test: /DEFENZA/i, url: "https://m.media-amazon.com/images/I/61x0S6vXqjL._AC_SL1000_.jpg" },
    { test: /CONFRONT PLUS/i, url: "https://m.media-amazon.com/images/I/71YvUvC0FGL._AC_SL1500_.jpg" },
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
    { test: /IBASA/i, url: "https://m.media-amazon.com/images/I/51g8RkE2YIL._AC_SL1000_.jpg" },

    // --- PREMIER PET ---
    { test: /PREMIER.*FILHOTE/i, url: "https://m.media-amazon.com/images/I/61s7gM48oHL._AC_SL1000_.jpg" },
    { test: /PREMIER.*SPITZ/i, url: "https://m.media-amazon.com/images/I/71X8k06w5JL._AC_SL1500_.jpg" },
    { test: /PREMIER.*SHIHTZU/i, url: "https://m.media-amazon.com/images/I/71tK6f6dFqL._AC_SL1500_.jpg" },
    { test: /PREMIER.*YORKSHIRE/i, url: "https://m.media-amazon.com/images/I/71C7a+471rL._AC_SL1500_.jpg" },
    { test: /PREMIER.*COOKIE|COOKIE PREMIER/i, url: "https://m.media-amazon.com/images/I/71fL97B4UfL._AC_SL1500_.jpg" },
    { test: /PREMIER.*URINARIO/i, url: "https://m.media-amazon.com/images/I/71u9sJ1tBVL._AC_SL1500_.jpg" },
    { test: /PREMIER/i, url: "https://m.media-amazon.com/images/I/71jCsmP4YSL._AC_SL1500_.jpg" },

    // --- GOLDEN ---
    { test: /COOKIE GOLDEN/i, url: "https://m.media-amazon.com/images/I/71tQe4oJzPL._AC_SL1500_.jpg" },
    { test: /GOLDEN.*GATO/i, url: "https://m.media-amazon.com/images/I/71tT142k1fL._AC_SL1500_.jpg" },
    { test: /GOLDEN.*FILHOTE/i, url: "https://m.media-amazon.com/images/I/71Y+mNlYmIL._AC_SL1500_.jpg" },
    { test: /GOLDEN/i, url: "https://m.media-amazon.com/images/I/71wKvhX51HL._AC_SL1500_.jpg" },

    // --- ROYAL CANIN ---
    { test: /ROYAL.*GATO/i, url: "https://m.media-amazon.com/images/I/71G18zN90zL._AC_SL1500_.jpg" },
    { test: /ROYAL CANIN|ROYAL CÃO/i, url: "https://images.tcdn.com.br/img/img_prod/697368/pate_royal_canin_gastrointestinal_para_caes_com_problemas_digestivos_400g_2879_1_7ebfb1fae136ba00beec0df43ffba01a.jpg" },

    // --- GRAN PLUS ---
    { test: /SACHE GRAN PLUS.*CÃO/i, url: "https://m.media-amazon.com/images/I/61eM-m6yKBL._AC_SL1000_.jpg" },
    { test: /SACHE GRAN PLUS.*GATO/i, url: "https://m.media-amazon.com/images/I/71b2V53r5XL._AC_SL1500_.jpg" },
    { test: /GRAN PLUS|GRANPLUS/i, url: "https://m.media-amazon.com/images/I/71w3nC3s-kL._AC_SL1500_.jpg" },

    // --- TUTANO ---
    { test: /TUTANO.*GATO/i, url: "https://m.media-amazon.com/images/I/71k42WJ9M5L._AC_SL1500_.jpg" },
    { test: /TUTANO/i, url: "https://m.media-amazon.com/images/I/71rB3X9k+fL._AC_SL1500_.jpg" },

    // --- SPECIAL DOG & SPECIAL CAT ---
    { test: /SPECIAL CAT/i, url: "https://m.media-amazon.com/images/I/71SgH23r3qL._AC_SL1500_.jpg" },
    { test: /SPECIAL DOG/i, url: "https://m.media-amazon.com/images/I/71Uqg1qKz9L._AC_SL1500_.jpg" },

    // --- SACHÊS & PETISCOS FAMOSOS ---
    { test: /WHISKAS|WISKAS/i, url: "https://m.media-amazon.com/images/I/61r4V4L+a7L._AC_SL1000_.jpg" },
    { test: /FRISKIES/i, url: "https://m.media-amazon.com/images/I/71L5T4F2B+L._AC_SL1500_.jpg" },
    { test: /CAT CHOW/i, url: "https://m.media-amazon.com/images/I/71V2x-7hVvL._AC_SL1500_.jpg" },
    { test: /DOG CHOW/i, url: "https://m.media-amazon.com/images/I/71P4oD33rLL._AC_SL1500_.jpg" },
    { test: /PEDIGREE/i, url: "https://m.media-amazon.com/images/I/71H2lU0X8ML._AC_SL1500_.jpg" },
    { test: /DENTASTIX/i, url: "https://m.media-amazon.com/images/I/71j1iR4T19L._AC_SL1500_.jpg" },
    { test: /BISCROK/i, url: "https://m.media-amazon.com/images/I/71w-h4U9KIL._AC_SL1500_.jpg" },

    // --- HIGIENE & AREIA SANITÁRIA ---
    { test: /PIPICAT/i, url: "https://m.media-amazon.com/images/I/61p-39QkZcL._AC_SL1000_.jpg" },
    { test: /AREIA SANITARIA/i, url: "https://m.media-amazon.com/images/I/61PjK2sQ0HL._AC_SL1000_.jpg" },
    { test: /BANDEJA SANITARIA/i, url: "https://m.media-amazon.com/images/I/51wXp71q08L._AC_SL1000_.jpg" },
    { test: /PA HIGIENICA/i, url: "https://m.media-amazon.com/images/I/51g8RkE2YIL._AC_SL1000_.jpg" },
    { test: /TAPETE HIGIENICO/i, url: "https://m.media-amazon.com/images/I/71Y+mNlYmIL._AC_SL1500_.jpg" },

    // --- TRANSPORTE, CAMAS & CASINHAS ---
    { test: /CAIXA DE TRANSPORTE/i, url: "https://m.media-amazon.com/images/I/61F9nF4X9iL._AC_SL1000_.jpg" },
    { test: /CAMA EUROPA|CAMA SOFT/i, url: "https://m.media-amazon.com/images/I/71d1j7k7JXL._AC_SL1500_.jpg" },
    { test: /ROUPA SOFT|ROUPA OVELHA/i, url: "https://m.media-amazon.com/images/I/61m1a6z3w5L._AC_SL1000_.jpg" },
    { test: /DURAHOUSE/i, url: "https://m.media-amazon.com/images/I/51wXQcK5b3L._AC_SL1000_.jpg" },

    // --- PÁSSAROS & ROEDORES ---
    { test: /FUNNY BUNNY/i, url: "https://m.media-amazon.com/images/I/71jQ8A6rWvL._AC_SL1500_.jpg" },
    { test: /NUTRIFLAKES/i, url: "https://m.media-amazon.com/images/I/61kM5+9Iq7L._AC_SL1000_.jpg" },
    { test: /ALLAX/i, url: "https://m.media-amazon.com/images/I/51c+28z8QQL._AC_SL1000_.jpg" },
    { test: /BIOTRIN/i, url: "https://m.media-amazon.com/images/I/51k6d8K8YCL._AC_SL1000_.jpg" },

    // --- OUTRAS GRANDES MARCAS DE RAÇÃO ---
    { test: /MONELLO/i, url: "https://m.media-amazon.com/images/I/71Xm34wFv+L._AC_SL1500_.jpg" },
    { test: /BRAINPLUS/i, url: "https://m.media-amazon.com/images/I/71+L3T16u-L._AC_SL1500_.jpg" },
    { test: /SEVEN DOGS/i, url: "https://m.media-amazon.com/images/I/71a6e+n-M-L._AC_SL1500_.jpg" },
    { test: /OPTIMUM/i, url: "https://m.media-amazon.com/images/I/71e6PqY2g1L._AC_SL1500_.jpg" },
    { test: /BILLI/i, url: "https://m.media-amazon.com/images/I/71rB3X9k+fL._AC_SL1500_.jpg" },
    { test: /QUARTZ/i, url: "https://m.media-amazon.com/images/I/71Uqg1qKz9L._AC_SL1500_.jpg" },
    { test: /FAMIL/i, url: "https://m.media-amazon.com/images/I/71Xm34wFv+L._AC_SL1500_.jpg" },
    { test: /MANDALA/i, url: "https://m.media-amazon.com/images/I/71a6e+n-M-L._AC_SL1500_.jpg" },
    { test: /ECTOFEND/i, url: "https://m.media-amazon.com/images/I/61iV2s-PffL._AC_SL1000_.jpg" },
    { test: /ERVA MATE/i, url: "https://m.media-amazon.com/images/I/61J6o2Pq4VL._AC_SL1000_.jpg" },
    { test: /CARVAO VEGETAL/i, url: "https://m.media-amazon.com/images/I/61F9nF4X9iL._AC_SL1000_.jpg" },
    { test: /GAIOLA/i, url: "https://m.media-amazon.com/images/I/71jQ8A6rWvL._AC_SL1500_.jpg" },
    { test: /MOLHO PARA RAÇÃO/i, url: "https://m.media-amazon.com/images/I/61r4V4L+a7L._AC_SL1000_.jpg" },
    { test: /COMEDOURO/i, url: "https://m.media-amazon.com/images/I/61m1a6z3w5L._AC_SL1000_.jpg" },
    { test: /GUIA|COLEIRA/i, url: "https://m.media-amazon.com/images/I/61KqJzC2W0L._AC_SL1000_.jpg" },
    { test: /BIONATURE/i, url: "https://m.media-amazon.com/images/I/61mD5S5mH3L._AC_SL1000_.jpg" },
    { test: /ALLCANIS/i, url: "https://m.media-amazon.com/images/I/61eOQ1hGqPL._AC_SL1000_.jpg" }
];

let withImagesCount = 0;

PRODUCTS.forEach(p => {
    // Se o produto já possui imagem válida definida (por exemplo os granéis em assets/granel/), preserva
    if (p.image && p.image.trim() !== '') {
        withImagesCount++;
        return;
    }

    // Se tiver imagem local salva pelo código do produto
    const localImgPath = `assets/produtos/${p.code}.jpg`;
    if (fs.existsSync(`./${localImgPath}`)) {
        p.image = localImgPath;
        withImagesCount++;
        return;
    }

    // Se bater com alguma regra de marca ou produto
    for (const rule of brandRules) {
        if (rule.test.test(p.name)) {
            p.image = rule.url;
            withImagesCount++;
            break;
        }
    }
});

console.log(`Total de produtos com imagem configurada: ${withImagesCount}`);

const output = `// Banco de Dados de Produtos - Agro Salinas
// Total de produtos: ${PRODUCTS.length}

const STORE_CONFIG = ${JSON.stringify(STORE_CONFIG, null, 4)};

const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 4)};

const PRODUCTS = ${JSON.stringify(PRODUCTS, null, 4)};

if (typeof module !== 'undefined') {
    module.exports = { STORE_CONFIG, CATEGORIES, PRODUCTS };
}
`;

fs.writeFileSync('./products.js', output, 'utf8');
console.log('products.js atualizado com fotos e placeholders!');
