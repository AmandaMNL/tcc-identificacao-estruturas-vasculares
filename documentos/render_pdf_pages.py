from pathlib import Path

import pypdfium2 as pdfium


source = Path(__file__).with_name("qa_render") / "Texto_base_TCC_identificacao_vascular.pdf"
output = source.parent
document = pdfium.PdfDocument(source)
for index in range(len(document)):
    page = document[index]
    image = page.render(scale=1.5).to_pil()
    image.save(output / f"page-{index + 1}.png")
print(len(document))
