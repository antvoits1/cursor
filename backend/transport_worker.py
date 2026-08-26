"""Persistent layered transport worker.

The Node engine speaks newline-delimited JSON to this process over stdin/stdout
and gets back one response per request. The escalation ladder is

    cache -> curl_cffi -> Patchright -> Camoufox

and every rung is optional: a library that is not installed is reported as
unavailable in the ready handshake instead of being silently skipped, so the
application can tell the operator exactly which tiers exist on this machine.

Nothing here ever claims to have solved a challenge. When a page is a Cloudflare
interstitial, a CAPTCHA, or an empty JavaScript shell, that is what is reported.
"""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import os
import re
import socket
import sqlite3
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

try:
    from curl_cffi.requests import AsyncSession
except Exception:  # pragma: no cover - depends on the host environment
    AsyncSession = None

try:
    from patchright.async_api import async_playwright
except Exception:  # pragma: no cover - depends on the host environment
    async_playwright = None

try:
    from camoufox.async_api import AsyncCamoufox
except Exception:  # pragma: no cover - depends on the host environment
    AsyncCamoufox = None


BLOCK_STATUSES = {401, 403, 429, 503}

# Markers are grouped so the reported reason names the actual challenge rather
# than a generic "blocked".
CHALLENGE_MARKERS: tuple[tuple[str, str], ...] = (
    ('cf-turnstile', 'Cloudflare Turnstile'),
    ('cf-chl-', 'Cloudflare challenge'),
    ('challenge-platform', 'Cloudflare challenge'),
    ('__cf_chl', 'Cloudflare challenge'),
    ('just a moment...', 'Cloudflare interstitial'),
    ('attention required! | cloudflare', 'Cloudflare block page'),
    ('g-recaptcha', 'reCAPTCHA'),
    ('grecaptcha', 'reCAPTCHA'),
    ('recaptcha/api.js', 'reCAPTCHA'),
    ('hcaptcha', 'hCaptcha'),
    ('captcha-container', 'CAPTCHA'),
    ('px-captcha', 'PerimeterX CAPTCHA'),
    ('checking your browser', 'browser verification page'),
    ('verify you are human', 'human verification page'),
    ('verifying you are human', 'human verification page'),
    ('enable javascript and cookies to continue', 'JavaScript and cookie wall'),
    ('access denied', 'access denied page'),
    ('request unsuccessful. incapsula', 'Imperva Incapsula block'),
    ('unusual traffic from your computer', 'automated traffic block'),
)

JS_SHELL_MARKERS = (
    '<div id="root"></div>',
    "<div id='root'></div>",
    '<div id="app"></div>',
    "<div id='app'></div>",
    '<div id="__next"></div>',
    'please enable javascript',
    'you need to enable javascript to run this app',
)

MEDIA_TYPES = {'image', 'media', 'font'}
MAX_REDIRECTS = 5
CACHE_TTL_SECONDS = int(os.getenv('EXTRACTOR_CACHE_TTL_SECONDS', '900'))
DOMAIN_DELAY_SECONDS = float(os.getenv('EXTRACTOR_DOMAIN_DELAY_SECONDS', '0.35'))
MAX_HTML_BYTES = int(os.getenv('EXTRACTOR_MAX_HTML_BYTES', '3000000'))


def _emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _host_is_public(hostname: str) -> bool:
    """True only when every address a host resolves to is publicly routable."""
    host = hostname.strip().lower().rstrip('.')
    if not host or host == 'localhost' or host.endswith('.local') or host.endswith('.internal'):
        return False

    try:
        literal = ipaddress.ip_address(host.strip('[]'))
        return not (
            literal.is_private
            or literal.is_loopback
            or literal.is_link_local
            or literal.is_multicast
            or literal.is_reserved
            or literal.is_unspecified
        )
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return False

    addresses = {item[4][0].split('%')[0] for item in infos}
    if not addresses:
        return False
    for raw in addresses:
        try:
            ip = ipaddress.ip_address(raw)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


def is_public_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        return False
    return _host_is_public(parsed.hostname)


