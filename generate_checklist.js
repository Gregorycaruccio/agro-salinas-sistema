const fs = require('fs');
const vm = require('vm');

// Load products.js
const code = fs.readFileSync('products.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(code + '\n; this.PRODUCTS = PRODUCTS;', context);
const products = context.PRODUCTS;

// Active products: has image and not outOfStock/available===false
const activeProducts = products.filter(p => {
    const hasImg = !!p.image && typeof p.image === 'string' && p.image.trim() !== '';
    const notOut = !p.outOfStock && p.available !== false && !p.paused;
    return hasImg && notOut;
});

console.log('Total active products:', activeProducts.length);

const granel = activeProducts.filter(p => p.category === 'granel');
const caes = activeProducts.filter(p => p.category === 'caes');
const gatos = activeProducts.filter(p => p.category === 'gatos');
const passaros = activeProducts.filter(p => p.category === 'passaros');
const outros = activeProducts.filter(p => !['granel', 'caes', 'gatos', 'passaros'].includes(p.category));

console.log('Granel:', granel.length);
console.log('Cães:', caes.length);
console.log('Gatos:', gatos.length);
console.log('Pássaros:', passaros.length);
console.log('Outros:', outros.length);

function formatRow(p) {
    const weight = p.packageWeight ? (p.category === 'granel' ? `Pacote ${p.packageWeight}` : p.packageWeight) : (p.unit || '');
    const price = `R$ ${p.price.toFixed(2).replace('.', ',')}`;
    return `        <tr>
            <td class="check-box">[ &nbsp; ]</td>
            <td class="code-col"><strong>${p.code || p.id}</strong></td>
            <td class="name-col">${p.name}</td>
            <td class="weight-col">${weight}</td>
            <td class="price-col">${price}</td>
            <td class="obs-col"></td>
        </tr>`;
}

function buildTable(items) {
    return `<table>
    <thead><tr><th>Check</th><th>Cód</th><th>Produto</th><th>Peso da Embalagem</th><th>Preço</th><th>Falta / Obs</th></tr></thead>
    <tbody>
${items.map(formatRow).join('\n')}
    </tbody>
</table>`;
}

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Checklist de Estoque - Agro Salinas</title>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; margin: 20px; color: #1e293b; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 4px 0; color: #1B432E; }
    p.subtitle { margin: 0 0 14px 0; color: #64748b; font-size: 11px; }
    .instructions { background: #f0fdf4; border: 1.5px solid #bbf7d0; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 11px; line-height: 1.5; }
    .section-title { background: #1B432E; color: white; padding: 6px 10px; font-size: 12px; font-weight: bold; margin-top: 20px; border-radius: 6px; letter-spacing: 0.3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; }
    td { border: 1px solid #e2e8f0; padding: 5px 8px; font-size: 11px; }
    tr:nth-child(even) { background: #f8fafc; }
    .check-box { width: 40px; text-align: center; font-family: monospace; font-size: 14px; font-weight: bold; color: #94a3b8; }
    .code-col { width: 60px; text-align: center; color: #0f172a; }
    .name-col { font-weight: 600; color: #0f172a; }
    .weight-col { width: 110px; text-align: center; color: #475569; }
    .price-col { width: 80px; text-align: right; font-weight: 700; color: #166534; }
    .obs-col { width: 100px; }
    .no-print {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    }
    .btn-print {
        background: #1B432E;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        font-size: 12px;
    }
    .btn-print:hover { background: #143323; }
    @media print {
        body { margin: 10mm; font-size: 10px; }
        .no-print { display: none !important; }
        tr { page-break-inside: avoid; }
        .page-break { page-break-before: always; }
    }
</style>
</head>
<body>

<div class="no-print">
    <div>
        <strong>🖨️ Modo de Impressão / Salvar PDF:</strong> Clique no botão ao lado ou aperte <strong>Ctrl + P</strong>. Escolha 'Salvar como PDF' para enviar no WhatsApp ou imprima para a Meire riscar com caneta.
    </div>
    <button class="btn-print" onclick="window.print()">Imprimir / Gerar PDF</button>
</div>

<h1>📋 Agro Salinas — Folha de Conferência de Estoque Físico</h1>
<p class="subtitle">Itens ativos com foto no Catálogo Digital | Total a conferir: ${activeProducts.length} produtos</p>

<div class="instructions">
    <strong>Como a Meire deve marcar:</strong><br>
    ✅ <strong>Tem na loja:</strong> Marque <strong>[ ✓ ]</strong> ou deixe em branco.<br>
    ❌ <strong>Falta / Acabou:</strong> Marque um <strong>[ X ]</strong> bem visível ou passe um risco na linha do produto.<br>
    📝 <strong>Observações:</strong> Use a última coluna se o preço mudou ou se só tem poucas unidades restantes.
</div>

<div class="section-title">1. RAÇÕES A GRANEL — PACOTES SELADOS (${granel.length} itens)</div>
${buildTable(granel)}

<div class="section-title page-break">2. CÃES — PACOTES FECHADOS, SACHÊS E COOKIES (${caes.length} itens)</div>
${buildTable(caes)}

<div class="section-title page-break">3. GATOS — RAÇÕES, SACHÊS E LATAS (${gatos.length} itens)</div>
${buildTable(gatos)}

${passaros.length > 0 ? `
<div class="section-title page-break">4. PÁSSAROS E OUTROS (${passaros.length} itens)</div>
${buildTable(passaros)}
` : ''}

${outros.length > 0 ? `
<div class="section-title page-break">5. OUTROS PRODUTOS (${outros.length} itens)</div>
${buildTable(outros)}
` : ''}

</body>
</html>
`;

fs.writeFileSync('conferencia_estoque.html', html, 'utf8');
console.log('conferencia_estoque.html atualizado com sucesso!');
