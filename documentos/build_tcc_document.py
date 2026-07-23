from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "documentos" / "Texto_base_TCC_identificacao_vascular.docx"
IMAGE = ROOT / "data" / "images" / "2_rgb_labels.png"

FONT = "Times New Roman"
BLACK = RGBColor(0, 0, 0)
MUTED = RGBColor(80, 80, 80)
CONTENT_DXA = 9072


def set_run_font(run, size=12, bold=False, italic=False, color=BLACK):
    run.font.name = FONT
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), FONT)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), FONT)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), FONT)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = color


def configure_document(document: Document) -> None:
    section = document.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(3)
    section.left_margin = Cm(3)
    section.right_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.header_distance = Cm(1.25)
    section.footer_distance = Cm(1.25)

    normal = document.styles["Normal"]
    normal.font.name = FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    normal.font.size = Pt(12)
    normal.font.color.rgb = BLACK
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal.paragraph_format.first_line_indent = Cm(1.25)
    normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)

    for name, size, before, after in (
        ("Heading 1", 12, 18, 12),
        ("Heading 2", 12, 14, 8),
        ("Heading 3", 12, 10, 6),
    ):
        style = document.styles[name]
        style.font.name = FONT
        style._element.rPr.rFonts.set(qn("w:ascii"), FONT)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = BLACK
        style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        style.paragraph_format.first_line_indent = Cm(0)
        style.paragraph_format.line_spacing = 1.5
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    document.styles["Heading 1"].font.all_caps = True

    numbered = document.styles["List Number"]
    numbered.font.name = FONT
    numbered._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    numbered._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    numbered.font.size = Pt(12)
    numbered.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    numbered.paragraph_format.left_indent = Cm(1.25)
    numbered.paragraph_format.first_line_indent = Cm(-0.63)
    numbered.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    numbered.paragraph_format.space_before = Pt(0)
    numbered.paragraph_format.space_after = Pt(0)


def add_page_number(section) -> None:
    paragraph = section.footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run()
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    run._r.addnext(field)
    set_run_font(run, size=10, color=MUTED)


def add_centered(document, text, size=12, bold=False, italic=False, before=0, after=0):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.line_spacing = 1.5
    run = paragraph.add_run(text)
    set_run_font(run, size=size, bold=bold, italic=italic)
    return paragraph


def add_body(document, text, *, bold_lead=None):
    paragraph = document.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        first = paragraph.add_run(bold_lead)
        set_run_font(first, bold=True)
        rest = paragraph.add_run(text[len(bold_lead) :])
        set_run_font(rest)
    else:
        run = paragraph.add_run(text)
        set_run_font(run)
    return paragraph


def add_no_indent(document, text, *, align=WD_ALIGN_PARAGRAPH.JUSTIFY, italic=False):
    paragraph = document.add_paragraph()
    paragraph.alignment = align
    paragraph.paragraph_format.first_line_indent = Cm(0)
    run = paragraph.add_run(text)
    set_run_font(run, italic=italic)
    return paragraph


def add_numbered_item(document, text):
    paragraph = document.add_paragraph(style="List Number")
    run = paragraph.add_run(text)
    set_run_font(run)
    return paragraph


def add_numbered_list(document, items, *, restart=False):
    num_id = None
    if restart:
        style_num_id = document.styles["List Number"]._element.pPr.numPr.numId.val
        numbering = document.part.numbering_part.element
        existing_ids = [int(node.get(qn("w:numId"))) for node in numbering.findall(qn("w:num"))]
        num_id = max(existing_ids, default=0) + 1
        style_number = next(
            node for node in numbering.findall(qn("w:num"))
            if int(node.get(qn("w:numId"))) == style_num_id
        )
        abstract_num_id = style_number.find(qn("w:abstractNumId")).get(qn("w:val"))

        number = OxmlElement("w:num")
        number.set(qn("w:numId"), str(num_id))
        abstract = OxmlElement("w:abstractNumId")
        abstract.set(qn("w:val"), abstract_num_id)
        number.append(abstract)
        override = OxmlElement("w:lvlOverride")
        override.set(qn("w:ilvl"), "0")
        start = OxmlElement("w:startOverride")
        start.set(qn("w:val"), "1")
        override.append(start)
        number.append(override)
        numbering.append(number)

    for item in items:
        paragraph = add_numbered_item(document, item)
        if num_id is not None:
            num_pr = paragraph._p.get_or_add_pPr().get_or_add_numPr()
            num_pr.get_or_add_ilvl().val = 0
            num_pr.get_or_add_numId().val = num_id


def add_heading(document, text, level=1):
    paragraph = document.add_paragraph(style=f"Heading {level}")
    paragraph.paragraph_format.first_line_indent = Cm(0)
    run = paragraph.add_run(text)
    set_run_font(run, bold=True)
    if level == 1:
        run.font.all_caps = True
    return paragraph


def set_cell_shading(cell, fill):
    properties = cell._tc.get_or_add_tcPr()
    shading = properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        properties.append(shading)
    shading.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    properties = cell._tc.get_or_add_tcPr()
    margins = properties.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        properties.append(margins)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = margins.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            margins.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths):
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    properties = table._tbl.tblPr
    table_width = properties.first_child_found_in("w:tblW")
    table_width.set(qn("w:w"), str(sum(widths)))
    table_width.set(qn("w:type"), "dxa")
    indent = properties.first_child_found_in("w:tblInd")
    if indent is None:
        indent = OxmlElement("w:tblInd")
        properties.append(indent)
    indent.set(qn("w:w"), "120")
    indent.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        column = OxmlElement("w:gridCol")
        column.set(qn("w:w"), str(width))
        grid.append(column)
    for row in table.rows:
        for index, cell in enumerate(row.cells):
            cell.width = Inches(widths[index] / 1440)
            tc_width = cell._tc.get_or_add_tcPr().first_child_found_in("w:tcW")
            tc_width.set(qn("w:w"), str(widths[index]))
            tc_width.set(qn("w:type"), "dxa")
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell)


