# 📊 Painel de Regulação RHCCC | Ministério Público SP
### Versão Pública Anonimizada para GitHub Pages

Este diretório contém a versão do **Dashboard de Regulação Oncológica RHCCC** especialmente estruturada para hospedagem e visualização pública no **GitHub Pages**, com **estrita conformidade à Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/18) e às regras de sigilo em saúde pública**.

---

## 🛡️ Segurança & Privacidade por Design (*Privacy by Design*)

Nesta versão para a nuvem pública:
- **ZERO microdados:** Não há nomes, números de prontuário, identificadores de pacientes ou datas pontuais de atendimentos individuais.
- **Apenas agregações estatísticas:** O arquivo `dados_estatisticos.js` contém exclusivamente totais, percentuais de conformidade, médias, medianas, percentis, distribuições em faixas e resumos por especialidade/município.
- **Proteção do arquivo bruto:** A planilha original `.xlsx` e o `data.js` com dados individuais permanecem única e exclusivamente no seu computador local e estão bloqueados no `.gitignore`.

---

## 📁 Estrutura desta Pasta (`GitHub/`)

| Arquivo | Descrição |
| :--- | :--- |
| **`index.html`** | Interface visual do painel analítico (pronta para o GitHub Pages). |
| **`style.css`** | Folha de estilos moderna com suporte a modo escuro/claro e impressão formal. |
| **`app.js`** | Controlador JavaScript reativo que alimenta os 12 cards de KPI, gráficos e tabelas. |
| **`dados_estatisticos.js`** | Base anonimizada contendo todos os indicadores pré-calculados. |
| **`gerar_dados_anonimos.py`** | Script Python local que lê a base e atualiza o `dados_estatisticos.js`. |
| **`atualizar_anonimos.bat`** | Atalho Windows (duplo clique) para rodar o script de atualização sem abrir terminal. |
| **`.gitignore`** | Impede que planilhas `.xlsx` ou arquivos brutos sejam enviados ao Git por engano. |

---

## 🚀 Como Publicar no GitHub Pages (Passo a Passo)

### 1. Criar o repositório no GitHub
1. Acesse sua conta no [GitHub](https://github.com/) e clique em **New Repository** (Novo Repositório).
2. Dê um nome (por exemplo: `painel-rhccc-mpsp`).
3. Você pode optar por deixar o repositório **Public** (Público) sem qualquer receio de vazamento, pois esta pasta só possui dados agregados.
4. Não marque a opção de adicionar README nem .gitignore (já temos prontos aqui).
5. Clique em **Create repository**.

### 2. Subir os arquivos desta pasta
No terminal (PowerShell ou Git Bash) **dentro desta pasta `GitHub`**:

```bash
git init
git add .
git commit -m "Publicação inicial do Painel Estatístico RHCCC - MPSP"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/painel-rhccc-mpsp.git
git push -u origin main
```

*(Substitua `SEU-USUARIO` e `painel-rhccc-mpsp` pelos dados do seu repositório)*

### 3. Ativar o GitHub Pages
1. No seu repositório no GitHub, clique na aba **Settings** (Configurações).
2. No menu lateral esquerdo, clique em **Pages**.
3. Na seção **Build and deployment**:
   - **Source:** Selecione `Deploy from a branch`.
   - **Branch:** Selecione `main` e a pasta `/ (root)`.
4. Clique em **Save**.
5. Aguarde cerca de 1 a 2 minutos. O GitHub exibirá o link público do seu painel:
   `https://SEU-USUARIO.github.io/painel-rhccc-mpsp/`

---

## 🔄 Como Atualizar os Dados no Futuro

Sempre que você atualizar a planilha original (`dados de regulação.xlsx`) e gerar novos dados no seu projeto local:

1. Dê um duplo clique no arquivo **`atualizar_anonimos.bat`** (ou execute `python gerar_dados_anonimos.py`).
2. O script lerá a base atualizada e recalculará instantaneamente o `dados_estatisticos.js`.
3. Envie a atualização para o GitHub executando:
   ```bash
   git add dados_estatisticos.js
   git commit -m "Atualização periódica dos indicadores estatísticos"
   git push
   ```
4. O GitHub Pages atualizará o painel online automaticamente em poucos segundos!
