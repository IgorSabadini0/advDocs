# Especificação Técnica: Motor Híbrido de Consulta e Monitoramento Processual (advDocs)

> **Instrução para o Agente de IA:** Este documento define a arquitetura, a modelagem de dados, os requisitos de segurança e o roteiro de implementação do subsistema de captura e atualização de processos judiciais do **advDocs**, com foco prioritário no **TRF3 (Tribunal Regional Federal da 3ª Região — SP/MS)** e suporte extensível aos demais tribunais. Implemente o sistema seguindo rigorosamente as 6 fases descritas na Seção 8, mantendo desacoplamento entre provedores de dados, processamento assíncrono em fila e idempotência na gravação de movimentações e documentos.

---

## 1. Visão Geral e Objetivos da Arquitetura

O objetivo deste módulo é permitir que o **advDocs** consulte e monitore processos judiciais pelo número CNJ ou pela OAB do advogado, capturando capa, partes, movimentações, teor completo de decisões/intimações e documentos em PDF, inclusive em processos com segredo de justiça.

Para evitar o alto custo de manutenção de centenas de *scrapers* e superar as limitações da API Pública do DataJud, o sistema utilizará o padrão **Strategy + Chain of Responsibility (Fallback Híbrido)** dividido em 4 camadas de captura:

1. **Camada 1 — API Pública do DataJud (CNJ):** Consulta rápida e gratuita para validação do número CNJ, dados básicos da capa, classe, assunto, órgão julgador e histórico de códigos de movimentação (Tabelas Processuais Unificadas - TPU).
2. **Camada 2 — Protocolo MNI 2.2.2 (SOAP/XML + Certificado Digital A1 / 2FA):** Consulta oficial direta no PJe do **TRF3** (1º e 2º Graus) e demais tribunais compatíveis usando autenticação mTLS/PKCS#12 (`.pfx`). Permite acessar processos em segredo de justiça, teor completo de movimentações, intimações e baixar peças em PDF sob demanda sem usar *web scraping* nem esbarrar em CAPTCHAs.
3. **Camada 3 — Scrapers Cirúrgicos (Playwright + TOTP/Certificado):** Automação de navegador isolada para a Consulta Pública do PJe TRF3 (quando não houver Certificado A1 disponível ou o MNI oscilar) e para tribunais estaduais críticos que não expõem o MNI completo (ex.: e-SAJ / TJSP).
4. **Camada 4 — Adaptador para API Agregadora B2B (Opcional/Webhook):** Interface padronizada pronta para receber *webhooks* de provedores externos (ex.: Judit, Escavador, Codilo) caso o escritório ative captura terceirizada para varredura em lote por OAB ou Diários Oficiais.

---

## 2. Stack Tecnológica do Módulo

* **Backend Principal / API Gateway:** Node.js (Express ou Fastify) — responsável pelos endpoints REST, autenticação de usuários, gerenciamento do cofre de credenciais e enfileiramento de jobs.
* **Fila de Mensagens e Rate Limiting:** Redis + BullMQ (ou fila transacional no MySQL com `SELECT ... FOR UPDATE SKIP LOCKED`).
* **Workers de Captura (DataJud, MNI e Scrapers):** Python 3.11+ — escolhido pela maturidade das bibliotecas `zeep` / `requests_pkcs12` / `cryptography` (para SOAP/MNI com Certificado A1 em memória), `playwright` (para automação de portais) e `pyotp` (para geração automática de código 2FA do PJe/eproc).
* **Banco de Dados Relacional:** MySQL 8.0+ — persistência transacional com deduplicação baseada em hash criptográfico (`SHA-256`).

---

## 3. Roteamento Inteligente pelo Número CNJ e Mapeamento do TRF3

Todo número de processo no padrão CNJ possui 20 dígitos no formato:
`NNNNNNN-DD.AAAA.J.TR.OOOO`

O sistema deve implementar um utilitário `CNJParser` antes de qualquer consulta externa:

