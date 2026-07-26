# Fluxo completo do projeto

Este documento explica o funcionamento atual do fluxo de análise de imagens vasculares do projeto, do carregamento da imagem até a resposta final salva em disco. O objetivo é registrar de forma clara como a aplicação foi montada, o papel de cada configuração e as escolhas técnicas feitas para integrar TypeScript, Node.js, LangChain, OpenRouter, RAG e Neo4j.

## Visão geral

O fluxo principal segue esta ideia:

1. a imagem de entrada é carregada e normalizada;
2. a assinatura da imagem é calculada para busca por similaridade;
3. o RAG recupera contexto no Neo4j com base nessa assinatura;
4. o prompt JSON é montado com instruções específicas;
5. o modelo da OpenRouter gera a resposta;
6. dependendo das flags de configuração, a resposta pode vir como contorno estruturado ou como imagem anotada;
7. o resultado final é salvo em `response/` na raiz do projeto.

O projeto hoje trabalha com dois modos principais:

- modo contorno: a LLM devolve JSON com `vascular_structures` e o overlay é montado localmente;
- modo imagem: a LLM devolve `annotated_image_base64` e o sistema apenas salva a imagem produzida.

## O que cada configuração faz

As principais configurações ficam em [src/config.ts](../src/config.ts).

- `openrouterKey`: chave da API da OpenRouter, lida do ambiente.
- `baseUrl`: endpoint base da OpenRouter.
- `httpReferer` e `xTitle`: cabeçalhos usados pela OpenRouter para identificação da aplicação.
- `models`: lista de modelos candidatos. O primeiro modelo da lista é o escolhido pelo cliente atual.
- `provider.sort.by`: critério de seleção de provedor. Hoje está em `throughput` para priorizar resposta mais rápida.
- `provider.sort.partition`: particionamento do provedor. Está como `none`.
- `temperature`: controla aleatoriedade da saída. Quanto menor, mais determinística tende a ser a resposta.
- `maxTokens`: limite máximo de tokens de saída.
- `topK`: quantidade de resultados recuperados pelo RAG.
- `defaultImagePath`: caminho padrão caso uma imagem não seja informada externamente.
- `sendImageToLlm`: define se a imagem de entrada será enviada ao modelo.
- `receviedImage`: define se a saída esperada é uma imagem anotada gerada pela LLM.
- `maxAttempts`: número máximo de tentativas com retry.
- `baseRetryDelayMs`: atraso base entre retries.

Observação importante: o nome `receviedImage` mantém o typo do arquivo atual. O comportamento, porém, é claro: quando esse valor está `true`, a saída esperada é uma imagem anotada; quando está `false`, a saída esperada é um JSON com contornos.

## Como funciona a integração com OpenRouter e LangChain

A integração com OpenRouter está concentrada em [src/services/openrouter.service.ts](../src/services/openrouter.service.ts).

### Papel do LangChain

O projeto usa `@langchain/openai` e `@langchain/core` como camada de integração com o modelo. Em vez de chamar a API diretamente, o código cria um `ChatOpenAI` e envia mensagens no formato esperado pelo framework.

Isso traz algumas vantagens:

- padroniza o envio de mensagens de sistema e usuário;
- facilita o suporte a texto e imagem no mesmo fluxo;
- simplifica retries e manuseio de falhas;
- permite alternar entre geração estruturada e geração multimodal sem reescrever toda a integração.

### OpenRouter como gateway de modelos

A OpenRouter funciona como camada de roteamento entre o projeto e diferentes modelos hospedados por provedores distintos. O mesmo código pode usar modelos de texto ou imagem, dependendo da configuração em `models`.

Hoje o projeto usa dois caminhos principais:

- `generateStructured(...)`: usado quando a resposta é texto/JSON puro;
- `generateStructuredFromImage(...)`: usado quando a imagem precisa ser enviada junto com o prompt.

### Como a resposta é validada

O retorno do modelo não é aceito de forma cega. Depois de receber a resposta, o serviço:

