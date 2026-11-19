#!/usr/bin/env python3
import os
import io
import re
import ssl
import time
import zipfile
import tempfile
import subprocess
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from PIL import Image


def probe_escl_scanner(ip: str, timeout: float = 2.2, include_xml: bool = False) -> dict:
    ip = (ip or "192.168.1.149").strip()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    candidates = [
        f"http://{ip}/eSCL",
        f"http://{ip}:8080/eSCL",
        f"https://{ip}/eSCL",
    ]

    for base_url in candidates:
        cap_url = f"{base_url}/ScannerCapabilities"
        try:
            req = urllib.request.Request(cap_url, headers={"User-Agent": "CraftOffice-eSCL/1.0"})
            with urllib.request.urlopen(req, timeout=timeout, context=ctx if base_url.startswith("https") else None) as resp:
                xml_bytes = resp.read()
            root = ET.fromstring(xml_bytes)
            model = "HP DeskJet 2720e series"
            for elem in root.iter():
                if elem.tag.endswith("MakeAndModel") and elem.text:
                    model = elem.text.strip()
                    break

            state = "Idle"
            try:
                st_req = urllib.request.Request(f"{base_url}/ScannerStatus", headers={"User-Agent": "CraftOffice-eSCL/1.0"})
                with urllib.request.urlopen(st_req, timeout=timeout, context=ctx if base_url.startswith("https") else None) as st_resp:
                    st_root = ET.fromstring(st_resp.read())
                for elem in st_root.iter():
                    if elem.tag.endswith("State") and elem.text:
                        state = elem.text.strip()
                        break
            except Exception:
                pass

            res_dict = {
                "online": True,
                "ip": ip,
                "model": model,
                "state": state,
                "escl_url": base_url,
            }
            if include_xml:
                res_dict["raw_xml"] = xml_bytes.decode("utf-8", "replace")
            return res_dict
        except Exception:
            continue

    return {
        "online": False,
        "ip": ip,
        "model": f"HP DeskJet 2720e ({ip})",
        "state": "Offline / Asleep (Power on printer or use Camera/Image Upload below)",
        "escl_url": f"http://{ip}/eSCL",
    }


def discover_scanners_on_lan() -> list:
    found = []
    seen_ips = set()
    try:
        proc = subprocess.run(
            ["airscan-discover"],
            capture_output=True,
            text=True,
            timeout=6,
        )
        out = proc.stdout or ""
        for line in out.splitlines():
            line = line.strip()
            # Format: HP DeskJet 2700 series [096A34] = http://192.168.1.149:8080/eSCL/, eSCL
            m = re.match(r'^"?([^"=]+?)"?\s*=\s*(https?://(\d+\.\d+\.\d+\.\d+)(?::\d+)?/[^,\s]+)', line)
            if m:
                ip = m.group(3)
                if ip not in seen_ips:
                    seen_ips.add(ip)
                    found.append({
                        "name": m.group(1).strip(),
                        "escl_url": m.group(2).rstrip("/"),
                        "ip": ip,
                    })
    except Exception:
        pass
    return found


def scan_from_escl_hardware(ip: str, dpi: int = 300, color_mode: str = "RGB24") -> bytes:
    status = probe_escl_scanner(ip, timeout=3.0)
    if not status["online"]:
        raise RuntimeError(
            f"Scanner at {ip} ({status['model']}) is currently unreachable or asleep. "
            f"Please make sure the HP DeskJet 2720e is powered on and connected to Wi-Fi, "
            f"or use 'Upload Image / Phone Camera Scan' below."
        )

    base_url = status["escl_url"]
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    use_ctx = ctx if base_url.startswith("https") else None

    escl_color = {
        "color": "RGB24",
        "RGB24": "RGB24",
        "gray": "Grayscale8",
        "Grayscale8": "Grayscale8",
        "bw": "BlackAndWhite1",
        "BlackAndWhite1": "BlackAndWhite1",
    }.get(color_mode, "RGB24")

    dpi = int(dpi) if int(dpi) in (100, 150, 200, 300, 600) else 300

    # A4 in 1/300th inch units (2480 x 3508)
    scan_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03">
  <pwg:Version>2.0</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
      <pwg:Width>2480</pwg:Width>
      <pwg:Height>3508</pwg:Height>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>Platen</pwg:InputSource>
  <scan:ColorMode>{escl_color}</scan:ColorMode>
  <scan:XResolution>{dpi}</scan:XResolution>
  <scan:YResolution>{dpi}</scan:YResolution>
  <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