1. **Validação de Dígito Verificador (`DD`):** Validar o cálculo módulo $97$ conforme Resolução CNJ nº 65/2008 antes de enfileirar qualquer requisição.
2. **Identificação de Justiça (`J`) e Tribunal (`TR`):**
   * `J = 4`, `TR = 03` $\rightarrow$ **TRF3 (Justiça Federal da 3ª Região - SP/MS)** — **Tribunal Prioritário**.
   * `J = 4`, `TR = 01` $\rightarrow$ **TRF1** (Roteia para DataJud `api_publica_trf1` + Conector MNI PJe).
   * `J = 8`, `TR = 26` $\rightarrow$ **TJSP** (Roteia para DataJud `api_publica_tjsp` + Scraper e-SAJ).
   * `J = 5`, `TR = XX` $\rightarrow$ **Justiça do Trabalho / TRT** (Roteia para DataJud `api_publica_trtXX` + MNI/PJe).

### 3.1. Endpoints Oficiais do TRF3 (`J = 4`, `TR = 03`)

Como o TRF3 separa o PJe de 1º Grau (Varas Federais e Juizados Especiais Federais) e de 2º Grau (Turmas e Seções no Tribunal) em instâncias distintas, o conector do TRF3 deve consultar o 1º Grau por padrão e, caso deseje sincronizar recursos/apelações ou o processo seja originário do Tribunal (`OOOO = 0000` ou indicado nos metadados), consultar também o 2º Grau:

* **DataJud (1º e 2º Graus unificados no índice):**
  * `POST https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search`
* **Protocolo MNI 2.2.2 (SOAP/WSDL) — TRF3 1º Grau:**
  * `https://pje1g.trf3.jus.br/pje/intercomunicacao?wsdl`
* **Protocolo MNI 2.2.2 (SOAP/WSDL) — TRF3 2º Grau:**
  * `https://pje2g.trf3.jus.br/pje/intercomunicacao?wsdl`
* **Consulta Pública PJe (Fallback Playwright) — TRF3 1º e 2º Graus:**
  * 1º Grau: `https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam`
  * 2º Grau: `https://pje2g.trf3.jus.br/pje/ConsultaPublica/listView.seam`

---

## 4. Modelagem do Banco de Dados (MySQL 8.0+)

Execute as *migrations* abaixo para criar a estrutura base. **Regra crítica:** As tabelas `processo_movimentacoes` e `processo_documentos` nunca devem permitir duplicatas caso o *worker* rode várias vezes no mesmo dia.

