# Aplicação de algoritmos de Inteligência Artificial e Visão Computacional na Identificação Automatizada de Estruturas Vasculares em Tecidos Tumorais

## Estado do projeto

Este repositório contém um protótipo acadêmico de segmentação binária de estruturas vasculares em imagens de tecido tumoral. O fluxo converte anotações poligonais no formato COCO em máscaras, treina uma U-Net, registra a divisão dos dados no checkpoint e calcula Dice e IoU no subconjunto de validação.

O material local permite somente um experimento exploratório. As dez imagens disponíveis correspondem ao `Patient_001`; portanto, uma divisão entre essas imagens não mede generalização entre pacientes. Além disso, os arquivos atuais terminam em `_rgb_labels.png` e contêm contornos coloridos visíveis. Esses contornos revelam os rótulos ao modelo e caracterizam vazamento de informação. Por segurança, o comando de treino rejeita esses arquivos por padrão.

Este software não é um dispositivo médico, não foi validado clinicamente e não deve fundamentar diagnóstico ou decisão clínica.

## Evidências presentes no material fornecido

Os números abaixo foram obtidos diretamente dos arquivos incluídos no repositório, sem extrapolação:

| Item | Evidência local |
|---|---:|
| Imagens no COCO | 608 |
| Anotações no COCO | 16.431 |
| Categorias | 4 |
| Imagens locais | 10 |
| Paciente das imagens locais | `Patient_001` |
| Resolução nominal | largura de 1.934 px; altura entre 912 e 921 px |
| Escala declarada no manifesto | 0,5 mpp |
| Vasos não dilatados nas 10 imagens | 155 |
| Vasos com dilatação intermediária nas 10 imagens | 70 |
| Vasos altamente dilatados nas 10 imagens | 14 |
| Regiões `CCL21+` nas 10 imagens | 12 |

