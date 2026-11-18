-- Migration 001: Motor Híbrido de Consulta e Monitoramento Processual (advDocs)

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
