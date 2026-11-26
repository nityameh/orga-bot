"""scripts/docs/md2docx.py
Build an investor-style .docx from a report written in Markdown, using pandoc.
The Markdown in docs/ stays the source of truth; the .docx is a generated copy.
Adds: cover page (title/subtitle/date/status), Word TOC field (Word fills it on
open), page-number footer and table styling (via a patched reference.docx),
compact 10 pt typography, blank lines pandoc needs before lists and tables.
Requires: pandoc on PATH, Python 3.
Usage: python scripts/docs/md2docx.py docs/strategy/STRATEGY_REPORT.md docs/strategy/Orga_Strategy_Report_v1.docx <tmp-workdir>
Docs: docs/README.md (doc map)
"""
import re, subprocess, sys, zipfile, shutil, os

src, out, work = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(work, exist_ok=True)
PANDOC = "pandoc"

# 1. reference.docx with a centred "Page N of M" footer and nicer table style
ref_default = os.path.join(work, "ref_default.docx")
ref = os.path.join(work, "reference.docx")
subprocess.run([PANDOC, "-o", ref_default, "--print-default-data-file", "reference.docx"], check=True)

FOOTER = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
          '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:t xml:space="preserve">Orga — Strategy Report · Draft for review · Page </w:t></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>'
          '<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="808080"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
          '</w:p></w:ftr>')

with zipfile.ZipFile(ref_default) as zin, zipfile.ZipFile(ref, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "word/document.xml":
            s = data.decode("utf8")
            ns_r = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
            if ns_r not in s:
                s = s.replace("<w:document ", "<w:document " + ns_r + " ", 1)
            s = re.sub(r"<w:sectPr([^>]*)>", r'<w:sectPr\1><w:footerReference w:type="default" r:id="rIdFooterPg"/>', s, count=1)
            # A4, 2 cm margins
            s = re.sub(r"<w:pgMar [^>]*/>", '<w:pgMar w:top="964" w:right="964" w:bottom="964" w:left="964" w:header="482" w:footer="482" w:gutter="0"/>', s)
            data = s.encode("utf8")
        elif item.filename == "word/_rels/document.xml.rels":
            s = data.decode("utf8").replace("</Relationships>",
                '<Relationship Id="rIdFooterPg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer_pg.xml"/></Relationships>')
            data = s.encode("utf8")
        elif item.filename == "[Content_Types].xml":
            s = data.decode("utf8").replace("</Types>",
                '<Override PartName="/word/footer_pg.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
            data = s.encode("utf8")
        elif item.filename == "word/styles.xml":
            s = data.decode("utf8")
            # Compact investor-report typography: 10 pt body, tight spacing, smaller headings
            s = re.sub(r'(<w:docDefaults>.*?<w:rPrDefault><w:rPr>)', r'\1<w:sz w:val="20"/><w:szCs w:val="20"/>', s, count=1, flags=re.S)
            for sid, size, before, after in [("Heading1", 30, 240, 80), ("Heading2", 24, 180, 60), ("Heading3", 21, 120, 40), ("Title", 52, 2400, 120), ("Subtitle", 30, 0, 600)]:
                s = re.sub(r'(<w:style w:type="paragraph"[^>]*w:styleId="' + sid + r'">)(.*?)(</w:style>)',
                    lambda m, size=size, before=before, after=after: m.group(1) + re.sub(r'<w:sz w:val="\d+"/>', '', re.sub(r'<w:spacing [^>]*/>', '', m.group(2)))
                        .replace('<w:pPr>', f'<w:pPr><w:spacing w:before="{before}" w:after="{after}"/>', 1)
                        .replace('<w:rPr>', f'<w:rPr><w:sz w:val="{size}"/>', 1) + m.group(3), s, count=1, flags=re.S)
            for sid in ("BodyText", "FirstParagraph", "Compact"):
                s = re.sub(r'(<w:style w:type="paragraph"[^>]*w:styleId="' + sid + r'">.*?)<w:spacing [^>]*/>', r'\1<w:spacing w:before="40" w:after="80"/>', s, count=1, flags=re.S)
            # Table style "Table": grid borders + shaded header row, smaller font
            s = re.sub(r'(<w:style w:type="table"[^>]*w:styleId="Table">)(.*?)(</w:style>)',
                lambda m: m.group(1) + '<w:name w:val="Table"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="99"/>'
                '<w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr><w:rPr><w:sz w:val="17"/></w:rPr>'
                '<w:tblPr><w:tblBorders>'
                '<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/>'
                '<w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/>'
                '<w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>'
                '</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
                '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>'
                '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="1F3864"/></w:tcPr></w:tblStylePr>'
                + m.group(3), s, flags=re.S)
            data = s.encode("utf8")
        zout.writestr(item, data)
    zout.writestr("word/footer_pg.xml", FOOTER)

# 2. Pre-process markdown: drop the hand-written title block, add metadata, cover breaks and TOC
md = open(src, encoding="utf8").read()
body = md.split("\n---\n", 1)[1] if md.startswith("# ") else md   # everything after the first horizontal rule
note = re.search(r"> \*\*How to read the numbers\.\*\*.*?(?=\n\n)", md, re.S)
PB = '\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n'
TOC = ('\n```{=openxml}\n<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>Contents</w:t></w:r></w:p>'
       '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
       '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>'
       '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
       '<w:r><w:t>Open in Word and choose Update Table to fill in the contents.</w:t></w:r>'
       '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>\n```\n')
meta = (  # cover metadata for the strategy report
        '---\ntitle: "Orga — Strategy Report"\nsubtitle: "A chat-first notebook for writers"\n'
        'author: "Prepared for prospective investors and co-founders"\n'
        'date: "12 November 2026 · Version 1.0 · Draft for review"\n---\n')
cover_note = ("\n" + note.group(0) + "\n") if note else ""
# Page break before each top-level section (## N.) except the first
parts = re.split(r"(?m)^(?=## \d+\. )", body)
body2 = parts[0] + "".join(p for p in parts[1:])  # no forced breaks between sections: keeps it within 10–15 pages
# Horizontal rules between sections are redundant with page breaks
body2 = re.sub(r"(?m)^---\s*$", "", body2)
# Pandoc needs a blank line before a list that follows a paragraph line (GitHub doesn't)
LIST = r"(?:[-*]|\d+\.)\s"
body2 = re.sub(r"(?m)^(?!\s*" + LIST + r")(?!\s*\|)(?!\s*$)(.+)\n(?=" + LIST + r")", r"\1\n\n", body2)
# ...and before a table that follows a paragraph line
body2 = re.sub(r"(?m)^(?!\s*\|)(?!\s*$)(.+)\n(?=\|)", r"\1\n\n", body2)
pre = meta + cover_note + PB + TOC + PB + body2
pre_path = os.path.join(work, "pre.md")
open(pre_path, "w", encoding="utf8").write(pre)

# 3. Convert
subprocess.run([PANDOC, pre_path, "-f", "markdown+pipe_tables+raw_attribute-auto_identifiers", "-t", "docx",
                "--reference-doc", ref, "-o", out], check=True)
print("wrote", out)
