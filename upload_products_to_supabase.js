// Script de Migração dos 814 Produtos para o Supabase - Agro Salinas
const fs = require('fs');

const SUPABASE_CONFIG = {
    url: "https://hpenujwesivgkymdrsnk.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZW51andlc2l2Z2t5bWRyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNDQ5OTEsImV4cCI6MjEwNjYyMDk5MX0.PRuYBSxRvYFVzhqdH_A3spMgIj5MuLyv_tfVBGEoLSs"
};

async function uploadAllProducts() {
    console.log('Lendo products.js...');
    const content = fs.readFileSync('products.js', 'utf8');
    const match = content.match(/const PRODUCTS = (\[[\s\S]*?\]);/);
    if (!match) throw new Error('Não foi possível ler a lista PRODUCTS');
    const products = eval(match[1]);
    console.log(`Carregados ${products.length} produtos do catálogo.`);

    const rows = products.map(p => ({
        id: String(p.id),
        code: String(p.code || p.id),
        name: p.name,
        category: p.category || 'todos',
        subcategory: p.subcategory || '',
        price: Number(p.price) || 0,
        unit: p.unit || 'un',
        featured: Boolean(p.featured),
        badge: p.badge || '',
        image: p.image || '',
        extra_info: p.extraInfo || '',
        description: p.description || '',
        available: p.available !== false,
        out_of_stock: Boolean(p.outOfStock),
        variations: p.variations || [],
        raw_data: p
    }));

    const BATCH_SIZE = 50;
    console.log(`Iniciando envio em lotes de ${BATCH_SIZE}...`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        console.log(`Enviando produtos ${i + 1} a ${Math.min(i + BATCH_SIZE, rows.length)}...`);

        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/produtos`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(batch)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Erro no lote ${i}: ${errText}`);
        }
    }

    console.log(`✅ Sucesso absoluto! Todos os ${rows.length} produtos foram sincronizados com o Supabase.`);
}

uploadAllProducts().catch(console.error);
