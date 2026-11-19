#!/usr/bin/env python3
import os
import sys
import json
import ssl
import struct
import base64
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if os.path.isdir('/opt/craft-office'):
    sys.path.append('/opt/craft-office')
import scanner_engine


def build_ipp_get_attributes(printer_uri: str) -> bytes:
    # IPP v2.0, operation Get-Printer-Attributes (0x000B), request-id 1
    buf = bytearray(struct.pack('>BBHI', 2, 0, 0x000B, 1))
    buf.append(0x01)  # operation-attributes-tag
    for name, val, tag in [
        (b'attributes-charset', b'utf-8', 0x47),
        (b'attributes-natural-language', b'en', 0x48),
        (b'printer-uri', printer_uri.encode('utf-8'), 0x45),
    ]:
        buf.append(tag)
        buf.extend(struct.pack('>H', len(name)) + name)
        buf.extend(struct.pack('>H', len(val)) + val)
    buf.append(0x03)  # end-of-attributes-tag
    return bytes(buf)


def build_ipp_print_job(printer_uri: str, job_name: str, mime_type: str, doc_bytes: bytes) -> bytes:
    # IPP v2.0, operation Print-Job (0x0002), request-id 2
    buf = bytearray(struct.pack('>BBHI', 2, 0, 0x0002, 2))
    buf.append(0x01)  # operation-attributes-tag
    for name, val, tag in [
        (b'attributes-charset', b'utf-8', 0x47),
        (b'attributes-natural-language', b'en', 0x48),
        (b'printer-uri', printer_uri.encode('utf-8'), 0x45),
        (b'job-name', job_name.encode('utf-8')[:120], 0x42),
        (b'document-format', mime_type.encode('utf-8'), 0x49),
    ]:
        buf.append(tag)
        buf.extend(struct.pack('>H', len(name)) + name)
        buf.extend(struct.pack('>H', len(val)) + val)
    buf.append(0x03)  # end-of-attributes-tag
    buf.extend(doc_bytes)
    return bytes(buf)


def ipp_request(ip: str, payload_fn, timeout: float = 4.0) -> tuple:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for scheme in ('http', 'https'):
        url = f'{scheme}://{ip}:631/ipp/print'
        printer_uri = f'ipp://{ip}:631/ipp/print'
        body = payload_fn(printer_uri)
        req = urllib.request.Request(
            url,
            data=body,
            method='POST',
            headers={
                'Content-Type': 'application/ipp',
                'User-Agent': 'SeaCraft-IPP/1.0',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx if scheme == 'https' else None) as resp:
                resp_bytes = resp.read()
                if len(resp_bytes) >= 8:
                    _, _, status_code, req_id = struct.unpack('>BBHI', resp_bytes[:8])
                    return True, url, status_code, resp_bytes
                return True, url, 0, resp_bytes
        except Exception:
            continue
    return False, f'http://{ip}:631/ipp/print', -1, b''


def cmd_printer_status(ip: str):
    ip = (ip or '192.168.1.149').strip()
    ok, url, status_code, raw = ipp_request(ip, build_ipp_get_attributes, timeout=2.5)
    if ok and status_code < 0x0400:
        return {
            'online': True,
            'ip': ip,
            'ipp_url': url,
            'ipp_status': f'0x{status_code:04x}',
            'state': 'Idle / Ready (IPP)',
        }
    return {
        'online': False,
        'ip': ip,
        'ipp_url': url,
        'state': 'Offline / Unreachable on port 631 (Use Browser Print or check printer power)',
    }


def cmd_print_file(ip: str, file_path: str, job_name: str):
    ip = (ip or '192.168.1.149').strip()
    if not os.path.isfile(file_path):
        return {'ok': False, 'error': 'File not found'}
    ext = os.path.splitext(file_path)[1].lower()
    mime_map = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.txt': 'text/plain',
    }
    mime = mime_map.get(ext, 'application/octet-stream')
    with open(file_path, 'rb') as f:
        doc_bytes = f.read()

    ok, url, status_code, _ = ipp_request(
        ip,
        lambda uri: build_ipp_print_job(uri, job_name or os.path.basename(file_path), mime, doc_bytes),
        timeout=12.0,
    )
    if not ok:
        return {'ok': False, 'error': f'Printer at {ip}:631 is unreachable. Use Browser Print instead.'}
    if status_code >= 0x0400:
        return {'ok': False, 'error': f'Printer rejected IPP job (status 0x{status_code:04x}). Format {mime} may not be supported directly; use Browser Print or export PDF.'}
    return {'ok': True, 'ipp_url': url, 'ipp_status': f'0x{status_code:04x}', 'mime': mime}


