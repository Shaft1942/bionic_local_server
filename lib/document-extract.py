"""Extract bounded text only. Documents never execute macros or external links."""
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

LIMIT = 180_000
data = sys.stdin.buffer.read(20_000_001)
if len(data) > 20_000_000:
    raise ValueError('size')
kind = sys.argv[1]
parts = []
truncated = False
if kind == 'pdf':
    from pypdf import PdfReader
    pdf = PdfReader(io.BytesIO(data))
    if pdf.is_encrypted:
        raise ValueError('encrypted')
    truncated = len(pdf.pages) > 80
    for page in list(pdf.pages)[:80]:
        parts.append(page.extract_text() or '')
        if sum(map(len, parts)) > LIMIT:
            truncated = True
            break
else:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if len(archive.infolist()) > 5000 or sum(x.file_size for x in archive.infolist()) > 40_000_000:
            raise ValueError('expanded size')
        if kind == 'docx':
            root = ET.fromstring(archive.read('word/document.xml'))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            parts = [''.join(t.text or '' for t in p.findall('.//w:t', ns)) for p in root.findall('.//w:p', ns)]
        elif kind == 'xlsx':
            ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            strings = []
            if 'xl/sharedStrings.xml' in archive.namelist():
                strings = [''.join(t.text or '' for t in item.findall('.//s:t', ns)) for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns)]
            sheets = sorted(name for name in archive.namelist() if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'))
            truncated = len(sheets) > 12
            for name in sheets[:12]:
                parts.append('Feuille : ' + name.rsplit('/', 1)[-1])
                rows = ET.fromstring(archive.read(name)).findall('.//s:row', ns)
                truncated = truncated or len(rows) > 2000
                for row in rows[:2000]:
                    cells = []
                    for cell in row.findall('s:c', ns):
                        value = cell.findtext('s:v', '', ns)
                        if cell.get('t') == 's':
                            value = strings[int(value)]
                        elif cell.get('t') == 'inlineStr':
                            value = ''.join(t.text or '' for t in cell.findall('.//s:t', ns))
                        cells.append(cell.get('r', '') + '=' + value)
                    parts.append('\t'.join(cells))
        else:
            raise ValueError('format')
text = '\n'.join(parts)
truncated = truncated or len(text) > LIMIT
sys.stdout.buffer.write(json.dumps({'text': text[:LIMIT], 'truncated': truncated}, ensure_ascii=False).encode('utf-8'))