def classify_content(html: str, status: int | None) -> tuple[bool, str | None, bool]:
    """Returns (blocked, reason, dynamic_shell) for one fetched page."""
    lowered = (html or '').lower()

    if status in BLOCK_STATUSES:
        return True, f'HTTP {status} security or rate-limit response', False

    for marker, label in CHALLENGE_MARKERS:
        if marker in lowered:
            return True, label, False

    text_only = re.sub(r'<script\b[^>]*>.*?</script>', ' ', lowered, flags=re.I | re.S)
    text_only = re.sub(r'<style\b[^>]*>.*?</style>', ' ', text_only, flags=re.I | re.S)
    text_only = re.sub(r'<noscript\b[^>]*>.*?</noscript>', ' ', text_only, flags=re.I | re.S)
    text_only = re.sub(r'<[^>]+>', ' ', text_only)
    visible_chars = len(re.sub(r'\s+', '', text_only))

    has_shell = any(marker in lowered for marker in JS_SHELL_MARKERS)
    dynamic_shell = (has_shell and visible_chars < 180) or (
        len(html or '') < 900 and '<script' in lowered and visible_chars < 120
    )
    return False, None, dynamic_shell


def _proxy_config(proxy: str) -> dict[str, str] | None:
    proxy = proxy.strip()
    if not proxy:
        return None
    parsed = urlparse(proxy)
    if not parsed.scheme or not parsed.hostname or not parsed.port:
        raise ValueError('A proxy must include a scheme, a host and a port.')
    config: dict[str, str] = {'server': f'{parsed.scheme}://{parsed.hostname}:{parsed.port}'}
    if parsed.username:
        config['username'] = parsed.username
    if parsed.password:
        config['password'] = parsed.password
    return config


class TransportCache:
    """SQLite page cache.

    Cache keys hash the proxy route alongside the URL, so a page fetched through
    one exit is never served for a request that asked for another, and the
    credentials themselves are never stored or logged.
    """

    def __init__(self) -> None:
        self.available = False
        self.conn: sqlite3.Connection | None = None
        self.error: str | None = None
        try:
            default_runtime = Path(__file__).resolve().parent / '.runtime'
            base = Path(os.getenv('EXTRACTOR_RUNTIME_DIR', str(default_runtime)))
            base.mkdir(parents=True, exist_ok=True)
            self.path = Path(os.getenv('EXTRACTOR_TRANSPORT_DB', str(base / 'transport.sqlite3')))
            self.conn = sqlite3.connect(self.path, check_same_thread=False)
            self.conn.execute('PRAGMA journal_mode=WAL')
            self.conn.execute('PRAGMA synchronous=NORMAL')
            self.conn.execute(
                '''CREATE TABLE IF NOT EXISTS page_cache (
                    cache_key TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    final_url TEXT NOT NULL,
                    html TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    status INTEGER,
                    created_at REAL NOT NULL
                )'''
            )
            self.conn.execute('CREATE INDEX IF NOT EXISTS idx_page_cache_created ON page_cache(created_at)')
            self.conn.commit()
            self.available = True
        except Exception as exc:  # a cache failure must not disable fetching
            self.error = f'{type(exc).__name__}: {str(exc)[:160]}'
            self.conn = None

    @staticmethod
    def key(url: str, proxy: str) -> str:
        proxy_hash = hashlib.sha256(proxy.encode('utf-8')).hexdigest()[:12] if proxy else 'direct'
        return hashlib.sha256(f'{url}\n{proxy_hash}'.encode('utf-8')).hexdigest()

    def entries(self) -> int:
        if not self.conn:
            return 0
        try:
            row = self.conn.execute('SELECT COUNT(*) FROM page_cache').fetchone()
            return int(row[0]) if row else 0
        except Exception:
            return 0

    def get(self, url: str, proxy: str) -> dict[str, Any] | None:
        if not self.conn:
            return None
        try:
            row = self.conn.execute(
                'SELECT final_url, html, tier, status FROM page_cache WHERE cache_key=? AND created_at>=?',
                (self.key(url, proxy), time.time() - CACHE_TTL_SECONDS),
            ).fetchone()
        except Exception:
            return None
        if not row:
            return None
        return {'url': row[0], 'html': row[1], 'origin_tier': row[2], 'status': row[3]}

    def put(self, url: str, proxy: str, final_url: str, html: str, tier: str, status: int | None) -> None:
        if not self.conn:
            return
        now = time.time()
        try:
            self.conn.execute(
                'INSERT OR REPLACE INTO page_cache(cache_key,url,final_url,html,tier,status,created_at)'
                ' VALUES(?,?,?,?,?,?,?)',
                (self.key(url, proxy), url, final_url, html, tier, status, now),
            )
            # Expired rows are pruned opportunistically rather than by a timer.
            self.conn.execute('DELETE FROM page_cache WHERE created_at < ?', (now - max(CACHE_TTL_SECONDS * 4, 3600),))
            self.conn.commit()
        except Exception:
            pass

    def close(self) -> None:
        if self.conn:
            try:
                self.conn.close()
            except Exception:
                pass
            self.conn = None
            self.available = False