```sql
-- 1. Tabela Principal de Processos
CREATE TABLE IF NOT EXISTS processos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    escritorio_id BIGINT UNSIGNED NOT NULL,
    numero_cnj CHAR(20) NOT NULL COMMENT 'Apenas números, sem máscara (20 dígitos)',
    numero_cnj_formatado VARCHAR(25) NOT NULL,
    justica_codigo CHAR(1) NOT NULL,
    tribunal_codigo CHAR(2) NOT NULL,
    tribunal_sigla VARCHAR(15) NOT NULL COMMENT 'Ex: TRF3, TJSP, TRF1',
    instancia ENUM('1G', '2G', 'AMBAS', 'SUPERIOR') DEFAULT '1G',
    sistema_processual ENUM('PJE', 'ESAJ', 'EPROC', 'PROJUDI', 'DESCONHECIDO') DEFAULT 'PJE',
    classe_processual VARCHAR(255) NULL,
    assunto_principal VARCHAR(255) NULL,
    orgao_julgador VARCHAR(255) NULL,
    valor_causa DECIMAL(15, 2) NULL,
    segredo_justica BOOLEAN DEFAULT FALSE,
    data_distribuicao DATETIME NULL,
    monitoramento_ativo BOOLEAN DEFAULT TRUE,
    status_sincronizacao ENUM('PENDENTE', 'SINCRONIZANDO', 'ATUALIZADO', 'ERRO', 'AGUARDANDO_CREDENCIAL') DEFAULT 'PENDENTE',
    ultima_sincronizacao_em DATETIME NULL,
    ultimo_erro TEXT NULL,
    hash_capa CHAR(64) NULL COMMENT 'SHA-256 do payload da capa para detectar alterações',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_escritorio_processo (escritorio_id, numero_cnj),
    INDEX idx_status_sync (monitoramento_ativo, status_sincronizacao, ultima_sincronizacao_em),
    INDEX idx_tribunal (tribunal_sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Partes e Advogados do Processo
CREATE TABLE IF NOT EXISTS processo_partes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    processo_id BIGINT UNSIGNED NOT NULL,
    polo ENUM('ATIVO', 'PASSIVO', 'TERCEIRO', 'OUTRO') NOT NULL,
    tipo_participacao VARCHAR(100) NULL COMMENT 'Ex: Autor, Réu, Perito, Apelante, Apelado',
    nome VARCHAR(255) NOT NULL,
    documento_cpf_cnpj VARCHAR(20) NULL,
    advogados_json JSON NULL COMMENT 'Lista de advogados [{nome, oab, uf}]',
    hash_parte CHAR(64) NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_processo_parte (processo_id, hash_parte),
    CONSTRAINT fk_partes_processo FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Movimentações / Andamentos Processuais (Idempotente)
CREATE TABLE IF NOT EXISTS processo_movimentacoes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    processo_id BIGINT UNSIGNED NOT NULL,
    instancia ENUM('1G', '2G', 'SUPERIOR') DEFAULT '1G',
    data_movimentacao DATETIME NOT NULL,
    codigo_cnj INT UNSIGNED NULL COMMENT 'Código TPU do CNJ quando disponível',
    titulo VARCHAR(500) NOT NULL,
    teor_completo LONGTEXT NULL COMMENT 'Texto integral do despacho, decisão ou intimação',
    fonte_captura ENUM('DATAJUD', 'MNI', 'SCRAPER', 'WEBHOOK_EXTERNO') NOT NULL,
    possui_anexo BOOLEAN DEFAULT FALSE,
    lido_pelo_advogado BOOLEAN DEFAULT FALSE,
    hash_unico CHAR(64) NOT NULL COMMENT 'SHA-256(processo_id + instancia + data_iso + codigo_cnj + titulo_normalizado)',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_movimentacao_idempotente (processo_id, hash_unico),
    INDEX idx_data_movimentacao (processo_id, data_movimentacao DESC),
    INDEX idx_nao_lidos (processo_id, lido_pelo_advogado),
    CONSTRAINT fk_mov_processo FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Documentos e Peças Processuais (Download Sob Demanda via MNI)
CREATE TABLE IF NOT EXISTS processo_documentos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    processo_id BIGINT UNSIGNED NOT NULL,
    movimentacao_id BIGINT UNSIGNED NULL,
    instancia ENUM('1G', '2G', 'SUPERIOR') DEFAULT '1G',
    id_documento_tribunal VARCHAR(100) NOT NULL COMMENT 'ID único do documento no PJe/MNI',
    tipo_documento VARCHAR(150) NULL COMMENT 'Ex: Sentença, Petição Inicial, Certidão',
    descricao VARCHAR(255) NULL,
    data_juntada DATETIME NULL,
    mimetype VARCHAR(100) DEFAULT 'application/pdf',
    hash_documento_tribunal VARCHAR(128) NULL,
    baixado BOOLEAN DEFAULT FALSE,
    caminho_storage VARCHAR(500) NULL COMMENT 'Caminho no storage local/S3 após download sob demanda',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_processo_doc_tribunal (processo_id, instancia, id_documento_tribunal),
    CONSTRAINT fk_doc_processo FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_movimentacao FOREIGN KEY (movimentacao_id) REFERENCES processo_movimentacoes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Cofre de Credenciais dos Tribunais (Criptografia AES-256-GCM)
CREATE TABLE IF NOT EXISTS credenciais_tribunal (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    escritorio_id BIGINT UNSIGNED NOT NULL,
    tribunal_sigla VARCHAR(15) NOT NULL COMMENT 'Ex: TRF3, TJSP ou GLOBAL para Certificado A1 único',
    tipo_autenticacao ENUM('CERTIFICADO_A1', 'CPF_SENHA', 'CPF_SENHA_TOTP') NOT NULL,
    titular_cpf_cnpj VARCHAR(20) NULL,
    payload_criptografado LONGBLOB NOT NULL COMMENT 'JSON ou binário .pfx criptografado com AES-256-GCM',
    iv_hex CHAR(24) NOT NULL COMMENT 'Initialization Vector de 12 bytes em Hex',
    auth_tag_hex CHAR(32) NOT NULL COMMENT 'Authentication Tag de 16 bytes em Hex',
    validade_certificado DATETIME NULL,
    ativo BOOLEAN DEFAULT TRUE,
    ultimo_uso_em DATETIME NULL,
    status_credencial ENUM('VALIDA', 'EXPIRADA', 'ERRO_AUTENTICACAO') DEFAULT 'VALIDA',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_escritorio_tribunal (escritorio_id, tribunal_sigla, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Histórico e Fila de Jobs de Sincronização
CREATE TABLE IF NOT EXISTS jobs_sincronizacao (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    processo_id BIGINT UNSIGNED NOT NULL,
    tipo_job ENUM('SYNC_PROCESSO', 'DOWNLOAD_DOCUMENTO') DEFAULT 'SYNC_PROCESSO',
    fonte_utilizada ENUM('DATAJUD', 'MNI', 'SCRAPER', 'WEBHOOK_EXTERNO') NOT NULL,
    parametros_json JSON NULL COMMENT 'Ex: {"id_documento_tribunal": "12345", "instancia": "1G"}',
    status ENUM('EM_FILA', 'PROCESSANDO', 'SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_PERMANENTE') NOT NULL DEFAULT 'EM_FILA',
    tentativa_atual TINYINT UNSIGNED DEFAULT 1,
    max_tentativas TINYINT UNSIGNED DEFAULT 5,
    proxima_execucao_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    tempo_execucao_ms INT UNSIGNED NULL,
    novas_movimentacoes_inseridas INT UNSIGNED DEFAULT 0,
    codigo_http_ou_soap VARCHAR(50) NULL,
    mensagem_erro TEXT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    finalizado_em DATETIME NULL,
    INDEX idx_fila_execucao (status, proxima_execucao_em),
    INDEX idx_processo_jobs (processo_id, criado_em DESC),
    CONSTRAINT fk_jobs_processo FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 5. Contrato Padronizado de Dados (DTO / Schema Interno)

Todo conector (`DatajudProvider`, `MniTrf3Provider`, `PjeTrf3ScraperProvider`, `WebhookProvider`) deve transformar a resposta bruta do tribunal para o formato JSON padronizado abaixo antes de enviá-lo ao serviço de persistência:

```json
{
  "numero_cnj": "50012345620254036100",
  "tribunal_sigla": "TRF3",
  "instancia": "1G",
  "sistema_processual": "PJE",
  "segredo_justica": false,
  "capa": {
    "classe_processual": "PROCEDIMENTO COMUM CÍVEL",
    "assunto_principal": "Concessão de Benefício Previdenciário",
    "orgao_julgador": "1ª Vara Federal Previdenciária de São Paulo",
    "valor_causa": 75400.00,
    "data_distribuicao": "2025-02-10T11:15:00Z"
  },
  "partes": [
    {
      "polo": "ATIVO",
      "tipo_participacao": "AUTOR",
      "nome": "JOÃO DA SILVA",
      "documento_cpf_cnpj": "12345678900",
      "advogados": [
        { "nome": "ADVOGADO DO ESCRITÓRIO", "oab": "999999", "uf": "SP" }
      ]
    },
    {
      "polo": "PASSIVO",
      "tipo_participacao": "RÉU",
      "nome": "INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS",
      "documento_cpf_cnpj": "29979036000140",
      "advogados": []
    }
  ],
  "movimentacoes": [
    {
      "instancia": "1G",
      "data_movimentacao": "2026-11-16T16:40:00Z",
      "codigo_cnj": 12200,
      "titulo": "Intimação eletrônica expedida/certificada",
      "teor_completo": "Intimação da parte autora para manifestação sobre o laudo pericial no prazo de 15 dias.",
      "fonte_captura": "MNI",
      "documentos_vinculados": [
        {
          "id_documento_tribunal": "319482719",
          "tipo_documento": "Laudo Pericial",
          "descricao": "Laudo Médico Judicial",
          "data_juntada": "2026-11-16T16:35:00Z",
          "mimetype": "application/pdf"
        }
      ]
    }
  ]
}
```

### Regra de Cálculo do Hash de Deduplicação (`hash_unico`)

Para cada movimentação recebida:

1. Normalize o `titulo` (minúsculas, sem acentos, sem espaços duplicados).
2. Trunque `data_movimentacao` para `YYYY-MM-DD`.
3. Calcule `SHA-256(processo_id + "|" + instancia + "|" + data_truncada + "|" + COALESCE(codigo_cnj, 0) + "|" + titulo_normalizado)`.
4. Se a movimentação vier primeiro do `DATAJUD` (sem `teor_completo`) e em seguida o `MNI` do TRF3 trouxer a mesma movimentação na mesma data com `teor_completo` e `possui_anexo`, a query SQL deve executar:
   ```sql
   INSERT INTO processo_movimentacoes (...) VALUES (...)
   ON DUPLICATE KEY UPDATE
     teor_completo = COALESCE(VALUES(teor_completo), teor_completo),
     possui_anexo = GREATEST(possui_anexo, VALUES(possui_anexo)),
     fonte_captura = IF(VALUES(teor_completo) IS NOT NULL, VALUES(fonte_captura), fonte_captura);
   ```

---

## 6. Especificação dos Conectores de Captura (Foco TRF3)

### 6.1. Conector 1: API Pública do DataJud (`api_publica_trf3`)

* **Endpoint TRF3:** `https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search`
* **Boas Práticas de Query (Evitar Erro `429` e *Timeouts*):**
  * Nunca usar `match` simples; usar filtro booleano exato (`term`) no campo `numeroProcesso`.
  * Restringir os campos retornados com `_source` para economizar banda e memória na fila do Elasticsearch do CNJ:
  ```json
  {
    "size": 5,
    "_source": [
      "numeroProcesso",
      "grau",
      "classe.nome",
      "sistema.nome",
      "orgaoJulgador.nome",
      "dataAjuizamento",
      "assuntos.nome",
      "movimentos.codigo",
      "movimentos.nome",
      "movimentos.dataHora",
      "movimentos.complementosTabelados"
    ],
    "query": {
      "bool": {
        "filter": [
          { "term": { "numeroProcesso": "50012345620254036100" } }
        ]
      }
    }
  }
  ```
  *(Nota: `size: 5` no TRF3 permite receber na mesma resposta tanto o registro de 1º Grau `G1` quanto eventual recurso no 2º Grau `G2` ou Turma Recursal `TR`).*
* **Política de Retry (Backoff Exponencial com Jitter):**
  * Se receber HTTP `429`, `502`, `503` ou `504`, reagendar o job aplicando tempo de espera calculado por:
    $$t = b \cdot 2^{n} + \text{random}(0, 1000)\text{ ms}$$
    onde $b = 5000\text{ ms}$ (base de $5\text{ segundos}$) e $n$ é o número da tentativa (máximo de $5$ tentativas).

### 6.2. Conector 2: Protocolo MNI 2.2.2 TRF3 (SOAP/XML + Certificado A1)

* **Endpoints WSDL TRF3:**
  * 1º Grau: `https://pje1g.trf3.jus.br/pje/intercomunicacao?wsdl`
  * 2º Grau: `https://pje2g.trf3.jus.br/pje/intercomunicacao?wsdl`
