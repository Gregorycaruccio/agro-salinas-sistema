// Cadastro Oficial de Vendedores & Integração Nuvem (Supabase) - Agro Salinas
// Sincroniza vendedores, PINs e histórico de pedidos em tempo real para todos os dispositivos.

const SUPABASE_CONFIG = {
    url: "https://hpenujwesivgkymdrsnk.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZW51andlc2l2Z2t5bWRyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNDQ5OTEsImV4cCI6MjEwNjYyMDk5MX0.PRuYBSxRvYFVzhqdH_A3spMgIj5MuLyv_tfVBGEoLSs"
};

const DEFAULT_VENDEDORES = [
    {
        code: "GREG",
        name: "Grégory",
        whatsapp: "5551982199486",
        pin: null,
        role: "admin",
        active: true
    },
    {
        code: "RODRIGO",
        name: "Rodrigo",
        whatsapp: "5551989279951",
        pin: null,
        role: "seller",
        active: true
    },
    {
        code: "ADMIN",
        name: "William & Meire (Loja)",
        whatsapp: "5551995624230",
        pin: null,
        role: "admin",
        active: true
    }
];

// Inicializa com cache local se existir, senão usa a lista padrão
let VENDEDORES = (function () {
    try {
        if (typeof localStorage !== "undefined") {
            const cached = localStorage.getItem("agro_salinas_sellers_cache");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        }
    } catch (e) {}
    return [...DEFAULT_VENDEDORES];
})();

const VENDAS_CONFIG = {
    // WhatsApp oficial da Agropecuária (William & Meire) para entrega
    lojaWhatsApp: "5551995624230",
    lojaNome: "Agro Salinas (William & Meire)",

    // Vendedor padrão caso o cliente acesse o link sem indicação
    defaultVendedor: {
        code: "GREG",
        name: "Grégory",
        whatsapp: "5551982199486"
    }
};

function findVendedorByCode(code) {
    if (!code) return null;
    const clean = code.toString().trim().toUpperCase();
    return VENDEDORES.find(v => v.code === clean && v.active) || null;
}

// --- CONFIGURAÇÃO DE VALIDADE DO LINK DE VENDEDOR (30 DIAS) ---
const LINK_CONFIG = {
    validityDays: 30,
    validityMs: 30 * 24 * 60 * 60 * 1000
};

// Gera URL completa com validade de 30 dias embutida
function generateSellerLink(sellerCode, timestampMs = Date.now(), baseUrl = "") {
    if (!baseUrl) {
        if (typeof window !== "undefined") {
            baseUrl = window.location.origin + window.location.pathname.replace("vendedor.html", "").replace(/\/$/, "");
        } else {
            baseUrl = "";
        }
    }
    const cleanCode = (sellerCode || "greg").toString().trim().toLowerCase();
    // Guardamos o timestamp em segundos codificado em base36 (ex: ?v=greg&t=m2j4xk)
    const timeSec = Math.floor(timestampMs / 1000);
    const token = timeSec.toString(36);
    return `${baseUrl}/?v=${cleanCode}&t=${token}`;
}

// Valida a expiração do link (30 dias a partir da criação ou do primeiro acesso)
function validateSellerLink(timeToken, firstAccessFallbackMs = null) {
    const now = Date.now();
    let createdAtMs = null;

    if (timeToken) {
        const parsedSec = parseInt(timeToken, 36);
        if (!isNaN(parsedSec) && parsedSec > 1600000000) {
            createdAtMs = parsedSec * 1000;
        } else {
            const parsedNum = Number(timeToken);
            if (!isNaN(parsedNum) && parsedNum > 1600000000000) {
                createdAtMs = parsedNum;
            }
        }
    }

    if (!createdAtMs && firstAccessFallbackMs) {
        const fallbackNum = Number(firstAccessFallbackMs);
        if (!isNaN(fallbackNum) && fallbackNum > 1600000000000) {
            createdAtMs = fallbackNum;
        }
    }

    if (!createdAtMs) {
        createdAtMs = now;
    }

    const expiresAtMs = createdAtMs + LINK_CONFIG.validityMs;
    const isExpired = now > expiresAtMs;
    const remainingMs = Math.max(0, expiresAtMs - now);
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    return {
        valid: !isExpired,
        expired: isExpired,
        createdAt: new Date(createdAtMs),
        expiresAt: new Date(expiresAtMs),
        remainingDays: remainingDays
    };
}

// --- FUNÇÕES DE COMUNICAÇÃO COM O SUPABASE ---

function getSupabaseHeaders(extra = {}) {
    return Object.assign({
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": "Bearer " + SUPABASE_CONFIG.anonKey,
        "Content-Type": "application/json"
    }, extra);
}