def cmd_scan(payload: dict):
    source = (payload.get('source') or 'hardware').lower()
    ip = (payload.get('ip') or '192.168.1.149').strip()
    dpi = int(payload.get('dpi') or 300)
    color = payload.get('color') or 'RGB24'
    fmt = (payload.get('format') or 'docx').lower()
    lang = payload.get('ocrLang') or 'ell+eng'
    docx_mode = payload.get('docxMode') or 'both'
    dest_path = payload.get('destPath')
    input_name = payload.get('inputFilename') or 'scan.png'

    if source == 'hardware':
        raw_bytes = scanner_engine.scan_from_escl_hardware(ip, dpi=dpi, color_mode=color)
        input_name = 'flatbed.jpg'
    else:
        b64 = payload.get('imageBase64') or ''
        if not b64:
            return {'ok': False, 'error': 'No image uploaded for OCR scan'}
        raw_bytes = base64.b64decode(b64)

    png_bytes, img_w, img_h = scanner_engine.normalize_input_to_png(raw_bytes, input_name)
    ocr_text = ''
    if fmt in ('docx', 'xlsx') and docx_mode != 'image_only':
        ocr_text = scanner_engine.run_tesseract_ocr(png_bytes, lang=lang)

    if fmt == 'docx':
        out_bytes = scanner_engine.build_scanned_docx(png_bytes, img_w, img_h, ocr_text, docx_mode=docx_mode)
    elif fmt == 'pdf':
        out_bytes = scanner_engine.run_tesseract_searchable_pdf(png_bytes, lang=lang)
        ocr_text = scanner_engine.run_tesseract_ocr(png_bytes, lang=lang)
    elif fmt == 'xlsx':
        out_bytes = scanner_engine.build_scanned_xlsx(ocr_text)
    elif fmt in ('jpg', 'jpeg'):
        out_bytes, _, _, img_w, img_h = scanner_engine.convert_image_bytes(png_bytes, 'jpg', quality=90)
    else:
        out_bytes, _, _, img_w, img_h = scanner_engine.convert_image_bytes(png_bytes, 'png')

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, 'wb') as f:
        f.write(out_bytes)
    try:
        os.chmod(dest_path, 0o666)
    except Exception:
        pass

    return {
        'ok': True,
        'size': len(out_bytes),
        'width': img_w,
        'height': img_h,
        'ocr_preview': (ocr_text or '')[:600],
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'ok': False, 'error': 'Missing command'}))
        sys.exit(1)

    cmd = sys.argv[1]
    try:
        if cmd == 'scanner-status':
            ip = sys.argv[2] if len(sys.argv) > 2 else '192.168.1.149'
            print(json.dumps(scanner_engine.probe_escl_scanner(ip)))
        elif cmd == 'scanner-discover':
            found = scanner_engine.discover_scanners_on_lan()
            print(json.dumps({'ok': True, 'scanners': found}))
        elif cmd == 'printer-status':
            ip = sys.argv[2] if len(sys.argv) > 2 else '192.168.1.149'
            print(json.dumps(cmd_printer_status(ip)))
        elif cmd == 'print-file':
            ip = sys.argv[2]
            fpath = sys.argv[3]
            jname = sys.argv[4] if len(sys.argv) > 4 else ''
            print(json.dumps(cmd_print_file(ip, fpath, jname)))
        elif cmd == 'scan':
            payload = json.loads(sys.stdin.read())
            print(json.dumps(cmd_scan(payload)))
        else:
            print(json.dumps({'ok': False, 'error': f'Unknown command: {cmd}'}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
