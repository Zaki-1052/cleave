# Fix SSRF Bypass in Server Import Host Validation

## Context

The security review of the FTP/SFTP server import feature (commit `9ad730f`) identified an SSRF bypass: `0.0.0.0/8` is missing from `_BLOCKED_NETWORKS`, so a user can specify `host: "0.0.0.0"` to reach localhost services (Postgres on 5432, FastAPI on 8000). Additionally, IPv6-mapped IPv4 addresses like `::ffff:127.0.0.1` bypass the IPv4 blocklist because Python's `ipaddress` module treats them as `IPv6Address` objects that don't match IPv4 `ip_network` ranges.

## Changes

### 1. Add `0.0.0.0/8` to blocklist
**File**: `backend/services/server_import_service.py` (line ~56)

Add `ipaddress.ip_network("0.0.0.0/8")` to `_BLOCKED_NETWORKS` after the link-local entry.

### 2. Unwrap IPv6-mapped IPv4 addresses before checking
**File**: `backend/services/server_import_service.py` (line ~74, inside `_validate_host`)

After `ip = ipaddress.ip_address(sockaddr[0])`, add:
```python
# Unwrap IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
    ip = ip.ipv4_mapped
```

### 3. Add tests for the new blocks
**File**: `backend/tests/test_server_import.py`

Add to `TestSSRFValidation`:
- `test_block_zero_address` — `_validate_host("0.0.0.0")` raises
- `test_block_ipv6_mapped_loopback` — mock `socket.getaddrinfo` to return `::ffff:127.0.0.1`, assert blocked
- `test_block_ipv6_mapped_metadata` — mock to return `::ffff:169.254.169.254`, assert blocked

## Verification

```bash
docker compose exec api pytest tests/test_server_import.py -v -k "TestSSRFValidation"
```