</scan:ScanSettings>""".encode("utf-8")

    jobs_url = f"{base_url}/ScanJobs"
    req = urllib.request.Request(
        jobs_url,
        data=scan_xml,
        headers={
            "Content-Type": "text/xml",
            "User-Agent": "CraftOffice-eSCL/1.0",
        },
        method="POST",
    )

    job_location = None
    try:
        with urllib.request.urlopen(req, timeout=15, context=use_ctx) as resp:
            job_location = resp.headers.get("Location")
    except urllib.error.HTTPError as e:
        job_location = e.headers.get("Location") if e.headers else None
        if not job_location:
            raise RuntimeError(f"Scanner rejected scan job (HTTP {e.code}): {e.reason}")

    if not job_location:
        raise RuntimeError("Scanner did not return a ScanJob Location URI.")

    if job_location.startswith("/"):
        parsed_base = urllib.request.urlparse(base_url)
        job_location = f"{parsed_base.scheme}://{parsed_base.netloc}{job_location}"

    next_doc_url = job_location.rstrip("/") + "/NextDocument"

    # Poll NextDocument while flatbed carriages move
    last_err = None
    for _ in range(25):
        try:
            doc_req = urllib.request.Request(next_doc_url, headers={"User-Agent": "CraftOffice-eSCL/1.0"})
            with urllib.request.urlopen(doc_req, timeout=45, context=use_ctx) as doc_resp:
                img_data = doc_resp.read()
                if img_data and len(img_data) > 256:
                    return img_data
        except urllib.error.HTTPError as he:
            if he.code in (503, 404, 409):
                time.sleep(1.2)
                last_err = he
                continue
            raise RuntimeError(f"Error retrieving scanned page (HTTP {he.code})")
        except Exception as ex:
            last_err = ex
            time.sleep(1.2)

    raise RuntimeError(f"Timed out waiting for flatbed scan data: {last_err}")



def convert_image_bytes(png_bytes: bytes, target_fmt: str = "png", quality: int = 90) -> tuple:
    """Converts normalized image bytes to PNG or JPEG, returning (bytes, extension, mime_type, width, height)."""
    fmt = target_fmt.lower().lstrip(".")
    img = Image.open(io.BytesIO(png_bytes))
    quality = max(1, min(100, int(quality)))
    if fmt in ("jpg", "jpeg"):
        if img.mode != "RGB":
            img = img.convert("RGB")
        out_buf = io.BytesIO()
        img.save(out_buf, format="JPEG", quality=quality, optimize=True)
        return out_buf.getvalue(), ".jpg", "image/jpeg", img.width, img.height
    else:
        if img.mode not in ("RGB", "L", "RGBA"):
            img = img.convert("RGB")
        out_buf = io.BytesIO()
        img.save(out_buf, format="PNG", optimize=True)
        return out_buf.getvalue(), ".png", "image/png", img.width, img.height

def normalize_input_to_png(raw_bytes: bytes, filename_hint: str = "scan.png") -> tuple:
    ext = os.path.splitext(filename_hint)[1].lower()
    if ext == ".pdf" or raw_bytes[:4] == b"%PDF":
        with tempfile.TemporaryDirectory() as tmpd:
            pdf_path = os.path.join(tmpd, "input.pdf")
            with open(pdf_path, "wb") as f:
                f.write(raw_bytes)
            out_prefix = os.path.join(tmpd, "page")
            subprocess.run(["pdftoppm", "-png", "-r", "300", "-singlefile", pdf_path, out_prefix], check=True, timeout=30)
            png_path = out_prefix + ".png"
            with open(png_path, "rb") as f:
                raw_bytes = f.read()

    img = Image.open(io.BytesIO(raw_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    out_buf = io.BytesIO()
    img.save(out_buf, format="PNG")
    return out_buf.getvalue(), img.width, img.height


def run_tesseract_ocr(png_bytes: bytes, lang: str = "ell+eng") -> str:
    lang = lang if lang in ("ell+eng", "eng", "ell") else "ell+eng"
    with tempfile.TemporaryDirectory() as tmpd:
        img_path = os.path.join(tmpd, "scan.png")
        with open(img_path, "wb") as f:
            f.write(png_bytes)
        proc = subprocess.run(
            ["tesseract", img_path, "stdout", "-l", lang],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return (proc.stdout or "").strip()


def run_tesseract_searchable_pdf(png_bytes: bytes, lang: str = "ell+eng") -> bytes:
    lang = lang if lang in ("ell+eng", "eng", "ell") else "ell+eng"
    with tempfile.TemporaryDirectory() as tmpd:
        img_path = os.path.join(tmpd, "scan.png")
        out_base = os.path.join(tmpd, "out")
        with open(img_path, "wb") as f:
            f.write(png_bytes)
        subprocess.run(
            ["tesseract", img_path, out_base, "-l", lang, "pdf"],
            check=True,
            capture_output=True,
            timeout=60,
        )
        with open(out_base + ".pdf", "rb") as f:
            return f.read()


def xml_escape(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def build_scanned_docx(png_bytes: bytes, img_w: int, img_h: int, ocr_text: str, docx_mode: str = "both") -> bytes:
    # Convert image dimensions to EMUs (max width 6.0 inches = 5486400 EMUs)
    max_w_emu = 5486400
    aspect = (img_h / img_w) if img_w > 0 else 1.414
    cx = max_w_emu
    cy = int(max_w_emu * aspect)
    if cy > 7772400:  # max height ~8.5 inches
        scale = 7772400 / cy
        cx = int(cx * scale)
        cy = 7772400

    paragraphs_xml = []

    if docx_mode in ("both", "text_only"):
        lines = [ln.strip() for ln in (ocr_text or "").splitlines()]
        non_empty = [ln for ln in lines if ln]
        if non_empty:
            paragraphs_xml.append(
                '<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr>'
                '<w:t>Scanned Document (OCR Text)</w:t></w:r></w:p>'
            )
            for ln in lines:
                if not ln:
                    paragraphs_xml.append("<w:p/>")
                else:
                    paragraphs_xml.append(
                        f'<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">{xml_escape(ln)}</w:t></w:r></w:p>'
                    )
        elif docx_mode == "text_only":
            paragraphs_xml.append(
                '<w:p><w:r><w:t>(No OCR text detected on scanned page)</w:t></w:r></w:p>'
            )

    if docx_mode in ("both", "image_only"):
        if docx_mode == "both" and paragraphs_xml:
            paragraphs_xml.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        drawing_p = f"""<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="{cx}" cy="{cy}"/>
        <wp:docPr id="1" name="ScannedPage"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="1" name="scan.png"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rIdImg1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>"""
        paragraphs_xml.append(drawing_p)

    body_inner = "\n    ".join(paragraphs_xml)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>""")
        zf.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>""")
        zf.writestr("word/_rels/document.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/scan.png"/>
</Relationships>""")
        zf.writestr("word/media/scan.png", png_bytes)
        zf.writestr("word/document.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {body_inner}
  </w:body>
</w:document>""")
    return buf.getvalue()


def build_scanned_xlsx(ocr_text: str) -> bytes:
    lines = [ln.strip() for ln in (ocr_text or "").splitlines() if ln.strip()]
    if not lines:
        lines = ["(No text detected in scan)"]

    rows_xml = []
    for r_idx, ln in enumerate(lines, start=1):
        cols = re.split(r"\t+|\s{2,}", ln)
        cells_xml = []
        for c_idx, val in enumerate(cols[:26]):
            col_letter = chr(ord("A") + c_idx)
            ref = f"{col_letter}{r_idx}"
            clean_val = val.strip()
            if re.match(r"^-?\d+(\.\d+)?$", clean_val):
                cells_xml.append(f'<c r="{ref}"><v>{clean_val}</v></c>')
            else:
                cells_xml.append(f'<c r="{ref}" t="inlineStr"><is><t>{xml_escape(clean_val)}</t></is></c>')
        rows_xml.append(f'    <row r="{r_idx}">{"".join(cells_xml)}</row>')

    sheet_rows = "\n".join(rows_xml)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>""")
        zf.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        zf.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""")
        zf.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Scanned OCR Data" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""")
        zf.writestr("xl/styles.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>""")
        zf.writestr("xl/worksheets/sheet1.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="8" width="28" customWidth="1"/></cols>
  <sheetData>
{sheet_rows}
  </sheetData>
</worksheet>""")
    return buf.getvalue()