@dataclass
class Attempt:
    tier: str
    ok: bool
    status: int | None = None
    blocked: bool = False
    challenge: str = ''
    dynamic_shell: bool = False
    redirects: int = 0
    timed_out: bool = False
    reason: str = ''
    elapsed_ms: int = 0


class TieredRouter:
    def __init__(self) -> None:
        self.cache = TransportCache()
        self._domain_locks: dict[str, asyncio.Lock] = {}
        self._domain_last: dict[str, float] = {}
        self._cffi_session = AsyncSession(impersonate='chrome') if AsyncSession else None
        self._patchright = None
        self._patch_browser = None
        self._patch_contexts: dict[str, Any] = {}
        self._camoufox_managers: dict[str, Any] = {}
        self._camoufox_browsers: dict[str, Any] = {}
        self._lifecycle_lock = asyncio.Lock()
        self._host_safety_cache: dict[str, bool] = {}
        self._tier_unavailable: dict[str, str] = {}
        if async_playwright is None:
            self._tier_unavailable['patchright'] = 'Patchright is not installed on this host.'
        if AsyncCamoufox is None:
            self._tier_unavailable['camoufox'] = 'Camoufox is not installed on this host.'

    async def _throttle(self, url: str) -> None:
        """Keeps at least DOMAIN_DELAY_SECONDS between requests to one host."""
        host = (urlparse(url).hostname or '').lower()
        lock = self._domain_locks.setdefault(host, asyncio.Lock())
        async with lock:
            wait_for = DOMAIN_DELAY_SECONDS - (time.monotonic() - self._domain_last.get(host, 0.0))
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._domain_last[host] = time.monotonic()

    async def _is_safe_request_url(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme in {'data', 'blob', 'about'}:
            return True
        host = (parsed.hostname or '').lower()
        if not host:
            return False
        if host not in self._host_safety_cache:
            self._host_safety_cache[host] = await asyncio.to_thread(_host_is_public, host)
        return self._host_safety_cache[host]

    async def _browser_route(self, route: Any, block_media: bool) -> None:
        """Drops heavy media and refuses any subresource that is not public."""
        try:
            request = route.request
            if block_media and getattr(request, 'resource_type', '') in MEDIA_TYPES:
                await route.abort()
                return
            if not await self._is_safe_request_url(request.url):
                await route.abort()
                return
            await route.continue_()
        except Exception:
            try:
                await route.abort()
            except Exception:
                pass

    def _disable_tier(self, tier: str, reason: str) -> None:
        """
        Records that a tier cannot run here, so it is never attempted again.

        A browser package that imports but has no browser binary installed
        fails only at launch, and the launch is slow. Retrying it on every page
        cost roughly thirteen seconds per blocked source in the first audit
        run, which is time taken from sources that would have answered. One
        failure is enough to know; the reason is kept so the route can still
        say why the tier was skipped instead of silently omitting it.
        """
        self._tier_unavailable.setdefault(tier, reason)

    async def _get_patch_context(self, proxy: str) -> Any:
        if async_playwright is None:
            return None
        key = proxy or 'direct'
        async with self._lifecycle_lock:
            if key in self._patch_contexts:
                return self._patch_contexts[key]
            try:
                if self._patchright is None:
                    self._patchright = await async_playwright().start()
                if self._patch_browser is None:
                    self._patch_browser = await self._patchright.chromium.launch(headless=True)
                kwargs: dict[str, Any] = {}
                cfg = _proxy_config(proxy)
                if cfg:
                    kwargs['proxy'] = cfg
                context = await self._patch_browser.new_context(**kwargs)
            except Exception as exc:
                self._disable_tier(
                    'patchright',
                    f'The Patchright browser could not be started here ({type(exc).__name__}). '
                    'Run "patchright install chromium" to enable this tier.',
                )
                return None
            self._patch_contexts[key] = context
            return context

    async def _get_camoufox_browser(self, proxy: str) -> Any:
        if AsyncCamoufox is None:
            return None
        key = proxy or 'direct'
        async with self._lifecycle_lock:
            if key in self._camoufox_browsers:
                return self._camoufox_browsers[key]
            kwargs: dict[str, Any] = {'headless': True}
            cfg = _proxy_config(proxy)
            if cfg:
                kwargs['proxy'] = cfg
                # GeoIP alignment only matters when traffic exits somewhere else.
                kwargs['geoip'] = True
            try:
                manager = AsyncCamoufox(**kwargs)
                browser = await manager.__aenter__()
            except Exception as exc:
                self._disable_tier(
                    'camoufox',
                    f'The Camoufox browser could not be started here ({type(exc).__name__}). '
                    'Run "camoufox fetch" to download its runtime.',
                )
                return None
            self._camoufox_managers[key] = manager
            self._camoufox_browsers[key] = browser
            return browser

    async def _fetch_cffi(self, url: str, timeout_ms: int, proxy: str) -> tuple[dict[str, Any] | None, Attempt]:
        started = time.monotonic()
        if self._cffi_session is None:
            return None, Attempt('curl_cffi', False, reason='curl_cffi is not installed on this host.')

        current = url
        last_status: int | None = None
        redirects = 0

        # `timeout_ms` bounds the tier, not each hop. Applying it per request
        # let a host that accepts a connection and then stalls burn the timeout
        # once per redirect and once per retry, so a ten-second budget became
        # thirty seconds of real waiting and took the whole run's budget with
        # it. The deadline below is what the caller actually asked for.
        deadline = started + max(1.0, timeout_ms / 1000)

        def remaining() -> float:
            return deadline - time.monotonic()

        for _ in range(MAX_REDIRECTS + 1):
            if remaining() <= 0.4:
                return None, Attempt(
                    'curl_cffi', False, status=last_status, redirects=redirects, timed_out=True,
                    reason='the tier ran out of time following redirects',
                    elapsed_ms=int((time.monotonic() - started) * 1000),
                )

            if not await asyncio.to_thread(is_public_url, current):
                return None, Attempt(
                    'curl_cffi', False, status=last_status, redirects=redirects,
                    reason='The SSRF guard refused this address.',
                    elapsed_ms=int((time.monotonic() - started) * 1000),
                )

            await self._throttle(current)
            response = None
            timed_out = False
            for attempt_index in range(2):
                try:
                    kwargs: dict[str, Any] = {'timeout': max(1.0, remaining()), 'allow_redirects': False}
                    if proxy:
                        kwargs['proxy'] = proxy
                    response = await self._cffi_session.get(current, **kwargs)
                    last_status = int(response.status_code)
                    break
                except Exception as exc:
                    timed_out = 'timeout' in type(exc).__name__.lower() or 'timeout' in str(exc).lower()
                    if attempt_index == 0 and remaining() > 1.5:
                        # One retry absorbs a transient reset before giving up.
                        await asyncio.sleep(0.35)
                        continue
                    return None, Attempt(
                        'curl_cffi', False, status=last_status, redirects=redirects, timed_out=timed_out,
                        reason=f'network error: {type(exc).__name__}',
                        elapsed_ms=int((time.monotonic() - started) * 1000),
                    )

            if response is None:
                return None, Attempt(
                    'curl_cffi', False, status=last_status, redirects=redirects, timed_out=timed_out,
                    reason='No response was produced.',
                    elapsed_ms=int((time.monotonic() - started) * 1000),
                )

            if last_status is not None and 300 <= last_status < 400:
                location = response.headers.get('location')
                if not location or redirects >= MAX_REDIRECTS:
                    return None, Attempt(
                        'curl_cffi', False, status=last_status, redirects=redirects,
                        reason='The redirect chain was invalid or too long.',
                        elapsed_ms=int((time.monotonic() - started) * 1000),
                    )
                current = urljoin(current, location)
                redirects += 1
                continue

            html = (response.text or '')[:MAX_HTML_BYTES]
            blocked, reason, dynamic_shell = classify_content(html, last_status)
            ok = bool(last_status and 200 <= last_status < 300) and bool(html.strip()) and not blocked and not dynamic_shell
            attempt = Attempt(
                'curl_cffi', ok, status=last_status, blocked=blocked, challenge=reason or '',
                dynamic_shell=dynamic_shell, redirects=redirects,
                reason=reason or ('the page was an empty JavaScript shell' if dynamic_shell else ''),
                elapsed_ms=int((time.monotonic() - started) * 1000),
            )
            if ok:
                return {'url': current, 'html': html, 'tier': 'curl_cffi', 'status': last_status}, attempt
            return None, attempt

        return None, Attempt(
            'curl_cffi', False, status=last_status, redirects=redirects,
            reason='The redirect limit was reached.',
            elapsed_ms=int((time.monotonic() - started) * 1000),
        )

    async def _fetch_browser(
        self, tier: str, url: str, timeout_ms: int, proxy: str, block_media: bool
    ) -> tuple[dict[str, Any] | None, Attempt]:
        started = time.monotonic()
        if not await asyncio.to_thread(is_public_url, url):
            return None, Attempt(tier, False, reason='The SSRF guard refused this address.')

        page = None
        try:
            if tier == 'patchright':
                context = await self._get_patch_context(proxy)
                if context is None:
                    return None, Attempt(tier, False, reason='Patchright is not installed on this host.')
                page = await context.new_page()
            else:
                browser = await self._get_camoufox_browser(proxy)
                if browser is None:
                    return None, Attempt(tier, False, reason='Camoufox is not installed on this host.')
                page = await browser.new_page()

            await page.route('**/*', lambda route: self._browser_route(route, block_media))
            response = await page.goto(url, wait_until='domcontentloaded', timeout=max(1000, timeout_ms))
            await page.wait_for_timeout(900 if tier == 'patchright' else 1400)
            html = (await page.content())[:MAX_HTML_BYTES]
            final_url = page.url
            status = int(response.status) if response else 200

            if not await asyncio.to_thread(is_public_url, final_url):
                return None, Attempt(
                    tier, False, status=status,
                    reason='The page redirected to an address the SSRF guard refuses.',
                    elapsed_ms=int((time.monotonic() - started) * 1000),
                )

            blocked, reason, dynamic_shell = classify_content(html, status)
            ok = 200 <= status < 300 and bool(html.strip()) and not blocked and not dynamic_shell
            attempt = Attempt(
                tier, ok, status=status, blocked=blocked, challenge=reason or '', dynamic_shell=dynamic_shell,
                reason=reason or ('the rendered page was still an empty shell' if dynamic_shell else ''),
                elapsed_ms=int((time.monotonic() - started) * 1000),
            )
            if ok:
                return {'url': final_url, 'html': html, 'tier': tier, 'status': status}, attempt
            return None, attempt
        except Exception as exc:
            timed_out = 'timeout' in type(exc).__name__.lower() or 'timeout' in str(exc).lower()
            return None, Attempt(
                tier, False, timed_out=timed_out, reason=f'{type(exc).__name__}: {str(exc)[:160]}',
                elapsed_ms=int((time.monotonic() - started) * 1000),
            )
        finally:
            if page is not None:
                try:
                    await page.close()
                except Exception:
                    pass

    async def fetch(
        self, url: str, timeout_ms: int, proxy: str, block_media: bool, budget_ms: int | None = None
    ) -> dict[str, Any]:
        attempts: list[Attempt] = []

        if not await asyncio.to_thread(is_public_url, url):
            return {
                'ok': False,
                'blocked': False,
                'from_cache': False,
                'reason': 'The SSRF guard refused this address.',
                'attempts': [],
            }

        cached = self.cache.get(url, proxy)
        if cached:
            return {
                'ok': True,
                'url': cached['url'],
                'html': cached['html'],
                'tier': 'cache',
                'status': cached['status'],
                'from_cache': True,
                'blocked': False,
                'attempts': [
                    asdict(Attempt('cache', True, status=cached['status'], reason=f"served from the {cached['origin_tier']} fetch"))
                ],
            }

        # The escalation ladder as a whole gets one budget, not one budget per
        # tier. Three tiers each allowed their own generous timeout added up to
        # far more than the caller was willing to wait, and the caller's own
        # timer then fired mid-escalation, so the work was thrown away anyway.
        deadline = time.monotonic() + max(1.0, (budget_ms if budget_ms else timeout_ms * 3) / 1000)

        def left_ms() -> int:
            return int((deadline - time.monotonic()) * 1000)

        ladder = (
            ('curl_cffi', lambda ms: self._fetch_cffi(url, ms, proxy)),
            ('patchright', lambda ms: self._fetch_browser('patchright', url, ms, proxy, block_media)),
            ('camoufox', lambda ms: self._fetch_browser('camoufox', url, ms, proxy, block_media)),
        )
        preferred = {
            'curl_cffi': timeout_ms,
            'patchright': max(timeout_ms * 2, 12000),
            'camoufox': max(timeout_ms * 3, 18000),
        }

        for tier, run in ladder:
            unavailable = self._tier_unavailable.get(tier)
            if unavailable:
                attempts.append(Attempt(tier, False, reason=unavailable, elapsed_ms=0))
                continue

            allowance = min(preferred[tier], left_ms())
            if allowance < 1500:
                attempts.append(
                    Attempt(tier, False, timed_out=True, elapsed_ms=0,
                            reason='the time allowed for this page was spent by the earlier tiers')
                )
                continue

            result, attempt = await run(allowance)
            attempts.append(attempt)
            if result:
                self.cache.put(url, proxy, result['url'], result['html'], result['tier'], result['status'])
                return {
                    'ok': True,
                    **result,
                    'from_cache': False,
                    'blocked': False,
                    'attempts': [asdict(a) for a in attempts],
                }

        blocked = any(a.blocked for a in attempts)
        reason = next((a.reason for a in reversed(attempts) if a.reason), 'Every available transport tier failed.')
        return {
            'ok': False,
            'blocked': blocked,
            'from_cache': False,
            'reason': reason,
            'attempts': [asdict(a) for a in attempts],
        }

    async def close(self) -> None:
        for context in list(self._patch_contexts.values()):
            try:
                await context.close()
            except Exception:
                pass
        self._patch_contexts.clear()

        if self._patch_browser is not None:
            try:
                await self._patch_browser.close()
            except Exception:
                pass
            self._patch_browser = None

        if self._patchright is not None:
            try:
                await self._patchright.stop()
            except Exception:
                pass
            self._patchright = None

        for manager in list(self._camoufox_managers.values()):
            try:
                await manager.__aexit__(None, None, None)
            except Exception:
                pass
        self._camoufox_managers.clear()
        self._camoufox_browsers.clear()

        if self._cffi_session is not None:
            try:
                await self._cffi_session.close()
            except Exception:
                pass
            self._cffi_session = None

        self.cache.close()


async def main() -> None:
    router = TieredRouter()
    _emit(
        {
            'event': 'ready',
            'capabilities': {
                'curl_cffi': AsyncSession is not None,
                'patchright': async_playwright is not None,
                'camoufox': AsyncCamoufox is not None,
                'sqlite_cache': router.cache.available,
            },
            'cache_entries': router.cache.entries(),
            'cache_error': router.cache.error or '',
        }
    )

    tasks: set[asyncio.Task[Any]] = set()
    write_lock = asyncio.Lock()

    async def handle(message: dict[str, Any]) -> None:
        request_id = str(message.get('id') or '')
        try:
            result = await router.fetch(
                str(message.get('url') or ''),
                int(message.get('timeout_ms') or 8000),
                str(message.get('proxy') or ''),
                bool(message.get('block_media', True)),
                int(message['budget_ms']) if message.get('budget_ms') else None,
            )
        except Exception as exc:
            result = {
                'ok': False,
                'blocked': False,
                'from_cache': False,
                'reason': f'worker error: {type(exc).__name__}: {str(exc)[:180]}',
                'attempts': [],
            }
        result['id'] = request_id
        async with write_lock:
            _emit(result)

    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if line == '':
                break
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            op = message.get('op')
            if op == 'shutdown':
                break
            if op != 'fetch':
                continue
            task = asyncio.create_task(handle(message))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await router.close()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
