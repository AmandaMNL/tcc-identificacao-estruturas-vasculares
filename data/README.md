# Origem e licença dos dados

Os arquivos de imagem e anotação desta pasta correspondem a um subconjunto do estudo:

> Bekkhus, T. et al. Automated detection of vascular remodeling in tumor-draining lymph nodes by the deep-learning tool HEV-finder. *The Journal of Pathology*, v. 258, n. 1, p. 4–11, 2022. DOI: [10.1002/path.5981](https://doi.org/10.1002/path.5981).

Os dados de origem estão disponíveis no EMBL-EBI:

- BioStudies/BioImage Archive: [S-BIAD463](https://www.ebi.ac.uk/biostudies/studies/S-BIAD463)
- Licença declarada no registro: [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

Organização local:

- `annotations/COCO_annotations.json`: anotações poligonais no formato COCO.
- `annotations/DCIS.Patient_001.2.json`: manifesto das imagens locais do paciente identificado no conjunto como `Patient_001`.
- `images/`: dez imagens RGB com contornos de anotação incorporados aos pixels.
- `mask/`: máscaras binárias geradas pelo código deste projeto a partir das categorias vasculares do COCO.

Os identificadores usados nesta pasta são os identificadores pseudonimizados já fornecidos pelo conjunto público. A presença de licença aberta não transforma o protótipo em ferramenta clínica e não elimina as limitações metodológicas descritas no README principal.
