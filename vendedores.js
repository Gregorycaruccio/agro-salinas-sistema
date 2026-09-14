// Cadastro Oficial de Vendedores - Agro Salinas
// Este arquivo armazena os vendedores autorizados, seus códigos e números de WhatsApp.
// Os PINs são gerenciados individualmente no dispositivo de cada vendedor por segurança.

const VENDEDORES = [
    {
        code: "GREG",
        name: "Grégory",
        whatsapp: "5551982199486",
        active: true
    },
    {
        code: "RODRIGO",
        name: "Rodrigo",
        whatsapp: "5551989279951",
        active: true
    }
];

const VENDAS_CONFIG = {
    // WhatsApp oficial da Agropecuária (William & Meire) para entrega
    lojaWhatsApp: "5551995624230",
    lojaNome: "Agro Salinas (William & Meire)",
    
    // Vendedor padrão caso o cliente acerte o link sem indicação
    defaultVendedor: {
        code: "WILLIAM",
        name: "William (Agro Salinas)",
        whatsapp: "5551995624230"
    }
};

function findVendedorByCode(code) {
    if (!code) return null;
    const clean = code.toString().trim().toUpperCase();
    return VENDEDORES.find(v => v.code === clean && v.active) || null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VENDEDORES, VENDAS_CONFIG, findVendedorByCode };
}