def add_data_table(document):
    rows = [
        ("Imagens registradas no COCO", "608"),
        ("Anotações registradas no COCO", "16.431"),
        ("Categorias do arquivo COCO", "4"),
        ("Imagens disponíveis localmente", "10"),
        ("Paciente representado localmente", "Patient_001"),
        ("Vasos não dilatados", "155"),
        ("Vasos com dilatação intermediária", "70"),
        ("Vasos altamente dilatados", "14"),
        ("Total de anotações vasculares locais", "239"),
        ("Regiões CCL21+ excluídas da máscara vascular", "12"),
    ]
    table = document.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    headers = table.rows[0].cells
    headers[0].text = "Característica"
    headers[1].text = "Valor observado"
    for cell in headers:
        set_cell_shading(cell, "E7E6E6")
        for paragraph in cell.paragraphs:
            paragraph.paragraph_format.first_line_indent = Cm(0)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in paragraph.runs:
                set_run_font(run, size=10, bold=True)
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = value
        for index, cell in enumerate(cells):
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.first_line_indent = Cm(0)
                paragraph.paragraph_format.line_spacing = 1.0
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT if index == 0 else WD_ALIGN_PARAGRAPH.CENTER
                for run in paragraph.runs:
                    set_run_font(run, size=10)
    set_table_geometry(table, [6500, 2572])
    source = document.add_paragraph()
    source.paragraph_format.first_line_indent = Cm(0)
    source.paragraph_format.space_before = Pt(4)
    source.paragraph_format.space_after = Pt(4)
    source_run = source.add_run(
        "Fonte: elaboração própria a partir de COCO_annotations.json e DCIS.Patient_001.2.json."
    )
    set_run_font(source_run, size=10)


def add_figure(document):
    if not IMAGE.is_file():
        return
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.paragraph_format.keep_with_next = True
    run = paragraph.add_run()
    run.add_picture(str(IMAGE), width=Cm(13.5))
    caption = document.add_paragraph()
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.first_line_indent = Cm(0)
    caption.paragraph_format.space_before = Pt(4)
    caption.paragraph_format.space_after = Pt(0)
    caption.paragraph_format.keep_with_next = True
    caption_run = caption.add_run(
        "Figura 1 – Exemplo de imagem local com contornos de anotação incorporados aos pixels"
    )
    set_run_font(caption_run, size=10, bold=True)
    source = document.add_paragraph()
    source.alignment = WD_ALIGN_PARAGRAPH.CENTER
    source.paragraph_format.first_line_indent = Cm(0)
    source.paragraph_format.space_after = Pt(8)
    source_run = source.add_run("Fonte: material fornecido no projeto, arquivo 2_rgb_labels.png.")
    set_run_font(source_run, size=10)


def add_toc(document):
    add_heading(document, "SUMÁRIO", 1)
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.first_line_indent = Cm(0)
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = ' TOC \\o "1-3" \\h \\z \\u '
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "Atualize este campo no Word para gerar o sumário."
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for element in (begin, instruction, separate, text, end):
        run._r.append(element)
    set_run_font(run)


def add_reference(document, text):
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.paragraph_format.left_indent = Cm(0)
    paragraph.paragraph_format.space_after = Pt(8)
    paragraph.paragraph_format.line_spacing = 1.0
    run = paragraph.add_run(text)
    set_run_font(run, size=11)