* **Operação de Sincronização de Metadados e Andamentos (`consultarProcesso`):**
  * `idConsultante`: CPF do advogado titular do certificado (apenas 11 dígitos).
  * `senhaConsultante`: Senha ou vazio quando autenticado via TLS mútuo (mTLS) com Certificado A1.
  * `numeroProcesso`: 20 dígitos numéricos.
  * `movimentos`: `True`
  * `incluirCabecalho`: `True`
  * `incluirDocumentos`: `False` (na varredura diária, listar apenas os metadados dos documentos ou solicitar os IDs específicos).
* **Operação de Download de PDF Sob Demanda (`consultarProcesso` com `documento`):**
  * Quando o advogado clicar para abrir uma peça ou sentença no **advDocs**, enfileirar um job `DOWNLOAD_DOCUMENTO` passando o `id_documento_tribunal` na tag `<documento>` da requisição SOAP MNI, decodificar o binário Base64/MTOM retornado e salvar no storage seguro do **advDocs**.
* **Segurança em Memória:** O *worker* Python deve descriptografar o arquivo `.pfx` do banco de dados **exclusivamente em memória** (usando `cryptography.hazmat.primitives.serialization.pkcs12` + `SSLContext` em memória ou arquivo temporário em `/dev/shm` removido imediatamente no bloco `finally`), nunca gravando a chave privada em disco permanente.

