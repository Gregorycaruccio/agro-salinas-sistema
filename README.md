# 🌾 Catálogo Digital - Agro Salinas

Sistema de catálogo web interativo para vendas com rastreamento automático de comissões para múltiplos vendedores e integração direta com o WhatsApp da loja.

---

## 📱 WhatsApp da Loja
* **Número Configurado:** `+55 (51) 99562-4230`

---

## 🚀 Como Funciona o Sistema de Múltiplos Vendedores

O catálogo funciona de forma centralizada para a **Agro Salinas**, mas cada vendedor parceiro possui um link exclusivo:

* **Seu link (Grég):** `seusite.com/?v=greg`
* **Vendedor 2:** `seusite.com/?v=maria`
* **Vendedor 3:** `seusite.com/?v=joao`
* **Loja Direta:** `seusite.com`

### 🛒 O que acontece na compra:
1. O cliente entra pelo link do vendedor (ex: `?v=greg`).
2. O topo do site mostra: `Consultor(a): Grég (#GREG)`.
3. O cliente adiciona produtos na sacola e clica em **"Pedir pelo WhatsApp"**.
4. O WhatsApp da loja (+55 51 99562-4230) abre com a mensagem formatada:

```text
*🛒 NOVO PEDIDO - AGRO SALINAS*
----------------------------------
• 1x [CÓD 257] Patê Royal Canin Gastrointestinal Cão 400g (R$ 46,50)
• 2x [CÓD 606] Pedigree Dentastix Raças Médias (3 un) (R$ 25,00)
----------------------------------
*💰 TOTAL: R$ 71,50*

🏷️ *Consultor(a) / Indicação:* Grég (#GREG)
📍 *Origem:* Catálogo Digital
```

---

## 🌐 Como Publicar Grátis na Internet (Em 1 minuto)

Você pode hospedar este catálogo gratuitamente no **Vercel**, **Netlify** ou **GitHub Pages**:

### Opção 1: Vercel (Super Rápido)
1. Crie uma conta gratuita em [vercel.com](https://vercel.com).
2. Arraste esta pasta do projeto para lá.
3. Você ganhará um link do tipo `https://agro-salinas.vercel.app`.
4. Pronto! Basta adicionar `?v=greg` no final do link e colocar no seu Linktree / Instagram.

### Opção 2: Netlify
1. Acesse [netlify.com](https://app.netlify.com/drop).
2. Arraste a pasta e o site já estará no ar com link seguro (HTTPS).

---

## 📂 Estrutura de Arquivos
* `index.html`: Página principal com navegação por categorias, sacola e busca.
* `style.css`: Estilização visual com a paleta oficial da Agro Salinas (Verde escuro, Laranja, Off-white).
* `products.js`: Banco de dados com todos os **321 produtos** extraídos do sistema da loja com códigos e preços.
* `app.js`: Lógica do carrinho, gerador de link por vendedor e automação do WhatsApp.
* `assets/logo.png`: Logotipo oficial da Agro Salinas.
