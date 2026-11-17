import crypto from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

let hasWarnedFallbackKey = false;

/**
 * Resolve a chave mestra de 32 bytes (256 bits) compatível entre Node.js e Python.
 * Aceita hex (64 chars), utf8 (32 bytes), base64 (32 bytes) ou deriva SHA-256 de segredo arbitrário.
 */
export const resolveMasterKey = (masterKeyOverride = null) => {
    const rawKey = masterKeyOverride ?? process.env.ENCRYPTION_MASTER_KEY;

    if (Buffer.isBuffer(rawKey)) {
        if (rawKey.length === 32) return rawKey;
        return crypto.createHash('sha256').update(rawKey).digest();
    }

    if (typeof rawKey === 'string' && rawKey.trim() !== '') {
        const trimmed = rawKey.trim();

        if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
            return Buffer.from(trimmed, 'hex');
        }

        if (Buffer.byteLength(trimmed, 'utf8') === 32) {
            return Buffer.from(trimmed, 'utf8');
        }

        try {
            const b64 = Buffer.from(trimmed, 'base64');
            if (b64.length === 32 && b64.toString('base64').replace(/=+$/, '') === trimmed.replace(/=+$/, '')) {
                return b64;
            }
        } catch {
            // Segue para derivação SHA-256
        }

        return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
    }

    if (!hasWarnedFallbackKey) {
        hasWarnedFallbackKey = true;
        console.warn('[CredentialVaultService] ENCRYPTION_MASTER_KEY não definida; usando chave derivada de desenvolvimento/teste.');
    }

    const fallbackSeed = process.env.JWT_SECRET || 'advdocs-dev-vault-master-key-configure-em-producao';
    return crypto.createHash('sha256').update(fallbackSeed, 'utf8').digest();
};

/**
 * Criptografa dados binários (Buffer .pfx) ou textuais/JSON usando AES-256-GCM em memória.
 * Retorna exatamente os campos compatíveis com a tabela `credenciais_tribunal`.
 */
export const encrypt = (plainInput, masterKeyOverride = null) => {
    if (plainInput === undefined || plainInput === null) {
        throw new Error('Conteúdo para criptografia não pode ser nulo ou indefinido.');
    }

    const key = resolveMasterKey(masterKeyOverride);
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);

    let bufferEntrada;
    if (Buffer.isBuffer(plainInput)) {
        bufferEntrada = plainInput;
    } else if (typeof plainInput === 'object') {
        bufferEntrada = Buffer.from(JSON.stringify(plainInput), 'utf8');
    } else {
        bufferEntrada = Buffer.from(String(plainInput), 'utf8');
    }

    const cipher = crypto.createCipheriv(ALGORITMO, key, iv);
    const encrypted = Buffer.concat([cipher.update(bufferEntrada), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        payload_criptografado: encrypted,
        iv_hex: iv.toString('hex'),
        auth_tag_hex: authTag.toString('hex')
    };
};

/**
 * Descriptografa registro do cofre exclusivamente em memória.
 */
export const decrypt = (record, { asBuffer = false, masterKeyOverride = null } = {}) => {
    if (!record || typeof record !== 'object') {
        throw new Error('Registro criptografado inválido.');
    }

    const { payload_criptografado, iv_hex, auth_tag_hex } = record;

    if (typeof iv_hex !== 'string' || !/^[0-9a-fA-F]{24}$/.test(iv_hex.trim())) {
        throw new Error('IV inválido (esperado 24 caracteres hexadecimais / 12 bytes).');
    }

    if (typeof auth_tag_hex !== 'string' || !/^[0-9a-fA-F]{32}$/.test(auth_tag_hex.trim())) {
        throw new Error('Auth tag inválida (esperado 32 caracteres hexadecimais / 16 bytes).');
    }

    if (!payload_criptografado) {
        throw new Error('Payload criptografado ausente.');
    }

    const payloadBuffer = Buffer.isBuffer(payload_criptografado)
        ? payload_criptografado
        : Buffer.from(payload_criptografado);

    const key = resolveMasterKey(masterKeyOverride);
    const iv = Buffer.from(iv_hex.trim(), 'hex');
    const authTag = Buffer.from(auth_tag_hex.trim(), 'hex');

    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
        throw new Error('Tamanho de IV ou Auth Tag inconsistente com AES-256-GCM.');
    }

    const decipher = crypto.createDecipheriv(ALGORITMO, key, iv);
    decipher.setAuthTag(authTag);

    const plainBuffer = Buffer.concat([decipher.update(payloadBuffer), decipher.final()]);
    return asBuffer ? plainBuffer : plainBuffer.toString('utf8');
};

export const encryptCredentialsJson = (dadosCredenciais, masterKeyOverride = null) => {
    if (!dadosCredenciais || typeof dadosCredenciais !== 'object' || Buffer.isBuffer(dadosCredenciais)) {
        throw new Error('Objeto JSON de credenciais inválido.');
    }
    return encrypt(JSON.stringify(dadosCredenciais), masterKeyOverride);
};

export const decryptCredentialsJson = (record, masterKeyOverride = null) => {
    const jsonString = decrypt(record, { asBuffer: false, masterKeyOverride });
    return JSON.parse(jsonString);
};

export const CredentialVaultService = {
    resolveMasterKey,
    encrypt,
    decrypt,
    encryptCredentialsJson,
    decryptCredentialsJson
};

export default CredentialVaultService;