### 6.3. Conector 3: Scraper Cirúrgico Playwright (PJe TRF3 e e-SAJ)

* **Escopo Inicial:**
  1. Consulta Pública do PJe TRF3 (`pje1g.trf3.jus.br` e `pje2g.trf3.jus.br`) como *fallback* caso o MNI apresente instabilidade.
  2. Portal e-SAJ (TJSP) para processos estaduais do escritório.
* **Automação de 2FA (TOTP):** Quando o login web do PJe exigir código de 6 dígitos (2FA), o *worker* descriptografa a chave `SEED` cadastrada pelo advogado na tabela `credenciais_tribunal` e gera o token em tempo real via `pyotp.TOTP(seed).now()`.
* **Reaproveitamento de Sessão:** Salvar os cookies de sessão autenticada (`storage_state`) criptografados no Redis com TTL de $30\text{ minutos}$ para evitar múltiplos logins seguidos no mesmo tribunal.

---

## 7. Segurança e Cofre de Credenciais (LGPD)

1. **Master Key (`ENCRYPTION_MASTER_KEY`):** Chave de 32 bytes ($256\text{ bits}$) armazenada exclusivamente em variável de ambiente no servidor, nunca no banco de dados nem no repositório Git.
2. **Algoritmo:** `AES-256-GCM` (autenticado). Cada registro na tabela `credenciais_tribunal` deve gerar um `IV` aleatório único de 12 bytes (`crypto.randomBytes(12)` no Node.js / `os.urandom(12)` no Python).
3. **Validação de Certificado no Upload:** Ao receber o `.pfx` do advogado, validar em memória se a senha está correta, extrair o CPF do titular (campo `Subject` / ICP-Brasil) e preencher automaticamente `validade_certificado` e `titular_cpf_cnpj`.
4. **Sanitização de Logs:** É proibido registrar senhas, chaves TOTP, conteúdo binário de certificados `.pfx` ou headers `Authorization` nos logs da aplicação ou na tabela `jobs_sincronizacao`.

