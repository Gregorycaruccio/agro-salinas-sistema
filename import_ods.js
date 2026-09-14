const fs = require('fs');
const xlsx = require('xlsx');

const odsPath = 'C:/Users/Grég/Downloads/Itens 2.ods';

console.log('Lendo arquivo ODS...');
const wb = xlsx.readFile(odsPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const rawProducts = [];

for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const code = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
    const name = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
    const priceRaw = row[4] !== undefined && row[4] !== null ? row[4] : row[3];

    if (!name || name.length < 2) continue;
    if (code === '' || name.toLowerCase().includes('total') || name.toLowerCase().includes('empresa:')) continue;

    let price = 0;
    if (typeof priceRaw === 'number') {
        price = priceRaw;
    } else if (typeof priceRaw === 'string') {
        price = parseFloat(priceRaw.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
    }

    rawProducts.push({ code, name, price });
}

function titleCase(str) {
    const minorWords = ['e', 'de', 'da', 'do', 'das', 'dos', 'em', 'para', 'com', 'por', 'a', 'o', 'as', 'os', 'n', 'no', 'na', 'kg', 'g', 'ml', 'l', 'un', 'cx', 'pct'];
    return str.toLowerCase().split(' ').map((word, index) => {
        if (word.length === 0) return '';
        if (minorWords.includes(word) && index > 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function categorizeProduct(item) {
    const n = item.name.toUpperCase();

    // 1. Granel
    if (n.includes('GRANEL') || n.includes('A GRANEL') || n.includes('(KG)') || n.startsWith('GRANEL')) {
        let sub = 'Geral';
        if (n.includes('CAO') || n.includes('CAES') || n.includes('DOG')) sub = 'Cães';
        else if (n.includes('GATO') || n.includes('CAT')) sub = 'Gatos';
        else if (n.includes('PASSARO') || n.includes('AVE')) sub = 'Pássaros';
        else if (n.includes('CAVALO') || n.includes('EQUINO')) sub = 'Equinos';
        return { category: 'granel', subcategory: sub, unit: 'kg' };
    }

    // 2. Farmácia & Medicamentos & Antipulgas
    if (
        n.includes('NEXGARD') || n.includes('BRAVECTO') || n.includes('SIMPARIC') ||
        n.includes('DEFENZA') || n.includes('DEFEND') || n.includes('CONFRONT') ||
        n.includes('INVICTO') || n.includes('ECTOFEND') || n.includes('ALLAX') ||
        n.includes('AVERIN') || n.includes('BIODEX') || n.includes('BIOTRIN') ||
        n.includes('CARBOVET') || n.includes('COLOSSO') || n.includes('NEOTOPIC') ||
        n.includes('OTOLIN') || n.includes('CREOLINA') || n.includes('ANTIBIOTICO') ||
        n.includes('VERMIFUGO') || n.includes('PROBIOTICO') || n.includes('SERINGA') ||
        n.includes('AGULHA') || n.includes('COMPRIMIDO') || n.includes('POMADA') ||
        n.includes('SPRAY') || n.includes('ELIZABETANO') || n.includes('ANTIPULGA') ||
        n.includes('CARRAPATO') || n.includes('IVERO') || n.includes('IVERMECTINA') ||
        n.includes('VET') || n.includes('VETERINARIO') || n.includes('VERMIVET') ||
        n.includes('HEMOLITAN') || n.includes('GLICOPAN') || n.includes('MERCEPTON') ||
        n.includes('TERRAMICINA') || n.includes('PENICILINA') || n.includes('CURABRANCO') ||
        n.includes('UNGUENTO') || n.includes('COLIRIO') || n.includes('TIURAM') ||
        n.includes('SABONETE MATACURA') || n.includes('SHAMPOO MEDICAMENTOSO') ||
        n.includes('PET GLOVE') || n.includes('HIDRA REFLEX') || n.includes('GEL DENTAL')
    ) {
        let sub = 'Medicamentos';
        if (n.includes('NEXGARD') || n.includes('BRAVECTO') || n.includes('SIMPARIC') || n.includes('DEFENZA') || n.includes('DEFEND') || n.includes('CONFRONT') || n.includes('INVICTO') || n.includes('ANTIPULGA') || n.includes('PIPETA') || n.includes('ECTOFEND')) {
            sub = 'Antipulgas & Carrapatos';
        } else if (n.includes('BIOTRIN') || n.includes('PROBIOTICO') || n.includes('VITAMINA') || n.includes('SUPLEMENTO') || n.includes('GLICOPAN') || n.includes('HEMOLITAN')) {
            sub = 'Suplementos & Vitaminas';
        } else if (n.includes('ELIZABETANO') || n.includes('COLAR')) {
            sub = 'Cuidados Veterinários';
        }
        return { category: 'farmacia', subcategory: sub, unit: n.includes('COMP') ? 'comp' : (n.includes('ML') ? 'frasco' : 'un') };
    }

    // 3. Pesca
    if (n.includes('PESCA') || n.includes('ANZOL') || n.includes('MOLINETE') || n.includes('CHICOTE') || n.includes('CARRETILHA') || n.includes('ISCA')) {
        return { category: 'pesca', subcategory: 'Pesca', unit: 'un' };
    }

    // 4. Pássaros & Roedores & Peixes
    if (
        n.includes('PASSARO') || n.includes('PASSAROS') || n.includes('CALOPSITA') ||
        n.includes('PERIQUITO') || n.includes('CANARIO') || n.includes('TRINCA FERRO') ||
        n.includes('PAPAGAIO') || n.includes('ARARA') || n.includes('COLEIRO') ||
        n.includes('SABIA') || n.includes('AZULAO') || n.includes('GIRASSOL') ||
        n.includes('PAINCO') || n.includes('NIGER') || n.includes('PAPA DE OVO') ||
        n.includes('BEBEDOURO PASSARO') || n.includes('BEBEDOURO BEIJA') ||
        n.includes('BEBEDOURO FRANGO') || n.includes('HAMSTER') || n.includes('COELHO') ||
        n.includes('PORQUINHO DA INDIA') || n.includes('CHINCHILA') || n.includes('ROEDOR') ||
        n.includes('ROEDORES') || n.includes('FUNNY BUNNY') || n.includes('FENO') ||
        n.includes('NUTRIBIRD') || n.includes('NUTRIFLAKES') || (n.includes('PEIXE') && n.includes('ALIMENTO')) ||
        (n.includes('BLOCO') && (n.includes('CALCIO') || n.includes('SIBA') || n.includes('CANARIO'))) ||
        n.includes('PEDRA CALCIO') || n.includes('BANHEIRA PARA PASSARO') || n.includes('NINHO')
    ) {
        let sub = 'Pássaros';
        if (n.includes('HAMSTER') || n.includes('COELHO') || n.includes('PORQUINHO') || n.includes('ROEDOR') || n.includes('FUNNY BUNNY') || n.includes('FENO')) {
            sub = 'Roedores & Coelhos';
        } else if (n.includes('GAIOLA')) {
            sub = 'Gaiolas & Viveiros';
        } else if (n.includes('GIRASSOL') || n.includes('PAINCO') || n.includes('NIGER') || n.includes('MISTURA') || n.includes('AZULAO') || n.includes('PAPA DE OVO') || n.includes('NUTRIBIRD')) {
            sub = 'Sementes & Alimentos';
        } else if (n.includes('BLOCO') || n.includes('CALCIO') || n.includes('SIBA')) {
            sub = 'Cálcio & Minerais';
        } else if (n.includes('PEIXE') || n.includes('NUTRIFLAKES')) {
            sub = 'Peixes & Aquário';
        }
        return { category: 'passaros_roedores', subcategory: sub, unit: n.includes('KG') ? 'kg' : (n.includes('500G') || n.includes('250G') ? 'pct' : 'un') };
    }

    // 5. Gatos
    if (
        n.includes('GATO') || n.includes('GATOS') || n.includes('FELINO') ||
        n.includes('CAT CHOW') || n.includes('WHISKAS') || n.includes('PIPICAT') ||
        n.includes('PROGATO') || n.includes('BIONATURE') || n.includes('AREIA') ||
        n.includes('ARRANHADOR') || n.includes('FONTE GATO') || n.includes('CATNIP') ||
        n.includes('GATINHO') || n.includes('MITZI') || n.includes('GATOZIM') ||
        n.includes('FAMIL') || n.includes('GATS') || n.includes('SILICA') ||
        n.includes('GRANULADO HIGIENICO') || n.includes('PA HIGIENICA') ||
        (n.includes('PATE') && (n.includes('GATO') || n.includes('WISKAS') || n.includes('WHISKAS')))
    ) {
        let sub = 'Rações Secas';
        if (n.includes('AREIA') || n.includes('SILICA') || n.includes('GRANULADO') || n.includes('BIONATURE') || n.includes('PIPICAT') || n.includes('PROGATO') || n.includes('MITZI') || n.includes('FAMIL') || n.includes('GATS')) {
            sub = 'Areias Sanitárias';
        } else if (n.includes('ARRANHADOR')) {
            sub = 'Arranhadores';
        } else if (n.includes('FONTE') || n.includes('BEBEDOURO')) {
            sub = 'Fontes & Bebedouros';
        } else if (n.includes('BANDEJA') || n.includes('PA HIGIENICA') || n.includes('SANITARIA')) {
            sub = 'Bandejas & Higiene';
        } else if (n.includes('PATE') || n.includes('SACHE') || n.includes('MOLHO') || n.includes('PETISCO') || n.includes('OPTIMUM')) {
            sub = 'Patês & Sachês';
        } else if (n.includes('BRINQUEDO') || n.includes('RATINHO') || n.includes('VARINHA')) {
            sub = 'Brinquedos';
        }
        return { category: 'gatos', subcategory: sub, unit: n.includes('KG') ? 'pct' : (n.includes('LATA') ? 'lata' : 'un') };
    }

    // 6. Cães
    if (
        n.includes('CAO') || n.includes('CAES') || n.includes('CANINO') ||
        n.includes('DOG') || n.includes('PREMIER') || n.includes('GOLDEN') ||
        n.includes('SPECIAL DOG') || n.includes('BISCROK') || n.includes('DENTASTIX') ||
        n.includes('BIFINHO') || n.includes('KELDOG') || n.includes('ALLCANIS') ||
        n.includes('MANDALA') || n.includes('PEDIGREE') || n.includes('CHOW') ||
        n.includes('CASSPET') || n.includes('XIXIDOG') || n.includes('DURAHOUSE') ||
        n.includes('CAMA ') || n.includes('COLEIRA') || n.includes('GUIA ') ||
        n.includes('FOCINHEIRA') || n.includes('COMEDOURO') || n.includes('BEBEDOURO') ||
        n.includes('BRINQUEDO') || n.includes('MORDEDOR') || n.includes('BOLA ') ||
        n.includes('PERFUME') || n.includes('BANHO A SECO') || n.includes('ALICATE') ||
        n.includes('CORRENTE CAO') || n.includes('PEITORAL') || n.includes('TRANSPORTE') ||
        n.includes('COOKIE') || n.includes('OSSO') || n.includes('STICK') || n.includes('NUTRICAO CLINICA')
    ) {
        let sub = 'Rações Secas';
        if (n.includes('DENTASTIX') || n.includes('BISCROK') || n.includes('COOKIE') || n.includes('BIFINHO') || n.includes('PETISCO') || n.includes('OSSO') || n.includes('STICK') || n.includes('BIFE')) {
            sub = 'Petiscos & Cookies';
        } else if (n.includes('PATE') || n.includes('SACHE') || n.includes('MOLHO') || n.includes('RECOVERY') || n.includes('GASTROINTESTINAL')) {
            sub = 'Patês & Sachês';
        } else if (n.includes('CAMA') || n.includes('DURAHOUSE') || n.includes('CASA')) {
            sub = 'Casinhas & Camas';
        } else if (n.includes('COLEIRA') || n.includes('GUIA') || n.includes('PEITORAL') || n.includes('CORRENTE') || n.includes('FOCINHEIRA') || n.includes('CINTO')) {
            sub = 'Passeio & Guias';
        } else if (n.includes('BRINQUEDO') || n.includes('MORDEDOR') || n.includes('BOLA') || n.includes('GALINHA')) {
            sub = 'Brinquedos';
        } else if (n.includes('COMEDOURO') || n.includes('BEBEDOURO')) {
            sub = 'Comedouros & Bebedouros';
        } else if (n.includes('PERFUME') || n.includes('BANHO') || n.includes('SHAMPOO') || n.includes('ALICATE') || n.includes('XIXIDOG')) {
            sub = 'Higiene & Beleza';
        } else if (n.includes('TRANSPORTE')) {
            sub = 'Transporte';
        } else if (n.includes('NUTRICAO CLINICA')) {
            sub = 'Nutrição Clínica';
        }
        return { category: 'caes', subcategory: sub, unit: n.includes('KG') ? 'pct' : (n.includes('LATA') ? 'lata' : 'un') };
    }

    // 7. Jardim, Campo & Agro (Default)
    let sub = 'Geral';
    if (n.includes('ADUBO') || n.includes('NPK') || n.includes('UREIA') || n.includes('CALCARIO') || n.includes('TERRA') || n.includes('SUBSTRATO') || n.includes('FERTILIZANTE')) {
        sub = 'Adubos & Fertilizantes';
    } else if (n.includes('MUDA') || n.includes('MUDAS') || n.includes('FRUTIFERA') || n.includes('ALFACE') || n.includes('BETERRABA') || n.includes('COUVE') || n.includes('CEBOLINHA') || n.includes('ARRUDA') || n.includes('MORANGO')) {
        sub = 'Mudas & Plantas';
    } else if (n.includes('SEIXO') || n.includes('PINUS') || n.includes('FLOREIRA') || n.includes('VASO') || n.includes('CUIA') || n.includes('DENGUE')) {
        sub = 'Decoração & Vasos';
    } else if (n.includes('FORMICIDA') || n.includes('MATA MATO') || n.includes('GLIFOSATO') || n.includes('INSETICIDA') || n.includes('JIMO') || n.includes('K-OTHRINE') || n.includes('PULGAO') || n.includes('TIRIRICA') || n.includes('BARATA') || n.includes('MOSCA') || n.includes('ESCORPIAO') || n.includes('CUPIM')) {
        sub = 'Controle de Pragas';
    } else if (n.includes('CARVAO')) {
        sub = 'Churrasco & Carvão';
    } else if (n.includes('ERVA MATE') || n.includes('CHIMARRAO') || n.includes('TERERE')) {
        sub = 'Chimarrão & Tereré';
    } else if (n.includes('MILHO') || n.includes('SOJA') || n.includes('QUIRERA') || n.includes('SAL MINERAL') || n.includes('EQUINO') || n.includes('CAVALO') || n.includes('BOVINO') || n.includes('GADO')) {
        sub = 'Nutrição Animal & Campo';
    } else if (n.includes('KIT JARDINAGEM') || n.includes('PULVERIZADOR') || n.includes('BOMBA') || n.includes('REGADOR') || n.includes('TESOURA')) {
        sub = 'Ferramentas de Jardim';
    }

    return { category: 'jardim_agro', subcategory: sub, unit: n.includes('KG') ? 'kg' : (n.includes('L') || n.includes('ML') ? 'frasco' : 'un') };
}

// Exemplos populares de granel para garantir que a categoria esteja recheada
const initialGranel = [
    {
        id: "granel_cao_carne",
        code: "GRA01",
        name: "Ração Cão Adulto Carne (A Granel / Kg)",
        category: "granel",
        subcategory: "Cães",
        price: 12.50,
        unit: "kg",
        featured: true,
        badge: "A Granel"
    },
    {
        id: "granel_cao_premium",
        code: "GRA02",
        name: "Ração Cão Premium Especial (A Granel / Kg)",
        category: "granel",
        subcategory: "Cães",
        price: 16.90,
        unit: "kg",
        featured: true,
        badge: "A Granel"
    },
    {
        id: "granel_cao_filhote",
        code: "GRA03",
        name: "Ração Cão Filhote Frango e Arroz (A Granel / Kg)",
        category: "granel",
        subcategory: "Cães",
        price: 15.00,
        unit: "kg",
        badge: "A Granel"
    },
    {
        id: "granel_gato_castrado",
        code: "GRA04",
        name: "Ração Gato Castrado Salmão (A Granel / Kg)",
        category: "granel",
        subcategory: "Gatos",
        price: 19.50,
        unit: "kg",
        featured: true,
        badge: "A Granel"
    },
    {
        id: "granel_gato_mix",
        code: "GRA05",
        name: "Ração Gato Adulto Mix de Carnes (A Granel / Kg)",
        category: "granel",
        subcategory: "Gatos",
        price: 15.90,
        unit: "kg",
        badge: "A Granel"
    },
    {
        id: "granel_cavalo",
        code: "GRA06",
        name: "Ração Equinos / Cavalo Manutenção (A Granel / Kg)",
        category: "granel",
        subcategory: "Equinos & Agro",
        price: 4.50,
        unit: "kg",
        badge: "A Granel"
    },
    {
        id: "granel_aves",
        code: "GRA07",
        name: "Mistura Especial Para Pássaros (A Granel / Kg)",
        category: "granel",
        subcategory: "Pássaros",
        price: 8.90,
        unit: "kg",
        badge: "A Granel"
    }
];

const processedProducts = [...initialGranel];
const seenCodes = new Set(initialGranel.map(p => p.code));

rawProducts.forEach((item, idx) => {
    const { category, subcategory, unit } = categorizeProduct(item);
    const n = item.name.toUpperCase();

    let badge = undefined;
    if (n.includes('ROYAL CANIN') || n.includes('PREMIER') || n.includes('NEXGARD') || n.includes('GOLDEN') || n.includes('PIPICAT')) {
        badge = 'Destaque';
    }

    const id = item.code || `item_${idx + 1}`;
    if (!seenCodes.has(id)) {
        seenCodes.add(id);
        processedProducts.push({
            id,
            code: item.code,
            name: titleCase(item.name),
            category,
            subcategory,
            price: item.price,
            unit,
            featured: badge !== undefined,
            badge
        });
    }
});

const STORE_CONFIG = {
    name: "Agro Salinas",
    slogan: "Unindo a cidade ao campo!",
    whatsappNumber: "5551995624230",
    defaultSeller: {
        code: "GREG",
        name: "Grég",
        tag: "#GREG"
    }
};

const CATEGORIES = [
    { id: "todos", name: "Todos os Produtos", icon: "✨" },
    { id: "granel", name: "Rações a Granel (Kg)", icon: "⚖️" },
    { id: "caes", name: "Cães", icon: "🐶" },
    { id: "gatos", name: "Gatos", icon: "🐱" },
    { id: "farmacia", name: "Farmácia & Antipulgas", icon: "💊" },
    { id: "passaros_roedores", name: "Pássaros & Roedores", icon: "🦜" },
    { id: "jardim_agro", name: "Jardim, Campo & Casa", icon: "🌿" },
    { id: "pesca", name: "Pesca & Outros", icon: "🎣" }
];

const fileContent = `// Banco de Dados de Produtos - Agro Salinas
// Total de produtos importados da planilha: ${processedProducts.length}

const STORE_CONFIG = ${JSON.stringify(STORE_CONFIG, null, 4)};

const CATEGORIES = ${JSON.stringify(CATEGORIES, null, 4)};

const PRODUCTS = ${JSON.stringify(processedProducts, null, 4)};

if (typeof module !== 'undefined') {
    module.exports = { STORE_CONFIG, CATEGORIES, PRODUCTS };
}
`;

fs.writeFileSync('./products.js', fileContent, 'utf8');
console.log(`products.js atualizado com sucesso com ${processedProducts.length} produtos!`);