// 1. Sincronizar lista de vendedores da nuvem
async function syncSellersFromSupabase() {
    if (typeof fetch === "undefined") return VENDEDORES;
    try {
        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/vendedores?select=*&order=id.asc`, {
            method: "GET",
            headers: getSupabaseHeaders()
        });
        if (!res.ok) throw new Error("Falha ao buscar vendedores");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            VENDEDORES.length = 0;
            data.forEach(item => VENDEDORES.push(item));
            try {
                localStorage.setItem("agro_salinas_sellers_cache", JSON.stringify(VENDEDORES));
            } catch (e) {}
            // Se o vendedor atual na loja estiver ativo, atualiza dados de WhatsApp/Nome caso tenham mudado
            if (typeof initSeller === "function") {
                initSeller();
            }
        }
        return VENDEDORES;
    } catch (err) {
        console.warn("Usando lista local de vendedores (offline/fallback):", err.message);
        return VENDEDORES;
    }
}

// 2. Salvar/Atualizar PIN do vendedor na nuvem
async function saveSellerPinToSupabase(code, pin) {
    const clean = code.trim().toUpperCase();
    try {
        localStorage.setItem(`pin_${clean}`, pin);
        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/vendedores?code=eq.${encodeURIComponent(clean)}`, {
            method: "PATCH",
            headers: getSupabaseHeaders({ "Prefer": "return=representation" }),
            body: JSON.stringify({ pin: pin })
        });
        if (res.ok) {
            await syncSellersFromSupabase();
            return true;
        }
    } catch (err) {
        console.warn("Erro ao salvar PIN na nuvem:", err);
    }
    return false;
}

// 3. Cadastrar Novo Vendedor (Painel Admin)
async function createSellerInSupabase({ code, name, whatsapp, role = "seller" }) {
    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    const cleanPhone = whatsapp.replace(/\D/g, "");
    const finalPhone = cleanPhone.startsWith("55") ? cleanPhone : "55" + cleanPhone;

    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/vendedores`, {
        method: "POST",
        headers: getSupabaseHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({
            code: cleanCode,
            name: name.trim(),
            whatsapp: finalPhone,
            role: role,
            active: true
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Erro ao cadastrar vendedor");
    }

    await syncSellersFromSupabase();
    return await res.json();
}

// 4. Ativar / Desativar Vendedor ou Resetar PIN (Painel Admin)
async function updateSellerInSupabase(code, fields) {
    const clean = code.trim().toUpperCase();
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/vendedores?code=eq.${encodeURIComponent(clean)}`, {
        method: "PATCH",
        headers: getSupabaseHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify(fields)
    });
    if (!res.ok) throw new Error("Erro ao atualizar vendedor");
    await syncSellersFromSupabase();
    return await res.json();
}

// 5. Registrar Pedido no Banco de Dados (Disparado no Checkout do Carrinho)
async function saveOrderToSupabase(orderPayload) {
    try {
        const bodyData = {
            seller_code: (orderPayload.seller_code || "GREG").toUpperCase(),
            seller_name: orderPayload.seller_name || "Grégory",
            customer_name: orderPayload.customer_name || "Cliente",
            customer_phone: orderPayload.customer_phone || "",
            fulfillment_type: orderPayload.fulfillment_type || "Retirada no Balcão",
            address_details: orderPayload.address_details || "",
            payment_method: orderPayload.payment_method || "PIX",
            items_json: orderPayload.items_json || [],
            items_summary: orderPayload.items_summary || "",
            total_price: Number(orderPayload.total_price) || 0,
            status: "pendente"
        };

        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/pedidos`, {
            method: "POST",
            headers: getSupabaseHeaders({ "Prefer": "return=minimal" }),
            body: JSON.stringify(bodyData),
            keepalive: true // Garante envio mesmo quando o navegador abre o app do WhatsApp
        });
        return res.ok;
    } catch (err) {
        console.warn("Não foi possível registrar pedido na nuvem:", err);
        return false;
    }
}

// 6. Buscar Pedidos por Mês e/ou Vendedor
async function fetchOrdersFromSupabase({ yearMonth = "", sellerCode = "" } = {}) {
    let url = `${SUPABASE_CONFIG.url}/rest/v1/pedidos?select=*&order=created_at.desc`;

    if (sellerCode && sellerCode !== "ALL") {
        url += `&seller_code=eq.${encodeURIComponent(sellerCode.toUpperCase())}`;
    }

    if (yearMonth) {
        // yearMonth no formato "YYYY-MM"
        const [year, month] = yearMonth.split("-").map(Number);
        if (year && month) {
            const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
            const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
            url += `&created_at=gte.${encodeURIComponent(startDate)}&created_at=lt.${encodeURIComponent(endDate)}`;
        }
    }

    const res = await fetch(url, {
        method: "GET",
        headers: getSupabaseHeaders()
    });
    if (!res.ok) throw new Error("Erro ao carregar pedidos");
    return await res.json();
}

// 7. Atualizar Status do Pedido (pendente | concluido | cancelado)
async function updateOrderStatusInSupabase(orderId, newStatus) {
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: getSupabaseHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error("Erro ao atualizar status do pedido");
    return await res.json();
}

// Dispara sincronização silenciosa ao carregar no navegador
if (typeof window !== "undefined") {
    syncSellersFromSupabase();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        VENDEDORES,
        VENDAS_CONFIG,
        SUPABASE_CONFIG,
        findVendedorByCode,
        syncSellersFromSupabase,
        saveSellerPinToSupabase,
        createSellerInSupabase,
        updateSellerInSupabase,
        saveOrderToSupabase,
        fetchOrdersFromSupabase,
        updateOrderStatusInSupabase,
        LINK_CONFIG,
        generateSellerLink,
        validateSellerLink
    };
}