---

## 8. Roteiro de Implementação para o Agente de IA (Passo a Passo)

> **Instrução de Execução:** Inspecione primeiro a estrutura de pastas atual do **advDocs**. Execute uma fase por vez. Ao concluir cada fase, rode os testes de validação antes de avançar para a próxima.

### Fase 1: Fundação, Banco de Dados e Parser CNJ (com Regra TRF3)

* [ ] Criar e aplicar as *migrations* SQL da Seção 4 no MySQL do **advDocs**.
* [ ] Implementar o serviço `CredentialVaultService` (compatível entre Node.js e Python) usando `AES-256-GCM` para criptografar e descriptografar `.pfx`, senhas e seeds TOTP.
* [ ] Implementar o utilitário `CNJParser` que valida o dígito verificador módulo $97$, remove pontuação e identifica automaticamente `J = 4, TR = 03` como `TRF3` (além dos demais tribunais).
* [ ] Implementar o gerador determinístico de `hash_unico` (`SHA-256`) para partes e movimentações.
* **Critério de Aceite da Fase 1:** Testes unitários aprovados validando números CNJ reais do TRF3, criptografia/descriptografia `AES-256-GCM` em memória e geração idempotente de hash.

### Fase 2: Infraestrutura de Fila Assíncrona e Persistência Idempotente

* [ ] Configurar o *worker* e a fila de sincronização com controle de concorrência por tribunal (máximo de $2$ requisições simultâneas por tribunal para evitar bloqueio de WAF/IP).
* [ ] Criar o serviço `ProcessPersistenceService` que recebe o DTO padronizado da Seção 5 e executa `INSERT ... ON DUPLICATE KEY UPDATE` nas tabelas `processos`, `processo_partes`, `processo_movimentacoes` e `processo_documentos` dentro de uma transação.
* [ ] Criar os endpoints REST no backend do **advDocs**:
  * `POST /api/processos/sincronizar` (Cadastra/atualiza pelo número CNJ, enfileira a busca e retorna `202 Accepted` com `job_id`).
  * `GET /api/processos/:id/status-sincronizacao` (Consulta o status atual do job e últimas movimentações).
