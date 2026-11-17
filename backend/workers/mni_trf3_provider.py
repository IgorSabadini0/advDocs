"""
Worker Python espelhado da Fase 4 — Cofre AES-256-GCM e Cliente MNI 2.2.2 TRF3 (mTLS em memória).
Compatível byte-a-byte com o `CredentialVaultService` (Node.js) na tabela `credenciais_tribunal`.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import os
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from Crypto.Cipher import AES  # pycryptodome

WSDL_TRF3_1G = "https://pje1g.trf3.jus.br/pje/intercomunicacao?wsdl"
WSDL_TRF3_2G = "https://pje2g.trf3.jus.br/pje/intercomunicacao?wsdl"

try:
    from cryptography.hazmat.primitives.serialization import pkcs12 as _pkcs12  # type: ignore
except ImportError:  # pragma: no cover - fallback caso pacote `cryptography` não esteja instalado
    _pkcs12 = None

try:
    import zeep  # type: ignore
except ImportError:  # pragma: no cover - fallback SOAP HTTP nativo caso `zeep` não esteja instalado
    zeep = None


def resolve_master_key(master_key_override: Optional[str | bytes] = None) -> bytes:
    """Resolve a Master Key AES-256 usando a mesma regra do `CredentialVaultService` do Node.js."""
    raw = master_key_override if master_key_override is not None else os.getenv("ENCRYPTION_MASTER_KEY")

    if isinstance(raw, (bytes, bytearray)):
        if len(raw) == 32:
            return bytes(raw)
        return hashlib.sha256(bytes(raw)).digest()

    if isinstance(raw, str) and raw.strip():
        trimmed = raw.strip()
        if len(trimmed) == 64:
            try:
                return bytes.fromhex(trimmed)
            except ValueError:
                pass
        utf8_bytes = trimmed.encode("utf-8")
        if len(utf8_bytes) == 32:
            return utf8_bytes
        return hashlib.sha256(utf8_bytes).digest()

    seed = os.getenv("JWT_SECRET") or "advdocs-dev-vault-master-key-configure-em-producao"
    return hashlib.sha256(seed.encode("utf-8")).digest()


def decrypt_credentials_aes_gcm(
    payload_criptografado: bytes,
    iv_hex: str,
    auth_tag_hex: str,
    master_key_override: Optional[str | bytes] = None,
) -> Dict[str, Any]:
    """Descriptografa em memória registro da tabela `credenciais_tribunal` gravado pelo Node.js."""
    key = resolve_master_key(master_key_override)
    iv = bytes.fromhex(iv_hex.strip())
    auth_tag = bytes.fromhex(auth_tag_hex.strip())

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    plaintext = cipher.decrypt_and_verify(payload_criptografado, auth_tag)
    return json.loads(plaintext.decode("utf-8"))


def build_mni_soap_envelope(
    id_consultante: str,
    numero_processo: str,
    senha_consultante: str = "",
    movimentos: bool = True,
    incluir_cabecalho: bool = True,
    incluir_documentos: bool = False,
    documento_id: Optional[str] = None,
) -> str:
    """Monta o envelope SOAP MNI 2.2.2 para consulta de processo ou download de peça."""
    cpf = "".join(ch for ch in str(id_consultante) if ch.isdigit())
    proc = "".join(ch for ch in str(numero_processo) if ch.isdigit())
    doc_xml = f"<tip:documento>{documento_id}</tip:documento>" if documento_id else ""

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
        'xmlns:ser="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" '
        'xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">'
        "<soapenv:Header/>"
        "<soapenv:Body><ser:consultarProcesso>"
        f"<tip:idConsultante>{cpf}</tip:idConsultante>"
        f"<tip:senhaConsultante>{senha_consultante}</tip:senhaConsultante>"
        f"<tip:numeroProcesso>{proc}</tip:numeroProcesso>"
        f"<tip:movimentos>{'true' if movimentos else 'false'}</tip:movimentos>"
        f"<tip:incluirCabecalho>{'true' if incluir_cabecalho else 'false'}</tip:incluirCabecalho>"
        f"<tip:incluirDocumentos>{'true' if incluir_documentos else 'false'}</tip:incluirDocumentos>"
        f"{doc_xml}"
        "</ser:consultarProcesso></soapenv:Body></soapenv:Envelope>"
    )


@contextlib.contextmanager
def pfx_em_memoria_para_mtls(pfx_bytes: bytes, senha: str):
    """
    Extrai par certificado/chave privada do .pfx exclusivamente durante a chamada
    usando `/dev/shm` quando disponível (ou arquivo efêmero removido imediatamente no `finally`).
    """
    shm_dir = "/dev/shm" if Path("/dev/shm").exists() else None
    temp_files = []

    try:
        if _pkcs12 is not None:
            from cryptography.hazmat.primitives import serialization  # type: ignore

            private_key, cert, chain = _pkcs12.load_key_and_certificates(
                pfx_bytes, senha.encode("utf-8") if senha else None
            )
            cert_pem = cert.public_bytes(serialization.Encoding.PEM)
            if chain:
                for ca in chain:
                    cert_pem += ca.public_bytes(serialization.Encoding.PEM)
            key_pem = private_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )

            with tempfile.NamedTemporaryFile(dir=shm_dir, suffix=".pem", delete=False) as fc:
                fc.write(cert_pem)
                cert_path = fc.name
            with tempfile.NamedTemporaryFile(dir=shm_dir, suffix=".key", delete=False) as fk:
                fk.write(key_pem)
                key_path = fk.name
            temp_files.extend([cert_path, key_path])
            yield (cert_path, key_path)
        else:
            yield None
    finally:
        for fpath in temp_files:
            with contextlib.suppress(OSError):
                os.remove(fpath)


class MniTrf3PythonProvider:
    """Cliente MNI 2.2.2 para TRF3 1º e 2º Graus com Certificado Digital A1 em memória."""

    def __init__(self, instancia: str = "1G", timeout: int = 30) -> None:
        self.instancia = "2G" if str(instancia).upper() == "2G" else "1G"
        self.wsdl_url = WSDL_TRF3_2G if self.instancia == "2G" else WSDL_TRF3_1G
        self.endpoint_url = self.wsdl_url.removesuffix("?wsdl")
        self.timeout = timeout

    def consultar_processo_soap(
        self,
        numero_cnj: str,
        id_consultante: str,
        pfx_base64: str,
        senha: str,
        documento_id: Optional[str] = None,
    ) -> str:
        pfx_bytes = base64.b64decode(pfx_base64)
        envelope = build_mni_soap_envelope(
            id_consultante=id_consultante,
            numero_processo=numero_cnj,
            movimentos=documento_id is None,
            incluir_cabecalho=documento_id is None,
            documento_id=documento_id,
        )
        headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"consultarProcesso"'}

        with pfx_em_memoria_para_mtls(pfx_bytes, senha) as cert_pair:
            response = requests.post(
                self.endpoint_url,
                data=envelope.encode("utf-8"),
                headers=headers,
                cert=cert_pair,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.text

    @staticmethod
    def extrair_conteudo_documento_xml(xml_text: str) -> bytes:
        root = ET.fromstring(xml_text)
        for elem in root.iter():
            tag = elem.tag.split("}")[-1]
            if tag == "conteudo" and elem.text:
                return base64.b64decode("".join(elem.text.split()))
        raise ValueError("Conteúdo Base64 do documento MNI não encontrado no XML.")