1. remove caracteres de controle e sujeira de formatação;
2. remove cercas markdown como ```json quando existirem;
3. extrai o trecho JSON;
4. valida com Zod;
5. só então devolve o objeto estruturado ao grafo.

Isso foi necessário porque o modelo às vezes responde com cercas markdown, texto auxiliar ou formatos ligeiramente diferentes do esperado.

## Como o prompt JSON foi montado

O prompt é construído em [src/prompts/image.analiser.ts](../src/prompts/image.analiser.ts).

### Estrutura geral

O prompt é dividido em três partes:

1. `getSystemPrompt()`: monta as regras gerais do comportamento do modelo;
2. `getUserPromptTemplate(...)`: monta a instrução específica da tarefa atual;
3. contexto RAG: entra no prompt como apoio sem substituir a evidência da imagem.

### Por que JSON

O projeto usa JSON porque a saída precisa ser consumida por etapas posteriores do pipeline:

- o overlay local precisa saber onde desenhar;
- o salvamento precisa manter uma estrutura previsível;
- os testes conseguem validar campos com facilidade;
- o fluxo fica menos dependente de texto livre e mais fácil de depurar.

### Quando a saída é contorno

No modo contorno, o modelo deve devolver um JSON com, no mínimo:

- `summary`
- `has_vascular_structures`
- `image_width`
- `image_height`
- `vascular_structures`
- `tumor_boundaries`

Cada estrutura vascular traz:

- `id`
- `label`
- `confidence`
- `contour_points`

O contorno é o formato escolhido porque ele descreve melhor a forma real da estrutura do que um único ponto central.

### Quando a saída é imagem

No modo imagem, o prompt pede:

- `summary`
- `has_vascular_structures`
- `image_width`
- `image_height`
- `annotated_image_base64`

Nesse caso a intenção é que a própria LLM devolva a imagem já anotada, reduzindo a necessidade de montagem local do overlay.

### Papel das flags no prompt

- `sendImageToLlm = false`: o modelo recebe apenas o contexto textual do RAG e devolve contornos em JSON.
- `sendImageToLlm = true`: o modelo recebe a imagem de entrada e pode usá-la para gerar a resposta.
- `receviedImage = true`: o modelo deve devolver imagem anotada.
- `receviedImage = false`: o modelo deve devolver contornos estruturados.

## O que é RAG e como foi feito

RAG significa Retrieval-Augmented Generation. Na prática, é o processo de recuperar contexto relevante antes de perguntar ao modelo.

Neste projeto, o RAG ajuda a LLM de duas formas:

- traz o contexto do caso mais semelhante;
- entrega metadados e artefatos auxiliares do paciente semelhante.

### Por que o RAG foi usado

O problema não é apenas “descrever uma imagem”; é identificar estruturas vasculares dentro de um domínio específico, com anotações e classes pré-existentes. O RAG reduz a chance de o modelo trabalhar só no vazio, porque ele recebe:

- imagens de referência;
- máscara;
- anotação local;
- manifesto do caso;
- contexto textual recuperado do Neo4j.

Isso melhora a coerência da resposta, principalmente em rótulos de classe e na interpretação do padrão morfológico.

## Por que Neo4j foi usado

O Neo4j foi escolhido porque o problema não é só de arquivo, mas de relacionamento entre entidades.

### O que fica no grafo

O seed local registra entidades como:

- imagens;
- anotações;
- categorias;
- tiles;
- relações entre esses nós.

### Vantagens do Neo4j

- permite navegar por relações de forma natural;
- facilita recuperar contexto do caso mais parecido;
- organiza imagens, categorias e anotações sem depender apenas de busca por arquivo;
- ajuda a associar imagem bruta, imagem marcada, máscara e metadados do mesmo caso.

### O que o RAG recupera com Neo4j

O fluxo de recuperação busca o caso mais próximo por similaridade de assinatura e depois usa o grafo para montar contexto. Isso é melhor do que procurar apenas por nome de arquivo, porque o dataset tem vários arquivos com nomes semelhantes e estrutura hierárquica por paciente.

## Como o TypeScript e Node.js são usados

O projeto está em TypeScript e roda em Node.js moderno.

### Por que TypeScript

- melhora a segurança de tipos no pipeline;
- ajuda a documentar o formato esperado de cada etapa;
- reduz erro de integração entre nós do grafo;
- facilita evolução do contrato JSON e dos schemas Zod.

### Por que Node.js

- executa facilmente scripts de preparação, seed e testes;
- integra bem com Sharp, Neo4j e LangChain;
- permite usar o sistema de módulos moderno (`type: module`);
- simplifica o fluxo de automação acadêmica e prototipagem.

### Como o projeto roda

Os scripts principais estão em `package.json`:

- `data:prepare`: prepara dataset e artefatos derivados;
- `neo4j:seed`: popula o grafo com os dados locais;
- `analyze:image`: executa o fluxo principal;
- `test`: roda os testes com Node native test runner;
- `langgraph:serve`: expõe o grafo via LangGraph CLI.

## Fluxo técnico por etapa

### 1. Leitura da imagem

A imagem é carregada como base64 e normalizada. Isso permite padronizar a entrada para o restante do fluxo.

### 2. Assinatura de imagem

A assinatura é calculada para busca por similaridade. O objetivo é encontrar o caso mais próximo no espaço de dados do projeto.

### 3. Recuperação RAG

O serviço de RAG consulta o Neo4j, encontra o caso semelhante e monta o contexto que será enviado ao modelo.

### 4. Montagem do prompt

O prompt recebe:

- instruções de comportamento;
- contexto do caso recuperado;
- modo de saída esperado;
- dimensões da imagem;
- regras sobre o formato JSON.

### 5. Chamada ao modelo

Dependendo da configuração, o fluxo usa texto puro ou multimodal.

### 6. Pós-processamento

- se a saída for contorno, o overlay local monta a imagem final;
- se a saída for imagem, o sistema salva a imagem retornada pela LLM;
- em ambos os casos o JSON também é preservado em `response/`.

### 7. Persistência

Os artefatos finais ficam na pasta `response/` na raiz do projeto:

- imagem final;
- JSON da resposta.

## Acertos do projeto

- Separação por paciente nas estruturas locais e nos dados derivados.
- Uso de RAG para trazer contexto específico do caso.
- Neo4j como base relacional para recuperar pacientes, imagens e anotações.
- Prompt JSON mais estável e fácil de testar.
- Tratamento de falhas do provedor com retry e sanitização.
- Suporte a dois modos de saída: contorno e imagem anotada.
- Persistência da resposta em artefatos separados para auditoria.

## Falhas e limitações encontradas

### Falhas técnicas

- O provedor às vezes devolve Markdown com cercas ```json, o que exigiu parser tolerante.
- O provedor pode rejeitar schemas muito rígidos ou combinações específicas de multimodal + structured output.
- O modelo às vezes devolve `id` numérico, exigindo schema mais flexível.
- A montagem local de overlay pode ficar visualmente distante do esperado se o contorno vier pequeno ou simplificado demais.

