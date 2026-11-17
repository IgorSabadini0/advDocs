import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    extrairSegmentosCNJ,
    detectarTribunalCNJ,
    paraAliasDatajud
} from '../src/utils/cnjParser.js';
import { identificarTribunalCNJ, buscarProcesso } from '../src/services/datajudServices.js';
import { validateCliente } from '../src/validator/clientValidator.js';

describe('Parser CNJ e Identificação DataJud', () => {
    it('identifica corretamente TJs, TRFs, TRTs, TREs e Tribunais Superiores', () => {
        assert.equal(detectarTribunalCNJ('1001229-82.2025.8.26.0363'), 'TJSP');
        assert.equal(detectarTribunalCNJ('0001234-56.2024.8.19.0001'), 'TJRJ');
        assert.equal(detectarTribunalCNJ('0001234-56.2024.4.03.6100'), 'TRF-3');
        assert.equal(detectarTribunalCNJ('0010234-56.2024.5.15.0001'), 'TRT-15');
        assert.equal(detectarTribunalCNJ('0010234-56.2024.5.02.0001'), 'TRT-02');
        assert.equal(detectarTribunalCNJ('0000123-45.2024.3.00.0000'), 'STJ');
        assert.equal(detectarTribunalCNJ('0000123-45.2024.1.00.0000'), 'STF');
        assert.equal(detectarTribunalCNJ('0000123-45.2024.6.26.0001'), 'TRE-SP');
    });

    it('converte siglas para aliases DataJud sem zeros à esquerda', () => {
        assert.equal(paraAliasDatajud('TRT-02'), 'trt2');
        assert.equal(paraAliasDatajud('TRT-15'), 'trt15');
        assert.equal(paraAliasDatajud('TRF-3'), 'trf3');
        assert.equal(paraAliasDatajud('TJSP'), 'tjsp');
    });

    it('não faz fallback silencioso para TJSP quando o código CNJ é inválido ou incompleto', () => {
        assert.equal(identificarTribunalCNJ('10012298220258260363'), 'tjsp');
        assert.equal(identificarTribunalCNJ('00001234520245150001'), 'trt15');
        assert.equal(identificarTribunalCNJ('00001234520248990001'), null);
        assert.equal(identificarTribunalCNJ('00001234520240000001'), null);
        assert.equal(identificarTribunalCNJ('12345'), null);
        assert.equal(identificarTribunalCNJ(null), null);
    });

    it('rejeita consulta DataJud para órgãos sem API pública como STF com INVALID_COURT', async () => {
        await assert.rejects(
            () => buscarProcesso('0000123-45.2024.1.00.0000'),
            (err) => err.code === 'INVALID_COURT'
        );
    });

    it('extrai segmentos corretamente e rejeita strings parciais/malformadas', () => {
        const valido = extrairSegmentosCNJ('1001229-82.2025.8.26.0363');
        assert.equal(valido.valido, true);
        assert.equal(valido.completo, true);
        assert.equal(valido.codigoJTR, '8.26');
        assert.equal(valido.tribunal, 'TJSP');

        const invalido = extrairSegmentosCNJ('1001229-82.2025.8.99.0363');
        assert.equal(invalido.valido, false);
        assert.equal(invalido.tribunal, null);

        assert.equal(extrairSegmentosCNJ('').valido, false);
        assert.equal(extrairSegmentosCNJ(null).valido, false);
        assert.equal(extrairSegmentosCNJ(undefined).valido, false);
    });
});

describe('Validador de Clientes e Pastas (validateCliente)', () => {
    const payloadBaseValido = () => ({
        acao: 'Ação de Cobrança',
        nome: 'João da Silva',
        cpf_cnpj: '123.456.789-01',
        telefone: '(11) 98765-4321',
        email: 'joao@escritorio.com.br',
        numeroPasta: 10,
        tipo_processo_id: 1,
        numero_processo: '1001229-82.2025.8.26.0363',
        tribunal: 'TJSP',
        status_pasta: 'Ativo',
        observacoes: 'Observação inicial válida.'
    });

    it('aceita payload completo e caso extrajudicial sem número de processo', () => {
        assert.deepEqual(validateCliente(payloadBaseValido()), { valido: true });

        const extrajudicial = payloadBaseValido();
        delete extrajudicial.numero_processo;
        delete extrajudicial.tribunal;
        assert.deepEqual(validateCliente(extrajudicial), { valido: true });
    });

    it('rejeita entradas nulas, indefinidas ou objeto vazio', () => {
        assert.equal(validateCliente(null).valido, false);
        assert.equal(validateCliente(undefined).valido, false);
        assert.equal(validateCliente({}).valido, false);
    });

    it('rejeita CPF/CNPJ com todos os dígitos repetidos', () => {
        const cpfRepetido = { ...payloadBaseValido(), cpf_cnpj: '000.000.000-00' };
        assert.equal(validateCliente(cpfRepetido).valido, false);

        const cnpjRepetido = { ...payloadBaseValido(), cpf_cnpj: '11.111.111/1111-11' };
        assert.equal(validateCliente(cnpjRepetido).valido, false);
    });

    it('valida limites de numeroPasta (1 até 2147483647)', () => {
        assert.equal(validateCliente({ ...payloadBaseValido(), numeroPasta: 1 }).valido, true);
        assert.equal(validateCliente({ ...payloadBaseValido(), numeroPasta: 2147483647 }).valido, true);
        assert.equal(validateCliente({ ...payloadBaseValido(), numeroPasta: 2147483648 }).valido, false);
        assert.equal(validateCliente({ ...payloadBaseValido(), numeroPasta: 0 }).valido, false);
        assert.equal(validateCliente({ ...payloadBaseValido(), numeroPasta: -5 }).valido, false);
    });

    it('valida limite de 5.000 caracteres em observacoes/descricao', () => {
        const dentroLimite = { ...payloadBaseValido(), observacoes: 'a'.repeat(5000) };
        assert.equal(validateCliente(dentroLimite).valido, true);

        const acimaLimite = { ...payloadBaseValido(), observacoes: 'a'.repeat(5001) };
        assert.equal(validateCliente(acimaLimite).valido, false);
    });

    it('rejeita processo CNJ com sequência zerada ou código J.TR inválido', () => {
        const zeros = { ...payloadBaseValido(), numero_processo: '0000000-00.0000.0.00.0000' };
        assert.equal(validateCliente(zeros).valido, false);

        const tribunalInexistente = { ...payloadBaseValido(), numero_processo: '1001229-82.2025.8.99.0363' };
        assert.equal(validateCliente(tribunalInexistente).valido, false);
    });
});
