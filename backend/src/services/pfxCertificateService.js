import tls from 'node:tls';
import crypto from 'node:crypto';
import { db } from '../config/db.js';
import { CredentialVaultService } from './credentialVaultService.js';

const toMySqlDatetime = (dateInput) => {
    if (!dateInput) return null;
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Extrai CPF (11 dígitos) ou CNPJ (14 dígitos) de Subject ICP-Brasil (ex.: "CN=NOME:12345678901").
 */
export const extrairDocumentoIcpBrasil = (subject = '', subjectAltName = '', fallback = null) => {
    const combinado = `${subject || ''}\n${subjectAltName || ''}`;

    const padraoComum = combinado.match(/(?:CN\s*=|serialNumber\s*=)[^\n:]*:(\d{11}|\d{14})\b/i);
    if (padraoComum) return padraoComum[1];

    const padraoDoisPontos = combinado.match(/:(\d{11}|\d{14})(?:$|[\s,\n/])/);
    if (padraoDoisPontos) return padraoDoisPontos[1];

    if (fallback) {
        const digits = String(fallback).replace(/\D/g, '');
        if (digits.length === 11 || digits.length === 14) {
            return digits;
        }
    }

    return null;
};

/**
 * Valida arquivo `.pfx` + senha e extrai metadados X.509 exclusivamente em memória
 * usando `tls.createSecureContext` e `crypto.X509Certificate`, sem gravar chave privada em disco.
 */
export const validarEExtrairMetadadosPfx = (pfxBuffer, senha, { titularCpfCnpjFallback = null } = {}) => {
    if (!Buffer.isBuffer(pfxBuffer) || pfxBuffer.length === 0) {
        const err = new Error('Arquivo de certificado .pfx inválido ou vazio.');
        err.code = 'INVALID_PFX_BUFFER';
        throw err;
    }

    // PKCS#12 em DER sempre inicia com tag ASN.1 SEQUENCE (0x30)
    if (pfxBuffer[0] !== 0x30) {
        const err = new Error('O arquivo enviado não possui estrutura PKCS#12 (.pfx) válida.');
        err.code = 'INVALID_PFX_FORMAT';
        throw err;
    }

    if (senha === undefined || senha === null || typeof senha !== 'string') {
        const err = new Error('A senha do certificado digital é obrigatória.');
        err.code = 'MISSING_PFX_PASSWORD';
        throw err;
    }

    let secureCtx = null;
    try {
        secureCtx = tls.createSecureContext({
            pfx: pfxBuffer,
            passphrase: senha
        });

        const certDer = secureCtx.context?.getCertificate?.();
        if (!certDer) {
            const err = new Error('Não foi possível localizar o certificado X.509 dentro do arquivo .pfx.');
            err.code = 'MISSING_X509_IN_PFX';
            throw err;
        }

        const x509 = new crypto.X509Certificate(certDer);
        const validadeDate = new Date(x509.validTo);
        const expirado = !isNaN(validadeDate.getTime()) && validadeDate.getTime() < Date.now();
        const titularCpfCnpj = extrairDocumentoIcpBrasil(x509.subject, x509.subjectAltName, titularCpfCnpjFallback);

        return {
            valido: true,
            expirado,
            status_credencial: expirado ? 'EXPIRADA' : 'VALIDA',
            subject: x509.subject,
            issuer: x509.issuer,
            serial_number: x509.serialNumber,
            titular_cpf_cnpj: titularCpfCnpj,
            valid_from: toMySqlDatetime(x509.validFrom),
            validade_certificado: toMySqlDatetime(validadeDate)
        };
    } catch (error) {
        if (error.code && error.code.startsWith('INVALID_PFX')) {
            throw error;
        }
        const msg = String(error.message || '').toLowerCase();
        const err = new Error(
            msg.includes('mac verify failure') || msg.includes('bad decrypt')
                ? 'Senha incorreta para o certificado .pfx informado.'
                : 'Arquivo .pfx corrompido, senha incorreta ou formato PKCS#12 não suportado.'
        );
        err.code = 'INVALID_PFX_OR_PASSWORD';
        throw err;
    } finally {
        try {
            secureCtx?.context?.close?.();
        } catch {
            // Ignora falha ao liberar contexto nativo já fechado
        }
    }
};

/**
 * Valida o Certificado A1 em memória, extrai CPF/CNPJ e validade e salva criptografado
 * (`AES-256-GCM`) na tabela `credenciais_tribunal`.
 */
export const salvarCertificadoA1NoCofre = async ({
    escritorio_id = 1,
    tribunal_sigla = 'TRF3',
    pfxBuffer,
    senha,
    titular_cpf_cnpj = null
}) => {
    const metadados = validarEExtrairMetadadosPfx(pfxBuffer, senha, {
        titularCpfCnpjFallback: titular_cpf_cnpj
    });

    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    const tribunalNorm = String(tribunal_sigla || 'TRF3').trim().toUpperCase().slice(0, 15);

    const payloadCifrado = CredentialVaultService.encryptCredentialsJson({
        pfx_base64: pfxBuffer.toString('base64'),
        senha: String(senha)
    });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            UPDATE credenciais_tribunal
            SET ativo = FALSE
            WHERE escritorio_id = ?
              AND tribunal_sigla = ?
              AND tipo_autenticacao = 'CERTIFICADO_A1'
              AND ativo = TRUE
        `, [escId, tribunalNorm]);

        const [resInsert] = await conn.query(`
            INSERT INTO credenciais_tribunal (
                escritorio_id, tribunal_sigla, tipo_autenticacao, titular_cpf_cnpj,
                payload_criptografado, iv_hex, auth_tag_hex, validade_certificado,
                ativo, status_credencial
            ) VALUES (?, ?, 'CERTIFICADO_A1', ?, ?, ?, ?, ?, TRUE, ?)
        `, [
            escId,
            tribunalNorm,
            metadados.titular_cpf_cnpj,
            payloadCifrado.payload_criptografado,
            payloadCifrado.iv_hex,
            payloadCifrado.auth_tag_hex,
            metadados.validade_certificado,
            metadados.status_credencial
        ]);

        await conn.commit();

        return {
            id: resInsert.insertId,
            escritorio_id: escId,
            tribunal_sigla: tribunalNorm,
            tipo_autenticacao: 'CERTIFICADO_A1',
            titular_cpf_cnpj: metadados.titular_cpf_cnpj,
            validade_certificado: metadados.validade_certificado,
            status_credencial: metadados.status_credencial,
            ativo: true,
            subject: metadados.subject
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

/**
 * Busca a credencial A1 ativa e descriptografa `.pfx` e `senha` exclusivamente em RAM.
 */
export const obterCertificadoA1DescriptografadoEmMemoria = async ({
    escritorio_id = 1,
    tribunal_sigla = 'TRF3'
} = {}) => {
    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    const tribunalNorm = String(tribunal_sigla || 'TRF3').trim().toUpperCase();

    const [[row]] = await db.query(`
        SELECT id, escritorio_id, tribunal_sigla, titular_cpf_cnpj,
               payload_criptografado, iv_hex, auth_tag_hex,
               validade_certificado, status_credencial
        FROM credenciais_tribunal
        WHERE escritorio_id = ?
          AND tipo_autenticacao = 'CERTIFICADO_A1'
          AND ativo = TRUE
          AND tribunal_sigla IN (?, 'GLOBAL')
        ORDER BY CASE WHEN tribunal_sigla = ? THEN 0 ELSE 1 END, id DESC
        LIMIT 1
    `, [escId, tribunalNorm, tribunalNorm]);

    if (!row) {
        return null;
    }

    const credObj = CredentialVaultService.decryptCredentialsJson({
        payload_criptografado: row.payload_criptografado,
        iv_hex: row.iv_hex,
        auth_tag_hex: row.auth_tag_hex
    });

    await db.query(
        'UPDATE credenciais_tribunal SET ultimo_uso_em = NOW() WHERE id = ?',
        [row.id]
    );

    return {
        credencialId: row.id,
        escritorio_id: row.escritorio_id,
        tribunal_sigla: row.tribunal_sigla,
        titular_cpf_cnpj: row.titular_cpf_cnpj,
        validade_certificado: row.validade_certificado,
        status_credencial: row.status_credencial,
        pfxBuffer: Buffer.from(credObj.pfx_base64, 'base64'),
        senha: credObj.senha
    };
};

export const mascararDocumentoTitular = (doc) => {
    const digitos = String(doc || '').replace(/\D/g, '');
    if (digitos.length === 11) {
        return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
    }
    if (digitos.length === 14) {
        return `**.***.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-**`;
    }
    if (!doc) return null;
    const str = String(doc).trim();
    if (str.length <= 4) return '****';
    return `${str.slice(0, 2)}***${str.slice(-2)}`;
};

export const listarCredenciaisCofre = async ({ escritorio_id = 1 } = {}) => {
    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    const [rows] = await db.query(`
        SELECT id, escritorio_id, tribunal_sigla, tipo_autenticacao,
               titular_cpf_cnpj, validade_certificado, ativo,
               ultimo_uso_em, status_credencial, criado_em, atualizado_em
        FROM credenciais_tribunal
        WHERE escritorio_id = ?
        ORDER BY ativo DESC, id DESC
    `, [escId]);

    const agora = Date.now();
    return rows.map((row) => {
        const expirouPorData = row.validade_certificado
            ? new Date(row.validade_certificado).getTime() < agora
            : false;
        const statusEfetivo = (expirouPorData && row.status_credencial === 'VALIDA')
            ? 'EXPIRADA'
            : row.status_credencial;

        return {
            id: row.id,
            escritorio_id: row.escritorio_id,
            tribunal_sigla: row.tribunal_sigla,
            tipo_autenticacao: row.tipo_autenticacao,
            titular_mascarado: mascararDocumentoTitular(row.titular_cpf_cnpj),
            validade_certificado: row.validade_certificado,
            ativo: Boolean(row.ativo),
            ultimo_uso_em: row.ultimo_uso_em,
            status_credencial: statusEfetivo,
            criado_em: row.criado_em,
            atualizado_em: row.atualizado_em
        };
    });
};

export const salvarCredencialLoginPortal = async ({
    escritorio_id = 1,
    tribunal_sigla = 'TJSP',
    usuario,
    senha,
    totp_seed = null
}) => {
    const usuarioLimpo = String(usuario || '').trim();
    const senhaStr = senha === undefined || senha === null ? '' : String(senha);
    const seedLimpa = totp_seed ? String(totp_seed).replace(/[\s-]+/g, '').toUpperCase() : null;

    if (!usuarioLimpo) {
        const err = new Error('O usuário/CPF de acesso ao portal é obrigatório.');
        err.code = 'MISSING_PORTAL_USER';
        throw err;
    }
    if (!senhaStr) {
        const err = new Error('A senha de acesso ao portal é obrigatória.');
        err.code = 'MISSING_PORTAL_PASSWORD';
        throw err;
    }
    if (seedLimpa && !/^[A-Z2-7=]+$/.test(seedLimpa)) {
        const err = new Error('A seed TOTP (2FA) deve estar em formato Base32 válido (A-Z, 2-7).');
        err.code = 'INVALID_TOTP_SEED';
        throw err;
    }

    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    const tribunalNorm = String(tribunal_sigla || 'TJSP').trim().toUpperCase().slice(0, 15);
    const tipoAuth = seedLimpa ? 'CPF_SENHA_TOTP' : 'CPF_SENHA';

    const payloadCifrado = CredentialVaultService.encryptCredentialsJson({
        usuario: usuarioLimpo,
        senha: senhaStr,
        ...(seedLimpa ? { totp_seed: seedLimpa } : {})
    });

    const titularSalvo = usuarioLimpo.slice(0, 20);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            UPDATE credenciais_tribunal
            SET ativo = FALSE
            WHERE escritorio_id = ?
              AND tribunal_sigla = ?
              AND tipo_autenticacao IN ('CPF_SENHA', 'CPF_SENHA_TOTP')
              AND ativo = TRUE
        `, [escId, tribunalNorm]);

        const [resInsert] = await conn.query(`
            INSERT INTO credenciais_tribunal (
                escritorio_id, tribunal_sigla, tipo_autenticacao, titular_cpf_cnpj,
                payload_criptografado, iv_hex, auth_tag_hex, validade_certificado,
                ativo, status_credencial
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, TRUE, 'VALIDA')
        `, [
            escId,
            tribunalNorm,
            tipoAuth,
            titularSalvo,
            payloadCifrado.payload_criptografado,
            payloadCifrado.iv_hex,
            payloadCifrado.auth_tag_hex
        ]);

        await conn.commit();

        return {
            id: resInsert.insertId,
            escritorio_id: escId,
            tribunal_sigla: tribunalNorm,
            tipo_autenticacao: tipoAuth,
            titular_mascarado: mascararDocumentoTitular(titularSalvo),
            ativo: true,
            status_credencial: 'VALIDA'
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

export const alterarStatusAtivoCredencial = async ({ id, escritorio_id = 1, ativo }) => {
    const credId = Number(id);
    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    if (!Number.isInteger(credId) || credId <= 0) return null;

    const [resUpdate] = await db.query(
        'UPDATE credenciais_tribunal SET ativo = ? WHERE id = ? AND escritorio_id = ?',
        [Boolean(ativo), credId, escId]
    );
    if (resUpdate.affectedRows === 0) return null;

    return { id: credId, ativo: Boolean(ativo) };
};

export const removerCredencialCofre = async ({ id, escritorio_id = 1 }) => {
    const credId = Number(id);
    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    if (!Number.isInteger(credId) || credId <= 0) return false;

    const [resDelete] = await db.query(
        'DELETE FROM credenciais_tribunal WHERE id = ? AND escritorio_id = ?',
        [credId, escId]
    );
    return resDelete.affectedRows > 0;
};

export const PfxCertificateService = {
    extrairDocumentoIcpBrasil,
    mascararDocumentoTitular,
    validarEExtrairMetadadosPfx,
    salvarCertificadoA1NoCofre,
    obterCertificadoA1DescriptografadoEmMemoria,
    listarCredenciaisCofre,
    salvarCredencialLoginPortal,
    alterarStatusAtivoCredencial,
    removerCredencialCofre
};

export default PfxCertificateService;