O arquivo COCO declara descrição `COCO 2017 Dataset`, versão `1.0`, ano `2020` e contribuinte `SciLifeLab BioImage Informatics`. Embora o campo `licenses` do arquivo local esteja vazio, os arquivos correspondem ao conjunto público [S-BIAD463](https://www.ebi.ac.uk/biostudies/studies/S-BIAD463), disponibilizado pelo BioStudies/BioImage Archive sob licença [CC0](https://creativecommons.org/publicdomain/zero/1.0/). A origem, a licença e a publicação associada são registradas em `data/README.md`.

## Correções em relação ao código anterior

- Caminhos absolutos foram substituídos por caminhos relativos ao projeto.
- A seleção por área maior que 200.000 pixels foi removida. A máscara agora inclui apenas as três categorias vasculares declaradas no COCO e exclui semanticamente `CCL21+`.
- A correspondência entre imagem e anotação usa o manifesto `DCIS.Patient_001.2.json`, evitando colisões com arquivos de mesmo número pertencentes a outros pacientes.
- Imagens usam interpolação bilinear; máscaras usam vizinho mais próximo, preservando classes binárias.
- O modelo produz logits e o treino usa `BCEWithLogitsLoss` combinada com perda Dice.
- A mesma resolução é gravada no checkpoint e reutilizada na avaliação e predição.
- A divisão treino/validação é determinística e os nomes dos arquivos são armazenados no checkpoint.
- Checkpoints, ambientes virtuais e artefatos gerados não entram no Git.
- Textos corrompidos, emojis, duplicações e comentários narrativos foram removidos.

## Estrutura

```text
.
├── .github/
│   ├── dependabot.yml
│   └── workflows/quality.yml
├── data/
│   ├── annotations/
│   │   ├── COCO_annotations.json
│   │   └── DCIS.Patient_001.2.json
│   ├── images/
│   └── mask/
├── src/vascular_segmentation/
│   ├── cli.py
│   ├── data.py
│   ├── model.py
│   └── training.py
├── tests/
├── .python-version
├── pyproject.toml
├── uv.lock
└── README.md
```

O arquivo `ia_venulas_treinada.pth` foi preservado localmente, mas é ignorado pelo Git. Ele pertence ao fluxo anterior e não contém os metadados exigidos pelo novo formato de checkpoint.

## Ambiente Python

O projeto aceita Python 3.11 ou mais recente. A versão local preferida está em `.python-version`; no estado atual ela é 3.14. A validação local usou CPython 3.14.5 para CPU; o lockfile resolveu PyTorch 2.13.0.

O fluxo recomendado usa `uv`, que lê `.python-version`, cria `.venv` e instala as versões exatas registradas em `uv.lock`:

```powershell
py -3.14 -m pip install "uv>=0.11.16,<0.12"
uv sync --locked --extra dev
```

Depois disso, execute os comandos como `uv run vascular-segmentation masks`, `uv run ruff check .` e `uv run pytest`.

Como alternativa, no Windows PowerShell, use `venv` e `pip`:

```powershell
py -3.14 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Em Linux ou macOS, a alternativa equivalente é:

```bash
python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
```

Ambientes virtuais isolam as dependências do projeto. No Windows, a documentação oficial recomenda chamar `pip` pelo interpretador selecionado, como `py -3.14 -m pip`.

Se for necessária uma instalação de PyTorch com CUDA, use o seletor oficial do PyTorch para obter o comando adequado ao sistema operacional e à versão de CUDA. Não foi fixada uma variante CUDA no projeto porque o material fornecido não informa GPU nem ambiente de execução.

## Preparação dos dados

### 1. Usar imagens sem contornos

Para um experimento válido, substitua os arquivos em `data/images` pelas imagens brutas correspondentes às mesmas dez entradas do manifesto. O identificador numérico deve ser preservado; por exemplo, `2.png` corresponde a `2.png` no manifesto. Não há método confiável implementado para remover os contornos já incorporados aos pixels.

### 2. Gerar máscaras

```powershell
uv run vascular-segmentation masks
```

O comando:

1. lê o COCO e o manifesto do paciente;
2. valida a correspondência e as dimensões de cada imagem;
3. seleciona somente `not dilated vessel`, `Intermediately dilated vessel` e `highly dilated vessel`;
4. rasteriza todos os polígonos dessas categorias em máscara binária;
5. grava uma máscara com o mesmo nome de cada imagem em `data/mask`.

No material atual, o resultado esperado é 10 máscaras e 239 anotações vasculares. O comando imprime a contagem total e a contagem por imagem para auditoria.

## Treino

Após fornecer imagens brutas e regenerar as máscaras:

```powershell
uv run vascular-segmentation train
```

Parâmetros disponíveis:

| Parâmetro | Padrão | Finalidade |
|---|---:|---|
| `--epochs` | 50 | Número de épocas |
| `--batch-size` | 2 | Amostras por atualização |
| `--image-size` | 256 | Lado da entrada quadrada; deve ser múltiplo de 16 |
| `--base-channels` | 32 | Largura inicial da U-Net |
| `--learning-rate` | 0,001 | Taxa do Adam |
| `--validation-fraction` | 0,2 | Fração reservada para validação |
| `--threshold` | 0,5 | Limiar da máscara prevista |
| `--seed` | 42 | Semente da divisão e inicialização |
| `--device` | `auto` | Seleciona `cuda` quando disponível, senão `cpu` |
| `--checkpoint` | `checkpoints/best.pt` | Destino do melhor checkpoint por Dice |

O parâmetro `--allow-annotated-inputs` existe somente para reproduzir uma execução exploratória com os arquivos atuais. Seu uso não corrige o vazamento de rótulo e os resultados não devem ser apresentados como desempenho de generalização.

## Avaliação e predição

Avaliar exatamente os arquivos de validação registrados no checkpoint:

```powershell
uv run vascular-segmentation evaluate
```

Gerar uma máscara binária na resolução original de uma imagem:

```powershell
uv run vascular-segmentation predict data\images\2.png --output artifacts\2_mask.png
```

Dice e IoU são calculados de forma agregada sobre os pixels do subconjunto. Um resultado cientificamente defensável exige, no mínimo, imagens brutas, separação por paciente e um conjunto de teste independente que não seja usado para escolher arquitetura, hiperparâmetros ou limiar.

## Qualidade e testes

```powershell
uv run ruff check .
uv run pytest
```

O workflow `quality.yml` executa lint e testes em Python 3.11, 3.12, 3.13 e 3.14. Uma tarefa semanal adicional testa automaticamente a versão estável mais recente disponível no GitHub Actions. Essa tarefa é informativa (`continue-on-error`) porque uma nova versão do Python pode surgir antes de PyTorch e outras dependências publicarem pacotes compatíveis.

## Atualizações de Python e dependências

Atualização totalmente automática do interpretador de um experimento treinado não é recomendável: uma mudança de versão pode alterar a resolução de dependências e a reprodutibilidade. O projeto usa um fluxo controlado:

1. `uv.lock` registra versões exatas e multiplataforma das dependências.
2. Dependabot abre propostas semanais de atualização para o lockfile e para GitHub Actions.
3. O CI testa todas as versões explicitamente suportadas.
4. O job `latest-stable-python` detecta automaticamente compatibilidade com uma nova versão estável.
5. Depois de o CI passar, atualize `.python-version`, execute os testes e registre a mudança em commit.

Se o interpretador for gerenciado pelo `uv`, `uv python upgrade 3.14` atualiza automaticamente para o patch mais recente da série 3.14. O próprio `uv` não atualiza automaticamente entre versões menores, como 3.14 para 3.15, porque isso pode mudar a resolução das dependências.

## Controle de versão

O diretório foi preparado para Git. Um fluxo mínimo é:

```powershell
git status
git add .
git commit -m "Reestrutura projeto de segmentacao vascular"
```

As imagens e anotações do subconjunto local podem ser versionadas porque o registro de origem S-BIAD463 declara licença CC0. A atribuição científica continua sendo preservada no README e deve ser mantida em publicações derivadas. Pesos `.pth` e `.pt` permanecem ignorados; se precisarem ser publicados, use armazenamento próprio para artefatos e documente a versão do código, o conjunto de dados e os hiperparâmetros que os produziram.

## Limitações conhecidas e próximos requisitos científicos

- Não há imagens brutas no material recebido; todas as imagens locais aparentam conter sobreposições de rótulos.
- Há somente um paciente local, impedindo avaliação independente por paciente.
- O COCO local não fornece licença no campo `licenses`; a licença CC0 foi confirmada no registro de origem S-BIAD463.
- Não foi fornecido protocolo de aquisição, definição histopatológica do alvo, aprovação ética, estratégia de amostragem ou referência bibliográfica do conjunto.
- A redução para 256 × 256 deforma imagens originalmente retangulares. Ela foi mantida como configuração inicial computacional, não como escolha metodológica validada. Estudos posteriores devem comparar recortes, preservação de proporção e resolução compatível com a escala das estruturas.
- A segmentação é binária; as três classes de dilatação são unidas. Uma tarefa multiclasse exigiria objetivos e validação próprios.
- Não há conjunto de teste externo nem estimativa de incerteza.

Essas lacunas devem ser resolvidas antes de interpretar métricas como evidência sobre desempenho clínico ou populacional.

## Fontes técnicas

- [Ronneberger, Fischer e Brox: U-Net para segmentação de imagens biomédicas](https://doi.org/10.1007/978-3-319-24574-4_28)
- [Taha e Hanbury: métricas para avaliação de segmentação em imagens médicas](https://doi.org/10.1186/s12880-015-0068-x)
- [Python: uso no Windows](https://docs.python.org/3/using/windows.html)
- [Python: ambientes virtuais com `venv`](https://docs.python.org/3/library/venv.html)
- [PyPA: metadados de projeto e `requires-python`](https://packaging.python.org/en/latest/specifications/declaring-project-metadata/)
- [PyTorch: instalação local e requisitos](https://docs.pytorch.org/get-started/locally/)
- [PyTorch: `BCEWithLogitsLoss`](https://docs.pytorch.org/docs/stable/generated/torch.nn.BCEWithLogitsLoss.html)
- [GitHub: atualizações de versão com Dependabot](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates)
- [GitHub Actions: configuração de Python](https://docs.github.com/en/actions/how-tos/use-cases-and-examples/building-and-testing/building-and-testing-python)
- [uv: versões e atualização de Python](https://docs.astral.sh/uv/concepts/python-versions/)
- [uv: integração com Dependabot](https://docs.astral.sh/uv/guides/integration/dependabot/)

As afirmações sobre o conteúdo e as contagens do conjunto local provêm dos arquivos `COCO_annotations.json`, `DCIS.Patient_001.2.json` e das dez imagens fornecidas, não das fontes técnicas externas.