def build_document() -> None:
    document = Document()
    configure_document(document)
    add_page_number(document.sections[0])
    core_properties = document.core_properties
    core_properties.title = (
        "Aplicação de algoritmos de Inteligência Artificial e Visão Computacional na "
        "Identificação Automatizada de Estruturas Vasculares em Tecidos Tumorais"
    )
    core_properties.subject = "Texto-base de Trabalho de Conclusão de Curso"
    core_properties.author = "Autor a preencher"

    add_centered(document, "[NOME DA INSTITUIÇÃO]", bold=True, before=6)
    add_centered(document, "[NOME DO CURSO]", bold=True, after=36)
    add_centered(document, "[NOME DO AUTOR]", bold=True, after=72)
    add_centered(
        document,
        "APLICAÇÃO DE ALGORITMOS DE INTELIGÊNCIA ARTIFICIAL E VISÃO COMPUTACIONAL NA "
        "IDENTIFICAÇÃO AUTOMATIZADA DE ESTRUTURAS VASCULARES EM TECIDOS TUMORAIS",
        size=14,
        bold=True,
        after=84,
    )
    add_centered(document, "[CIDADE]", after=0)
    add_centered(document, "[ANO]", after=0)
    document.add_page_break()

    add_centered(document, "[NOME DO AUTOR]", bold=True, after=54)
    add_centered(
        document,
        "APLICAÇÃO DE ALGORITMOS DE INTELIGÊNCIA ARTIFICIAL E VISÃO COMPUTACIONAL NA "
        "IDENTIFICAÇÃO AUTOMATIZADA DE ESTRUTURAS VASCULARES EM TECIDOS TUMORAIS",
        size=14,
        bold=True,
        after=54,
    )
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.left_indent = Cm(8)
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.paragraph_format.line_spacing = 1.0
    paragraph.paragraph_format.space_after = Pt(18)
    run = paragraph.add_run(
        "Trabalho de Conclusão de Curso apresentado ao [NOME DO CURSO] da [NOME DA "
        "INSTITUIÇÃO] como requisito parcial para obtenção do título de [TÍTULO]."
    )
    set_run_font(run, size=10)
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.left_indent = Cm(8)
    paragraph.paragraph_format.first_line_indent = Cm(0)
    run = paragraph.add_run("Orientador(a): [NOME DO ORIENTADOR OU ORIENTADORA]")
    set_run_font(run, size=10)
    add_centered(document, "[CIDADE]", before=90)
    add_centered(document, "[ANO]")
    document.add_page_break()

    add_heading(document, "RESUMO", 1)
    add_body(
        document,
        "A análise de alterações vasculares em imagens histopatológicas pode contribuir para a "
        "quantificação de fenômenos associados ao microambiente tumoral e aos linfonodos drenantes "
        "de tumores. Este trabalho apresenta o desenvolvimento de um protótipo computacional para "
        "segmentação automatizada de estruturas vasculares em imagens de microscopia por meio de "
        "técnicas de visão computacional e aprendizado profundo. O material analisado contém "
        "anotações no formato COCO referentes a vênulas de endotélio alto, classificadas originalmente "
        "como não dilatadas, intermediariamente dilatadas e altamente dilatadas, além de regiões "
        "CCL21 positivas. O arquivo completo registra 608 imagens e 16.431 anotações; o subconjunto "
        "disponível localmente contém dez imagens de um único paciente e 239 anotações vasculares. "
        "A solução implementada converte polígonos anotados em máscaras binárias, organiza os dados "
        "para treinamento e validação e utiliza uma arquitetura U-Net para estimar, em nível de pixel, "
        "a presença de estruturas vasculares. O processo registra os arquivos usados em cada divisão, "
        "preserva os parâmetros no checkpoint e calcula os índices Dice e IoU. Foram ainda adotados "
        "controle de versão, testes automatizados, ambiente de dependências reproduzível e verificação "
        "contínua de compatibilidade com versões do Python. A auditoria revelou que as dez imagens "
        "locais contêm contornos de anotação incorporados aos pixels, o que constitui vazamento de "
        "rótulo e impede a interpretação de métricas de treinamento como evidência científica. Assim, "
        "o resultado atual deve ser compreendido como validação da infraestrutura de software, e não "
        "como validação clínica ou demonstração de generalização. A continuidade do estudo requer "
        "imagens brutas, divisão independente por paciente e avaliação em conjunto de teste externo."
    )
    add_no_indent(
        document,
        "Palavras-chave: inteligência artificial; visão computacional; segmentação de imagens; "
        "vênulas de endotélio alto; câncer de mama.",
    )

    document.add_page_break()
    add_heading(document, "ABSTRACT", 1)
    add_body(
        document,
        "The analysis of vascular changes in histopathological images may support the quantification "
        "of phenomena associated with the tumor microenvironment and tumor-draining lymph nodes. "
        "This work presents a computational prototype for automated segmentation of vascular "
        "structures in microscopy images using computer vision and deep learning. The analyzed "
        "material contains COCO-formatted annotations of high endothelial venules originally "
        "classified as non-dilated, intermediately dilated, and highly dilated, as well as CCL21-positive "
        "regions. The complete annotation file records 608 images and 16,431 annotations, whereas the "
        "locally available subset contains ten images from a single patient and 239 vascular "
        "annotations. The implemented solution converts annotated polygons into binary masks, "
        "organizes data for training and validation, and uses a U-Net architecture to estimate vascular "
        "structures at pixel level. The workflow records the files assigned to each split, stores "
        "parameters in the checkpoint, and computes Dice and IoU. Version control, automated testing, "
        "reproducible dependency management, and continuous Python compatibility checks were also "
        "implemented. The audit showed that the ten local images contain annotation contours embedded "
        "in their pixels, which causes label leakage and prevents training metrics from being interpreted "
        "as scientific evidence. Therefore, the current outcome represents software infrastructure "
        "validation rather than clinical validation or demonstrated generalization. Further work "
        "requires raw images, patient-independent splitting, and evaluation on an external test set."
    )
    add_no_indent(
        document,
        "Keywords: artificial intelligence; computer vision; image segmentation; high endothelial "
        "venules; breast cancer.",
    )
    document.add_page_break()
    add_toc(document)
    document.add_page_break()

    add_heading(document, "1 INTRODUÇÃO", 1)
    add_body(
        document,
        "A análise de imagens biomédicas ocupa posição relevante na investigação de alterações "
        "morfológicas associadas a doenças. Em histopatologia, a observação de tecidos permite "
        "identificar padrões celulares e estruturais, mas a avaliação manual de grandes quantidades de "
        "imagens pode ser demorada, dependente da experiência do observador e sujeita a variações de "
        "interpretação. Técnicas de visão computacional e inteligência artificial oferecem instrumentos "
        "para converter imagens em medidas quantitativas, desde que os dados, as anotações e o protocolo "
        "de validação sejam adequadamente controlados."
    )
    add_body(
        document,
        "No contexto específico deste projeto, as estruturas de interesse são vênulas de endotélio alto, "
        "conhecidas pela sigla HEV, do inglês high endothelial venules. Essas vênulas especializadas "
        "participam do recrutamento de linfócitos para os linfonodos. Estudos em câncer de mama "
        "demonstraram que linfonodos drenantes de tumor podem apresentar remodelamento dessas estruturas, "
        "incluindo dilatação, afinamento do endotélio e alterações de marcadores vasculares. Bekkhus et al. "
        "(2021) relacionaram a remodelação de HEVs à invasividade tumoral, inclusive em condições nas "
        "quais a alteração antecede a metástase nodal detectável."
    )
    add_body(
        document,
        "A quantificação manual da morfologia vascular limita análises em larga escala. Em resposta a "
        "esse problema, Bekkhus et al. (2022) desenvolveram o HEV-finder, ferramenta de aprendizado "
        "profundo destinada à detecção e classificação automatizadas da dilatação de HEVs em linfonodos "
        "drenantes de tumores. O trabalho utilizou 12.524 HEVs classificadas manualmente e estruturou um "
        "fluxo que identifica regiões relevantes, detecta vasos e os classifica como não dilatados, "
        "intermediariamente dilatados ou altamente dilatados. O conjunto de imagens associado ao artigo "
        "foi disponibilizado no BioStudies sob o acesso S-BIAD463, enquanto o código original emprega "
        "Mask R-CNN."
    )
    add_body(
        document,
        "O presente TCC parte de um subconjunto desse domínio para construir uma implementação própria, "
        "mais simples e voltada inicialmente à segmentação binária. Em vez de reproduzir integralmente o "
        "HEV-finder ou sua classificação por grau de dilatação, o protótipo atual reúne as três categorias "
        "vasculares em uma única classe e procura distinguir pixels pertencentes a vasos dos pixels de "
        "fundo. A arquitetura escolhida é uma U-Net implementada em PyTorch. Essa delimitação deve ser "
        "mantida ao interpretar o alcance do projeto: trata-se de um estudo computacional exploratório "
        "sobre segmentação, e não de um sistema clínico nem de uma reprodução do método publicado."
    )
    add_body(
        document,
        "A pergunta de pesquisa que orienta o desenvolvimento é: como estruturar um fluxo reprodutível de "
        "visão computacional capaz de preparar anotações, treinar um modelo de segmentação e avaliar a "
        "identificação automatizada de estruturas vasculares em imagens de linfonodos associados ao câncer "
        "de mama, sem ocultar as limitações do conjunto disponível? A resposta proposta envolve tanto o "
        "algoritmo quanto práticas de engenharia de software, pois resultados científicos dependem da "
        "rastreabilidade dos dados, das versões de dependências, dos parâmetros e das divisões de treino e "
        "avaliação."
    )

    add_heading(document, "1.1 Delimitação terminológica e científica", 2)
    add_body(
        document,
        "Embora o título do trabalho utilize a expressão ampla ‘estruturas vasculares em tecidos "
        "tumorais’, o material efetivamente analisado corresponde a imagens de linfonodos drenantes de "
        "tumores de mama e a anotações de HEVs. Essa distinção é necessária porque linfonodo drenante, "
        "tumor primário e tecido metastático são contextos biológicos diferentes. O texto, portanto, usa "
        "a formulação geral do título, mas descreve o objeto empírico com a precisão permitida pelos "
        "arquivos e pelas fontes localizadas."
    )

    add_heading(document, "1.2 Justificativa", 2)
    add_body(
        document,
        "A justificativa científica decorre da relevância do remodelamento vascular na relação entre "
        "tumor, imunidade e linfonodos. A justificativa computacional está na necessidade de reduzir o "
        "trabalho manual e produzir medidas repetíveis. Entretanto, automatização não elimina a necessidade "
        "de supervisão especializada. Um modelo pode aprender marcas espúrias, diferenças de aquisição ou "
        "os próprios contornos usados como rótulos. Por isso, a utilidade de uma solução depende de desenho "
        "experimental, qualidade dos dados, validação independente e documentação suficiente para que "
        "outras pessoas reproduzam o processo."
    )

    add_heading(document, "2 OBJETIVOS", 1)
    add_heading(document, "2.1 Objetivo geral", 2)
    add_body(
        document,
        "Desenvolver e documentar um protótipo reprodutível de inteligência artificial e visão "
        "computacional para segmentação automatizada de estruturas vasculares em imagens de linfonodos "
        "drenantes de tumores, utilizando anotações vasculares fornecidas em formato COCO."
    )
    add_heading(document, "2.2 Objetivos específicos", 2)
    objectives = [
        "Examinar a estrutura dos arquivos de imagem, do manifesto e das anotações, registrando suas categorias, dimensões e correspondências.",
        "Converter anotações poligonais das três categorias vasculares em máscaras binárias, excluindo semanticamente regiões CCL21 positivas.",
        "Implementar uma U-Net para segmentação binária de vasos e organizar rotinas de treino, avaliação e predição.",
        "Calcular Dice e IoU a partir das predições binarizadas e manter no checkpoint os parâmetros necessários à reprodução da avaliação.",
        "Estabelecer controle de versão, testes automatizados, isolamento de dependências e verificação contínua de compatibilidade com Python.",
        "Identificar limitações metodológicas do material disponível e definir requisitos para uma etapa experimental cientificamente válida.",
    ]
    add_numbered_list(document, objectives)

    add_heading(document, "3 FUNDAMENTAÇÃO TEÓRICA", 1)
    add_heading(document, "3.1 Vênulas de endotélio alto e remodelamento vascular", 2)
    add_body(
        document,
        "As HEVs são vasos pós-capilares especializados encontrados em órgãos linfoides secundários e "
        "associados à entrada de linfócitos circulantes nos linfonodos. Sua morfologia e seus sinais "
        "moleculares integram a organização funcional do tecido linfoide. No cenário tumoral, o linfonodo "
        "drenante recebe sinais e células provenientes da região do tumor e pode sofrer alterações antes "
        "mesmo da detecção de metástase. O estudo de Bekkhus et al. (2021) mostrou remodelamento estrutural "
        "e molecular de HEVs em pacientes com câncer de mama invasivo, associado à desregulação de células "
        "estromais perivasculares e de CCL21."
    )
    add_body(
        document,
        "CCL21 é uma quimiocina envolvida em mecanismos de tráfego celular no sistema linfático. No "
        "conjunto tratado neste projeto, regiões CCL21 positivas aparecem como uma categoria separada das "
        "categorias de vasos. Essa separação orienta o pré-processamento: a classe CCL21+ não deve ser "
        "inferida como vaso com base apenas em área ou aparência. O uso dos identificadores semânticos do "
        "COCO permite excluir essas regiões de maneira explícita e auditável."
    )

    add_heading(document, "3.2 Visão computacional e segmentação de imagens", 2)
    add_body(
        document,
        "Visão computacional reúne métodos destinados a extrair informação de imagens. Entre suas tarefas "
        "estão classificação, detecção de objetos, segmentação semântica e segmentação de instâncias. Na "
        "classificação, atribui-se um rótulo a uma imagem ou região; na detecção, localizam-se objetos; na "
        "segmentação semântica, cada pixel recebe uma classe; e na segmentação de instâncias, objetos "
        "individuais da mesma classe permanecem separados. O protótipo deste TCC executa segmentação "
        "semântica binária. Assim, vasos eventualmente sobrepostos na máscara formam uma única região, e "
        "o grau de dilatação não é previsto."
    )
    add_body(
        document,
        "As anotações estão organizadas segundo uma estrutura compatível com COCO, formato amplamente "
        "utilizado para representar imagens, categorias e segmentações por polígonos. O trabalho de Lin et "
        "al. (2014) consolidou o uso de segmentações por instância no conjunto MS COCO. Neste projeto, o "
        "formato é empregado como organização das anotações biomédicas, sem implicar que as imagens "
        "pertençam ao conjunto de fotografias naturais MS COCO."
    )

    add_heading(document, "3.3 Aprendizado profundo e arquitetura U-Net", 2)
    add_body(
        document,
        "Aprendizado profundo utiliza redes neurais com múltiplas camadas para aprender representações a "
        "partir dos dados. Em imagens, redes convolucionais exploram relações espaciais locais e constroem "
        "representações progressivamente mais abstratas. A U-Net foi proposta por Ronneberger, Fischer e "
        "Brox (2015) para segmentação de imagens biomédicas. Sua estrutura combina um caminho contrativo, "
        "que agrega contexto, com um caminho expansivo, que recupera resolução espacial. Conexões entre "
        "níveis correspondentes transportam detalhes do codificador para o decodificador."
    )
    add_body(
        document,
        "A implementação desenvolvida contém blocos de duas convoluções, normalização em lote e função "
        "ReLU. Operações de max pooling reduzem a resolução no codificador, enquanto convoluções "
        "transpostas ampliam os mapas no decodificador. A última camada produz um logit por pixel. A "
        "probabilidade é obtida pela função sigmoide, e um limiar converte a saída em máscara binária. O "
        "treinamento usa PyTorch, biblioteca descrita por Paszke et al. (2019), e combina entropia cruzada "
        "binária com logits e uma versão diferenciável da perda Dice."
    )

    add_heading(document, "3.4 Avaliação de segmentações", 2)
    add_body(
        document,
        "A avaliação de segmentações compara uma saída estimada com uma referência. Taha e Hanbury (2015) "
        "demonstram que métricas possuem propriedades e sensibilidades distintas, razão pela qual sua "
        "seleção deve considerar a tarefa. Neste projeto, Dice e IoU medem sobreposição. Se TP representa "
        "pixels vasculares corretamente previstos, FP pixels previstos indevidamente e FN pixels vasculares "
        "não detectados, Dice é calculado por 2TP/(2TP+FP+FN), enquanto IoU é TP/(TP+FP+FN)."
    )
    add_body(
        document,
        "Essas métricas não medem todos os aspectos relevantes. Elas não informam diretamente a precisão "
        "do contorno, a distância entre bordas, a contagem correta de vasos nem a classificação por "
        "dilatação. Também podem ser afetadas pelo desbalanceamento entre fundo e estrutura vascular. Em "
        "uma continuação do estudo, recomenda-se associar métricas de sobreposição a sensibilidade, valor "
        "preditivo positivo, medidas de distância de borda e avaliação por instância."
    )

    add_heading(document, "3.5 Trabalho relacionado: HEV-finder", 2)
    add_body(
        document,
        "O HEV-finder constitui a referência mais diretamente relacionada ao problema. Segundo Bekkhus et "
        "al. (2022), a ferramenta analisa regiões da paracorteza definidas pelo marcador CCL21, detecta "
        "HEVs e classifica seu estado de dilatação. O código público informa uso de Mask R-CNN, arquitetura "
        "capaz de detectar e segmentar instâncias. A solução deste TCC não substitui esse sistema e não "
        "reproduz os resultados publicados. Ela utiliza U-Net e máscara binária como base didática e "
        "experimental para consolidar preparação de dados, treinamento e avaliação reprodutíveis."
    )

    add_heading(document, "4 MATERIAIS E MÉTODOS", 1)
    add_heading(document, "4.1 Caracterização do estudo", 2)
    add_body(
        document,
        "O trabalho é de natureza aplicada e desenvolvimento tecnológico, com abordagem quantitativa e "
        "caráter exploratório. A unidade computacional de análise é uma imagem bidimensional acompanhada "
        "de sua máscara de referência. A etapa atual avalia a consistência do fluxo de software e dos "
        "dados locais. Como não há conjunto independente de pacientes disponível na pasta do projeto, não "
        "é possível conduzir, nesta etapa, inferência sobre desempenho populacional ou utilidade clínica."
    )

    add_heading(document, "4.2 Origem e composição dos dados", 2)
    add_body(
        document,
        "O diretório recebido contém um arquivo mestre COCO, um manifesto específico e dez imagens. Os "
        "metadados do COCO declaram ano 2020 e contribuição da SciLifeLab BioImage Informatics. A "
        "nomenclatura das categorias, a organização por grupos DCIS e IDC e a afiliação informada são "
        "compatíveis com o material do HEV-finder. A publicação de Bekkhus et al. (2022) identifica o "
        "repositório BioStudies S-BIAD463 como fonte das imagens brutas. Ainda assim, o arquivo COCO local "
        "não contém uma licença no campo correspondente; por esse motivo, os dados foram mantidos fora do "
        "controle de versão até que as condições de redistribuição sejam verificadas."
    )
    add_data_table(document)
    add_body(
        document,
        "As dez imagens locais pertencem ao Patient_001 e apresentam largura nominal de 1.934 pixels e "
        "altura entre 912 e 921 pixels. O manifesto registra escala de 0,5 mpp, sem explicitar no próprio "
        "arquivo a unidade por extenso. Não se converteu essa medida para micrômetros por pixel no cálculo "
        "das máscaras, evitando acrescentar interpretação não documentada pelo arquivo."
    )
    add_figure(document)
    add_body(
        document,
        "A Figura 1 evidencia a principal restrição encontrada: os arquivos disponíveis localmente já "
        "possuem contornos coloridos de anotação. Se forem usados como entrada, a rede pode aprender a "
        "reconhecer os contornos em vez da morfologia vascular. Esse vazamento de rótulo invalida uma "
        "avaliação de generalização. O software interrompe o treino por padrão quando identifica nomes "
        "terminados em _labels; uma opção explícita permite apenas testes de funcionamento, sem conferir "
        "validade científica aos resultados."
    )

    add_heading(document, "4.3 Geração das máscaras", 2)
    add_body(
        document,
        "A correspondência entre cada imagem local e o COCO é estabelecida pelo manifesto "
        "DCIS.Patient_001.2.json. Essa estratégia evita associar uma imagem a outro paciente que possua o "
        "mesmo número de arquivo. O programa valida largura e altura antes de criar uma imagem binária "
        "vazia. Em seguida, seleciona anotações cujos nomes de categoria são not dilated vessel, "
        "Intermediately dilated vessel e highly dilated vessel e rasteriza seus polígonos com valor 255. "
        "As regiões CCL21+ não são incluídas."
    )
    add_body(
        document,
        "Essa seleção substitui o procedimento anterior, que descartava anotações com base em um limiar "
        "de área superior a 200.000 pixels. O limiar não estava fundamentado nos metadados e poderia "
        "eliminar estruturas de interesse ou incluir regiões de tecido. A nova regra é semântica: depende "
        "da categoria fornecida pelo conjunto, e não de uma suposição geométrica. Ao final, o processo gera "
        "dez máscaras e contabiliza 239 anotações vasculares."
    )

    add_heading(document, "4.4 Preparação das entradas", 2)
    add_body(
        document,
        "As imagens são convertidas para RGB, normalizadas para o intervalo de zero a um e redimensionadas "
        "por interpolação bilinear. As máscaras são convertidas para um canal, binarizadas e "
        "redimensionadas por vizinho mais próximo, evitando a introdução de níveis intermediários nas "
        "classes. O tamanho padrão é 256 por 256 pixels e pode ser alterado, desde que seja múltiplo de 16. "
        "Esse redimensionamento quadrado deforma a proporção original e deve ser tratado como configuração "
        "computacional preliminar, não como decisão metodológica validada."
    )
    add_body(
        document,
        "O conjunto é embaralhado por uma semente fixa e dividido, por padrão, em 80% para treino e 20% "
        "para validação. Transformações aleatórias de reflexão horizontal e vertical são aplicadas somente "
        "no treino. Como todas as imagens locais são do mesmo paciente, a divisão reduz a reutilização da "
        "mesma imagem, mas não produz independência entre pacientes. Em uma avaliação definitiva, todas as "
        "imagens de um paciente devem permanecer na mesma partição."
    )

    add_heading(document, "4.5 Treinamento", 2)
    add_body(
        document,
        "A U-Net recebe três canais e devolve um mapa de logits com um canal. O número inicial de canais é "
        "32, o lote padrão contém duas imagens, a taxa de aprendizagem é 0,001 e o otimizador é Adam. O "
        "número padrão de épocas é 50. A função objetivo soma BCEWithLogitsLoss e perda Dice. A primeira "
        "componente combina a função sigmoide e a entropia cruzada binária de forma numericamente estável; "
        "a segunda privilegia a sobreposição da região vascular."
    )
    add_body(
        document,
        "Ao fim de cada época, o modelo é avaliado na validação. O checkpoint com maior Dice é salvo com "
        "pesos, número de canais, resolução de entrada, limiar, semente, nomes dos arquivos de treino e "
        "validação e métricas observadas. Na inferência, esses metadados reconstituem a arquitetura e o "
        "pré-processamento. A máscara prevista é retornada à resolução da imagem original por vizinho mais "
        "próximo."
    )

    add_heading(document, "4.6 Reprodutibilidade e controle de versões", 2)
    add_body(
        document,
        "O código foi organizado como pacote Python com declaração de dependências em pyproject.toml e "
        "resolução exata em uv.lock. A versão de desenvolvimento é indicada em .python-version. O Git "
        "registra código, testes e documentação, enquanto dados, ambientes, artefatos e pesos são ignorados "
        "por padrão. Essa separação reduz arquivos binários no histórico e evita redistribuição automática "
        "de dados cuja licença ainda precisa ser confirmada."
    )
    add_body(
        document,
        "Um fluxo de integração contínua executa análise estática e testes nas versões 3.11, 3.12, 3.13 e "
        "3.14 do Python. Outro job consulta semanalmente a versão estável mais recente, com falha tratada "
        "como informativa até que as bibliotecas publiquem distribuições compatíveis. O Dependabot foi "
        "configurado para propor atualizações do lockfile e das ações do GitHub. Atualizações de versão "
        "menor do interpretador não são incorporadas diretamente ao experimento: primeiro devem passar "
        "pelos testes e ser registradas em uma alteração revisável."
    )

    add_heading(document, "4.7 Aspectos éticos e de uso", 2)
    add_body(
        document,
        "O projeto manipula imagens provenientes de pesquisa biomédica. A publicação original informa uso "
        "de amostras de biobanco e aprovação ética no contexto do estudo de origem; contudo, este TCC deve "
        "registrar a autorização aplicável à cópia específica dos dados utilizada localmente. Também é "
        "necessário verificar os termos do BioStudies e da publicação antes de redistribuir arquivos. O "
        "protótipo não foi validado como dispositivo médico e não deve apoiar diagnóstico, prognóstico ou "
        "conduta clínica."
    )

    add_heading(document, "5 RESULTADOS DO DESENVOLVIMENTO", 1)
    add_heading(document, "5.1 Auditoria e saneamento dos dados", 2)
    add_body(
        document,
        "A auditoria identificou 608 imagens, 16.431 anotações e quatro categorias no COCO. A seleção pelo "
        "manifesto local recuperou dez imagens do Patient_001. Nessas imagens foram encontrados 155 vasos "
        "não dilatados, 70 com dilatação intermediária e 14 altamente dilatados, totalizando 239 anotações "
        "vasculares. Doze regiões CCL21+ foram excluídas. A execução reproduz essas contagens e imprime o "
        "total por imagem, criando um ponto de controle para detectar alterações futuras nos dados."
    )
    add_body(
        document,
        "Também foram corrigidos caminhos absolutos, problemas de codificação textual, duplicação de "
        "scripts e inconsistência entre a resolução usada no treino e aquela usada na inferência. O fluxo "
        "anterior testava o modelo em uma dimensão diferente daquela empregada no treinamento e não "
        "mantinha uma divisão explícita de validação. No novo fluxo, parâmetros críticos são definidos uma "
        "vez, registrados e reutilizados."
    )

    add_heading(document, "5.2 Validação do software", 2)
    add_body(
        document,
        "Foram implementados testes para a associação dos nomes de arquivos ao manifesto, a "
        "reprodutibilidade e separação da divisão treino–validação, a exigência de no mínimo duas imagens, "
        "a detecção de nomes indicativos de rótulos incorporados, a preservação das dimensões espaciais pela "
        "U-Net e o cálculo de Dice e IoU em correspondência perfeita. Os seis testes foram executados com "
        "sucesso. A análise estática do código também foi concluída sem erros."
    )
    add_body(
        document,
        "Um ensaio técnico de uma época, em baixa resolução e com autorização explícita para usar as imagens "
        "anotadas, confirmou que as etapas de treino, salvamento, recarregamento, avaliação e predição "
        "funcionam de ponta a ponta. Os valores numéricos desse ensaio não são apresentados como resultado "
        "experimental, pois o uso de contornos incorporados e a resolução reduzida tornam qualquer "
        "interpretação de desempenho inadequada."
    )

    add_heading(document, "5.3 Ausência de resultado experimental válido", 2)
    add_body(
        document,
        "O resultado cientificamente mais importante da etapa atual é reconhecer que ainda não há base "
        "para declarar acurácia, capacidade de generalização ou desempenho clínico. As imagens de entrada "
        "expõem os rótulos por contornos coloridos; a amostra local representa apenas um paciente; e não há "
        "conjunto externo reservado. Relatar uma métrica de validação nessas condições criaria uma falsa "
        "impressão de eficácia. A redação separa, portanto, resultados de engenharia de software de "
        "resultados experimentais em visão computacional."
    )

    add_heading(document, "6 DISCUSSÃO", 1)
    add_body(
        document,
        "A implementação mostra que o material anotado pode ser transformado em um fluxo automatizado de "
        "segmentação. O uso das categorias do COCO melhora a rastreabilidade em relação a heurísticas por "
        "área, e o manifesto impede correspondências ambíguas entre pacientes. A U-Net oferece uma base "
        "coerente para segmentação semântica biomédica e permite estudar a identificação da região vascular "
        "como etapa inicial."
    )
    add_body(
        document,
        "Por outro lado, a simplificação para uma classe remove informação relevante. O problema descrito "
        "por Bekkhus et al. (2022) envolve não apenas localizar vasos, mas separar instâncias e classificar "
        "dilatação. Uma máscara binária não distingue vasos adjacentes nem responde se a estrutura é não "
        "dilatada, intermediária ou altamente dilatada. Para aproximar o protótipo da tarefa de referência, "
        "será necessário implementar segmentação de instâncias ou um segundo estágio de classificação, "
        "além de definir critérios morfológicos e clínicos com supervisão especializada."
    )
    add_body(
        document,
        "O tamanho do conjunto é outro fator decisivo. Embora a U-Net tenha sido concebida com estratégias "
        "para aproveitar dados biomédicos anotados, dez imagens de um paciente não sustentam conclusão sobre "
        "outros pacientes. Fragmentar imagens em recortes pode aumentar o número de amostras computacionais, "
        "mas não cria novos indivíduos independentes. Se recortes do mesmo paciente aparecerem em treino e "
        "teste, a estimativa de desempenho tende a refletir semelhanças internas do paciente e do processo de "
        "aquisição."
    )
    add_body(
        document,
        "A obtenção das imagens brutas do acesso S-BIAD463 é o próximo passo prioritário. Depois disso, a "
        "coorte deve ser dividida por paciente e, quando possível, estratificada pelos grupos clínicos "
        "registrados no estudo de origem. A seleção final de treino, validação e teste deve ser definida "
        "antes do ajuste dos hiperparâmetros. O conjunto de teste precisa permanecer inacessível às decisões "
        "de modelagem até a avaliação final."
    )
    add_body(
        document,
        "Também se recomenda preservar a proporção das imagens ou utilizar recortes com sobreposição, em "
        "vez de deformar toda a imagem para um quadrado. A escala das HEVs deve orientar a resolução dos "
        "recortes. A comparação metodológica pode incluir U-Net, modelos autoconfiguráveis como nnU-Net e a "
        "abordagem Mask R-CNN do HEV-finder, sempre usando as mesmas partições e critérios de avaliação. "
        "Experimentos devem registrar intervalo de confiança ou variação entre repetições, não apenas uma "
        "pontuação isolada."
    )
    add_body(
        document,
        "Finalmente, reprodutibilidade de software não equivale, por si só, a validade científica. O "
        "lockfile e os testes permitem reconstruir o ambiente, mas não corrigem vieses de seleção, erros de "
        "anotação ou inadequação da métrica. Esses dois níveis são complementares: engenharia consistente "
        "reduz erros acidentais, enquanto desenho experimental e revisão por especialistas sustentam a "
        "interpretação biológica."
    )

    add_heading(document, "7 TRABALHOS FUTUROS", 1)
    future = [
        "Obter as imagens brutas do conjunto S-BIAD463 e confirmar formalmente licença, citação e autorização de uso no TCC.",
        "Importar uma quantidade maior de pacientes e documentar grupos clínicos sem expor identificadores pessoais.",
        "Definir partições por paciente, reservando um teste independente antes do ajuste do modelo.",
        "Substituir o redimensionamento deformante por recortes ou preenchimento que preservem a proporção e a escala das estruturas.",
        "Comparar segmentação semântica e de instâncias, incluindo a classificação das três categorias de dilatação.",
        "Avaliar Dice, IoU, sensibilidade, precisão, medidas de borda e desempenho por vaso, com análise de incerteza.",
        "Submeter máscaras e previsões a revisão de especialista e registrar desacordos de anotação.",
        "Manter checkpoints vinculados ao commit do código, à versão dos dados e à configuração integral do experimento.",
    ]
    add_numbered_list(document, future, restart=True)

    add_heading(document, "8 CONCLUSÃO", 1)
    add_body(
        document,
        "Este trabalho estruturou um protótipo de segmentação automatizada de estruturas vasculares em "
        "imagens associadas a linfonodos drenantes de tumores de mama. O desenvolvimento abrangeu auditoria "
        "dos dados, geração de máscaras pelas categorias do COCO, implementação de U-Net, métricas de "
        "sobreposição, checkpoints com metadados, testes, controle de versões e gerenciamento reprodutível "
        "do ambiente Python. A preparação recuperou 239 anotações vasculares nas dez imagens locais e "
        "excluiu corretamente 12 regiões CCL21 positivas."
    )
    add_body(
        document,
        "A análise também demonstrou que a etapa experimental não pode ser concluída com validade usando "
        "apenas os arquivos atualmente disponíveis. Os contornos de anotação estão incorporados às imagens "
        "e todas as amostras locais pertencem ao mesmo paciente. Nessas condições, métricas de validação não "
        "representariam capacidade de identificação em imagens brutas nem generalização entre pacientes."
    )
    add_body(
        document,
        "Conclui-se que o objetivo de construir uma base computacional limpa, rastreável e testável foi "
        "atingido, enquanto a validação científica permanece condicionada à obtenção de imagens brutas e de "
        "uma coorte adequada. Essa conclusão negativa quanto às métricas atuais não reduz o valor do "
        "trabalho; ao contrário, impede uma afirmação sem suporte e define com precisão as condições "
        "necessárias para que a pesquisa prossiga de modo metodologicamente responsável."
    )

    add_heading(document, "REFERÊNCIAS", 1)
    references = [
        "BEKKHUS, T. et al. Remodeling of the lymph node high endothelial venules reflects tumor invasiveness in breast cancer and is associated with dysregulation of perivascular stromal cells. Cancers, v. 13, n. 2, art. 211, 2021. DOI: 10.3390/cancers13020211.",
        "BEKKHUS, T. et al. Automated detection of vascular remodeling in tumor-draining lymph nodes by the deep-learning tool HEV-finder. The Journal of Pathology, v. 258, n. 1, p. 4–11, 2022. DOI: 10.1002/path.5981.",
        "BIOSTUDIES. Supporting data for Automated detection of vascular remodeling in tumor-draining lymph nodes by the deep-learning tool HEV-finder. Acesso S-BIAD463. Disponível em: https://www.ebi.ac.uk/biostudies/studies/S-BIAD463. Acesso em: 20 jul. 2026.",
        "ISENSEE, F. et al. nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation. Nature Methods, v. 18, p. 203–211, 2021. DOI: 10.1038/s41592-020-01008-z.",
        "LIN, T.-Y. et al. Microsoft COCO: Common Objects in Context. In: EUROPEAN CONFERENCE ON COMPUTER VISION, 2014. Proceedings [...]. Cham: Springer, 2014. p. 740–755. DOI: 10.1007/978-3-319-10602-1_48.",
        "PASZKE, A. et al. PyTorch: an imperative style, high-performance deep learning library. In: ADVANCES IN NEURAL INFORMATION PROCESSING SYSTEMS 32, 2019. Proceedings [...]. Vancouver: NeurIPS, 2019.",
        "RONNEBERGER, O.; FISCHER, P.; BROX, T. U-Net: convolutional networks for biomedical image segmentation. In: MEDICAL IMAGE COMPUTING AND COMPUTER-ASSISTED INTERVENTION, 2015. Proceedings [...]. Cham: Springer, 2015. p. 234–241. DOI: 10.1007/978-3-319-24574-4_28.",
        "TAHA, A. A.; HANBURY, A. Metrics for evaluating 3D medical image segmentation: analysis, selection, and tool. BMC Medical Imaging, v. 15, art. 29, 2015. DOI: 10.1186/s12880-015-0068-x.",
    ]
    for reference in references:
        add_reference(document, reference)

    add_heading(document, "APÊNDICE A – ORIENTAÇÕES PARA FINALIZAÇÃO", 1)
    add_body(
        document,
        "Antes da entrega institucional, devem ser preenchidos os campos de autoria, curso, instituição, "
        "orientação, cidade e ano. O manual de normalização da instituição deve ser consultado para capa, "
        "folha de rosto, paginação, sumário, citações e referências. O sumário do documento é um campo "
        "automático e deve ser atualizado no editor de texto depois das revisões finais."
    )
    add_body(
        document,
        "A seção de resultados deverá ser ampliada somente após a obtenção das imagens brutas, o "
        "congelamento das partições por paciente e a execução dos experimentos definitivos. Tabelas de "
        "métricas, curvas de treinamento e exemplos de predição não devem reutilizar o ensaio técnico feito "
        "com imagens contendo rótulos. Qualquer novo resultado deve informar versão dos dados, commit do "
        "código, ambiente, semente, hiperparâmetros e critérios de seleção do checkpoint."
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build_document()
