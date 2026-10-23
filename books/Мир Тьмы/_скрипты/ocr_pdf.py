"""OCR скан-PDF в txt (страницы разделены \\f). Нужны pdftoppm/pdfinfo (poppler) и tesseract.
Запуск: python -I ocr_pdf.py <pdf> <out.txt> [lang=eng] [dpi=300]
Можно прервать и запустить снова — продолжит с последней готовой страницы."""
import os, re, subprocess, sys, tempfile

pdf, out = sys.argv[1], sys.argv[2]
lang = sys.argv[3] if len(sys.argv) > 3 else 'eng'
dpi = sys.argv[4] if len(sys.argv) > 4 else '300'
info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
n = int(re.search(r'Pages:\s+(\d+)', info).group(1))
done = 0
if os.path.exists(out):
    done = open(out, encoding='utf-8').read().count('\f')
tmp = tempfile.mkdtemp(prefix='ocr_')
with open(out, 'a', encoding='utf-8', newline='\n') as f:
    for p in range(done + 1, n + 1):
        base = os.path.join(tmp, 'p')
        subprocess.run(['pdftoppm', '-f', str(p), '-l', str(p), '-r', dpi, '-gray', '-png', '-singlefile', pdf, base], check=True)
        r = subprocess.run(['tesseract', base + '.png', '-', '-l', lang, '--psm', '3'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        f.write(r.stdout.strip() + '\n\f')
        f.flush()
        if p % 20 == 0:
            print(f'{os.path.basename(out)}: {p}/{n}', flush=True)
print(f'DONE {out} {n} pages', flush=True)