* **Critério de Aceite da Fase 2:** Chamada ao endpoint retorna `202 Accepted` em menos de $100\text{ ms}$ e o *worker* consome o job atualizando o status na tabela `processos`.

### Fase 3: Implementação do Conector DataJud (`api_publica_trf3` e Geral)

* [ ] Criar o dicionário de roteamento `J.TR` $\rightarrow$ endpoint DataJud (garantindo `4.03` $\rightarrow$ `api_publica_trf3`, `8.26` $\rightarrow$ `api_publica_tjsp`, `4.01` $\rightarrow$ `api_publica_trf1`, etc.).
* [ ] Implementar o `DatajudProvider` tratando múltiplos graus retornados no mesmo processo (ex.: `G1` e `G2` no TRF3), com timeout de $15\text{ segundos}$, filtro `_source` enxuto e política de *retry* com *backoff* exponencial para erros `429` e `5xx`.
* **Critério de Aceite da Fase 3:** Sincronizar um processo real do TRF3 via DataJud, gravar capa e movimentações no MySQL e rodar a sincronização uma segunda vez confirmando **zero duplicatas** no banco.

### Fase 4: Conector MNI 2.2.2 do TRF3 (`pje1g` e `pje2g`) com Certificado A1

* [ ] Criar o endpoint protegido `POST /api/credenciais/certificado-a1` para upload do arquivo `.pfx` e senha do advogado, extraindo CPF e data de validade antes de criptografar no cofre.
* [ ] Implementar o `MniTrf3Provider` em Python (`zeep` + `requests` com adaptador TLS mTLS em memória) conectando nos WSDLs `pje1g.trf3.jus.br` e `pje2g.trf3.jus.br`.
* [ ] Mapear o retorno SOAP (`dadosBasicos`, `polo`, `movimento`, `documento`) para o DTO da Seção 5, enriquecendo o `teor_completo` das movimentações e salvando a lista de documentos disponíveis em `processo_documentos`.
* [ ] Criar o endpoint `POST /api/processos/:id/documentos/:docId/baixar` que enfileira um job `DOWNLOAD_DOCUMENTO` via MNI e salva o PDF no storage do **advDocs**.
* **Critério de Aceite da Fase 4:** Consultar um processo do TRF3 usando Certificado A1 via MNI, listar os documentos juntados aos autos e baixar um PDF sob demanda com sucesso.

### Fase 5: Scraper de Fallback (Playwright) e Webhook Externo

* [ ] Implementar a classe base `BaseCourtScraper` em Python com Playwright (*headless*), bloqueio de recursos pesados (imagens/fontes) e captura automática de *screenshot* de diagnóstico em caso de erro de seletor.
* [ ] Implementar o fallback para a Consulta Pública do PJe TRF3 e o scraper do e-SAJ (TJSP).
* [ ] Criar o endpoint `POST /api/webhooks/processos` autenticado via assinatura HMAC para permitir integração futura plug-and-play com APIs agregadoras (Judit/Escavador).
* **Critério de Aceite da Fase 5:** Fallback acionado automaticamente quando um tribunal não suportar MNI, persistindo os dados no mesmo formato DTO.

### Fase 6: Agendador Diário (Cron) e Painel no Frontend do advDocs

* [ ] Criar *Cron Job* noturno (ex.: 02:00 AM) que seleciona processos com `monitoramento_ativo = TRUE` e `ultima_sincronizacao_em < NOW() - INTERVAL 24 HOUR`, distribuindo os jobs na fila de forma espaçada.
* [ ] Atualizar a interface de processos no **advDocs** para exibir o selo de sincronização (`ATUALIZADO`, `SINCRONIZANDO`, `ERRO`), indicador de novas movimentações não lidas (`lido_pelo_advogado = FALSE`), botão "Atualizar Agora" e botão "Baixar PDF" nas peças listadas pelo MNI.
* **Critério de Aceite da Fase 6:** Fluxo completo ponta a ponta validado na interface do **advDocs**.