### Limitações do conjunto e do experimento

- Há limitação de dados disponíveis para teste real.
- O custo de chamadas multimodais é maior do que o fluxo somente textual.
- Respostas com imagem anotada tendem a ser mais caras e mais lentas.
- O contexto RAG melhora a precisão, mas não substitui validação visual e científica.

### Limitação orçamentária

Para obter melhores resultados, especialmente com imagem gerada pela IA, normalmente seria necessário:

- testar modelos mais fortes e mais caros;
- aumentar o número de tentativas com variações de prompt;
- comparar múltiplos modelos de visão;
- usar mais imagens de referência e mais contexto recuperado.

O projeto, porém, foi montado com restrição de orçamento e custo por chamada. Por isso, o fluxo atual privilegia:

- uso de um modelo único principal;
- prompts enxutos;
- RAG para reduzir desperdício de contexto;
- fallback local de overlay quando a imagem da IA não é necessária.

## Conclusão

O projeto foi estruturado para ser um protótipo funcional, auditável e extensível. O uso de TypeScript, Node.js, LangChain, OpenRouter, RAG e Neo4j permite separar bem cada responsabilidade do pipeline e facilita evolução posterior.

O fluxo atual cobre duas necessidades distintas:

- geração de contornos para montagem local;
- geração de imagem anotada pela própria LLM.

Essa separação é importante porque permite equilibrar custo, velocidade e qualidade visual de acordo com o objetivo da execução.
