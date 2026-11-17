"""
Workers Playwright de Fallback — Fase 5 (BaseCourtScraper, PjeTrf3PublicScraper, EsajTjspScraper).
Inclui geração TOTP RFC 6238 para 2FA, bloqueio de recursos pesados e cache criptografado de sessão.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html as html_lib
import json
import os
import re
import struct
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from Crypto.Cipher import AES  # pycryptodome

from mni_trf3_provider import resolve_master_key

try:
    import pyotp  # type: ignore
except ImportError:  # pragma: no cover - fallback RFC 6238 em stdlib
    pyotp = None

try:
    from playwright.sync_api import sync_playwright  # type: ignore
except ImportError:  # pragma: no cover - Playwright opcional em ambiente sem browser
    sync_playwright = None

BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}
SESSION_TTL_SECONDS = 1800  # 30 minutos
DIAGNOSTICS_DIR = Path(__file__).resolve().parent.parent / "storage" / "diagnostics"

TRF3_CONSULTA_PUBLICA_URLS = {
    "1G": "https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam",
    "2G": "https://pje2g.trf3.jus.br/pje/ConsultaPublica/listView.seam",
}

ESAJ_TJSP_URLS = {
    "1G": "https://esaj.tjsp.jus.br/cpopg/open.do",
    "2G": "https://esaj.tjsp.jus.br/cposg/open.do",
}


def generate_totp_token(seed: str, for_time: Optional[int] = None, interval: int = 30, digits: int = 6) -> str:
    """Gera token TOTP de 6 dígitos (RFC 6238) compatível com pyotp para automação 2FA do PJe/eproc."""
    if not seed or not str(seed).strip():
        raise ValueError("Seed TOTP não informada.")

    clean_seed = re.sub(r"[\s=-]+", "", str(seed).strip()).upper()
    if pyotp is not None and for_time is None and interval == 30 and digits == 6:
        return pyotp.TOTP(clean_seed).now()

    pad_len = (-len(clean_seed)) % 8
    secret_bytes = base64.b32decode(clean_seed + ("=" * pad_len), casefold=True)
    ts = int(for_time if for_time is not None else time.time())
    counter = ts // interval
    msg = struct.pack(">Q", counter)
    digest = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code_int % (10 ** digits)).zfill(digits)


class SessionStateCache:
    """Armazena cookies/storage_state criptografados com AES-256-GCM e TTL de 30 minutos."""

    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS, master_key: Optional[str | bytes] = None) -> None:
        self.ttl_seconds = ttl_seconds
        self.key = resolve_master_key(master_key)
        self._store: Dict[str, Dict[str, Any]] = {}

    def save(self, cache_key: str, storage_state: Dict[str, Any]) -> None:
        iv = os.urandom(12)
        cipher = AES.new(self.key, AES.MODE_GCM, nonce=iv)
        plaintext = json.dumps(storage_state).encode("utf-8")
        ciphertext, auth_tag = cipher.encrypt_and_digest(plaintext)
        self._store[cache_key] = {
            "ciphertext": ciphertext,
            "iv": iv,
            "tag": auth_tag,
            "expires_at": time.time() + self.ttl_seconds,
        }

    def load(self, cache_key: str) -> Optional[Dict[str, Any]]:
        entry = self._store.get(cache_key)
        if not entry:
            return None
        if time.time() > entry["expires_at"]:
            self._store.pop(cache_key, None)
            return None
        cipher = AES.new(self.key, AES.MODE_GCM, nonce=entry["iv"])
        plaintext = cipher.decrypt_and_verify(entry["ciphertext"], entry["tag"])
        return json.loads(plaintext.decode("utf-8"))


def _strip_tags(raw_html: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", raw_html or "")
    return re.sub(r"\s+", " ", html_lib.unescape(no_tags)).strip()


def _parse_br_datetime(raw_date: str) -> Optional[str]:
    text = (raw_date or "").strip()
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s*(?:às|-)?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?", text)
    if not m:
        return None
    day, month, year = m.group(1), m.group(2), m.group(3)
    hour = m.group(4) or "00"
    minute = m.group(5) or "00"
    sec = m.group(6) or "00"
    return f"{year}-{month}-{day}T{hour}:{minute}:{sec}Z"


class BaseCourtScraper:
    """Classe base headless com bloqueio de recursos pesados e captura de diagnóstico em falhas."""

    tribunal_sigla: str = "GENERICO"

    def __init__(self, headless: bool = True, diagnostics_dir: Path = DIAGNOSTICS_DIR) -> None:
        self.headless = headless
        self.diagnostics_dir = Path(diagnostics_dir)

    def handle_route(self, route: Any) -> None:
        if route.request.resource_type in BLOCKED_RESOURCE_TYPES:
            route.abort()
        else:
            route.continue_()

    def capture_diagnostic_screenshot(
        self,
        page_or_html: Any,
        tribunal_sigla: str,
        numero_cnj: str,
        erro_msg: str,
    ) -> Path:
        self.diagnostics_dir.mkdir(parents=True, exist_ok=True)
        digits = "".join(ch for ch in str(numero_cnj) if ch.isdigit()) or "sem_cnj"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        safe_trib = re.sub(r"[^A-Z0-9_-]", "", tribunal_sigla.upper()) or "TRIBUNAL"

        if hasattr(page_or_html, "screenshot"):
            img_path = self.diagnostics_dir / f"{safe_trib}_{digits}_{stamp}.png"
            page_or_html.screenshot(path=str(img_path), full_page=True)
            return img_path

        report_path = self.diagnostics_dir / f"{safe_trib}_{digits}_{stamp}.json"
        payload = {
            "tribunal_sigla": safe_trib,
            "numero_cnj": digits,
            "erro": str(erro_msg),
            "timestamp": stamp,
            "html_excerpt": str(page_or_html or "")[:4000],
        }
        report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return report_path


class PjeTrf3PublicScraper(BaseCourtScraper):
    """Scraper de fallback para a Consulta Pública do PJe TRF3 (1º e 2º Graus)."""

    tribunal_sigla = "TRF3"

    @staticmethod
    def get_url(instancia: str = "1G") -> str:
        inst = "2G" if str(instancia).upper() == "2G" else "1G"
        return TRF3_CONSULTA_PUBLICA_URLS[inst]

    def parse_html_to_dto(self, html: str, numero_cnj: str, instancia: str = "1G") -> Dict[str, Any]:
        inst_norm = "2G" if str(instancia).upper() == "2G" else "1G"
        digits = "".join(ch for ch in str(numero_cnj) if ch.isdigit())

        classe = self._extract_by_id_or_label(html, r"classeJudicial|Classe Judicial")
        assunto = self._extract_by_id_or_label(html, r"assuntoProcesso|Assunto")
        orgao = self._extract_by_id_or_label(html, r"orgaoJulgador|Órgão Julgador")
        dist_raw = self._extract_by_id_or_label(html, r"dataDistribuicao|Data de Distribuição")

        movimentacoes: List[Dict[str, Any]] = []
        for row_html in re.findall(r"<tr[^>]*class=[\"'][^\"']*movimento-row[^\"']*[\"'][^>]*>([\s\S]*?)</tr>", html, re.I):
            cols = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, re.I)
            if len(cols) >= 2:
                data_iso = _parse_br_datetime(_strip_tags(cols[0])) or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                titulo = _strip_tags(cols[1])
                teor = _strip_tags(cols[2]) if len(cols) > 2 else titulo
                if titulo:
                    movimentacoes.append(
                        {
                            "instancia": inst_norm,
                            "data_movimentacao": data_iso,
                            "codigo_cnj": None,
                            "titulo": titulo[:500],
                            "teor_completo": teor or titulo,
                            "fonte_captura": "SCRAPER",
                            "documentos_vinculados": [],
                        }
                    )

        return {
            "numero_cnj": digits,
            "tribunal_sigla": "TRF3",
            "instancia": inst_norm,
            "sistema_processual": "PJE",
            "segredo_justica": False,
            "capa": {
                "classe_processual": classe,
                "assunto_principal": assunto,
                "orgao_julgador": orgao,
                "valor_causa": None,
                "data_distribuicao": _parse_br_datetime(dist_raw or ""),
            },
            "partes": [],
            "movimentacoes": movimentacoes,
        }

    @staticmethod
    def _extract_by_id_or_label(html: str, pattern: str) -> Optional[str]:
        m = re.search(rf'id=["\'][^"\']*(?:{pattern})[^"\']*["\'][^>]*>([\s\S]*?)</', html, re.I)
        if m:
            txt = _strip_tags(m.group(1))
            if txt:
                return txt
        m2 = re.search(
            rf"(?:{pattern})\s*:?\s*(?:</(?:label|strong|span)>\s*)*</(?:dt|th|label|strong|span|td)>\s*<(?:dd|td|span|div)[^>]*>([\s\S]*?)</",
            html,
            re.I,
        )
        return _strip_tags(m2.group(1)) if m2 else None


class EsajTjspScraper(BaseCourtScraper):
    """Scraper para processos estaduais do portal e-SAJ TJSP."""

    tribunal_sigla = "TJSP"

    @staticmethod
    def get_url(instancia: str = "1G") -> str:
        inst = "2G" if str(instancia).upper() == "2G" else "1G"
        return ESAJ_TJSP_URLS[inst]

    def parse_html_to_dto(self, html: str, numero_cnj: str, instancia: str = "1G") -> Dict[str, Any]:
        inst_norm = "2G" if str(instancia).upper() == "2G" else "1G"
        digits = "".join(ch for ch in str(numero_cnj) if ch.isdigit())

        classe = PjeTrf3PublicScraper._extract_by_id_or_label(html, r"classeProcesso|Classe")
        assunto = PjeTrf3PublicScraper._extract_by_id_or_label(html, r"assuntoProcesso|Assunto")
        orgao = PjeTrf3PublicScraper._extract_by_id_or_label(html, r"varaProcesso|foroProcesso|Vara")
        dist_raw = PjeTrf3PublicScraper._extract_by_id_or_label(html, r"dataHoraDistribuicaoProcesso|Distribuição")

        movimentacoes: List[Dict[str, Any]] = []
        for row_html in re.findall(r"<tr[^>]*class=[\"'][^\"']*containerMovimentacao[^\"']*[\"'][^>]*>([\s\S]*?)</tr>", html, re.I):
            cols = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, re.I)
            if len(cols) >= 2:
                data_iso = _parse_br_datetime(_strip_tags(cols[0])) or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                texto_mov = _strip_tags(cols[-1])
                if texto_mov:
                    movimentacoes.append(
                        {
                            "instancia": inst_norm,
                            "data_movimentacao": data_iso,
                            "codigo_cnj": None,
                            "titulo": texto_mov[:500],
                            "teor_completo": texto_mov,
                            "fonte_captura": "SCRAPER",
                            "documentos_vinculados": [],
                        }
                    )

        return {
            "numero_cnj": digits,
            "tribunal_sigla": "TJSP",
            "instancia": inst_norm,
            "sistema_processual": "ESAJ",
            "segredo_justica": False,
            "capa": {
                "classe_processual": classe,
                "assunto_principal": assunto,
                "orgao_julgador": orgao,
                "valor_causa": None,
                "data_distribuicao": _parse_br_datetime(dist_raw or ""),
            },
            "partes": [],
            "movimentacoes": movimentacoes,
        }
