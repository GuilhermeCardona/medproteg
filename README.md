# MedProteg

Plataforma de compliance e LGPD para hospitais. Começou como projeto interdisciplinar com estudantes de Direito (disciplina Direito, Inovação e Empreendedorismo, PUCRS) e hoje tem três partes:

- **Painel do cliente** (`Medproteg.html`): dashboard com score de conformidade, riscos, alertas e envio de documentos.
- **API de análise com IA** (`server/`): recebe o texto de um documento, tira os dados pessoais e pede para um LLM apontar riscos de LGPD.
- **Página de vendas**: repositório separado, [medproteg-landing](https://github.com/GuilhermeCardona/medproteg-landing).

## Como a análise funciona

```
texto do documento
   │
   ▼
pseudonimização (server/src/pii.ts)     CPF, CNS, telefone, e-mail, CEP, nomes → [CPF_1], [NOME_1]...
   │                                    códigos CID marcam o documento como dado de saúde
   ▼
LLM (server/src/llm.ts)                 Gemini via API REST, resposta em JSON
   │
   ▼
validação (server/src/schema.ts)        Zod confere o formato; se vier errado, o modelo recebe o erro e tenta de novo
   │
   ▼
painel                                  score, riscos por gravidade e recomendações
```

O ponto principal: **o modelo nunca recebe o dado real do paciente.** A detecção roda no servidor antes da chamada (princípio da necessidade, art. 6º, III, da LGPD). O texto do documento também não vai para os logs.

Algumas decisões:

- O CPF só é mascarado se os dígitos verificadores baterem, para não esconder números de protocolo.
- O mesmo dado repetido recebe sempre o mesmo marcador, assim o modelo entende que é a mesma pessoa.
- Se o texto tem código CID, o documento é marcado como sensível mesmo que o modelo diga o contrário: a regra local é determinística, o modelo não.
- A camada do LLM é uma interface (`ProvedorLLM`). Trocar o Gemini por outro modelo é mexer em um arquivo só.

## Rodando

Requisitos: Node.js 20+.

```bash
cd server
npm install
cp .env.example .env     # coloque sua GEMINI_API_KEY (gratuita em https://aistudio.google.com/apikey)
npm run dev              # API em http://localhost:3000
```

Sem chave, o servidor roda em **modo mock**: monta uma análise simples a partir dos dados detectados, sem IA. Serve para testar o fluxo inteiro.

Depois abra o `Medproteg.html` no navegador, vá em "Envio de Documentos" e cole um texto (há exemplos fictícios em `server/evals/documentos/`).

### Exemplo de chamada

```bash
curl -X POST http://localhost:3000/analisar \
  -H "Content-Type: application/json" \
  -d '{"texto": "Paciente: Roberto Almeida Costa\nCPF: 529.982.247-25\nDiagnóstico: CID J44.1"}'
```

## Testes e avaliação

```bash
npm test         # testes unitários (pseudonimização, validação, novas tentativas)
npm run evals    # roda o analisador nos documentos fictícios e compara com o esperado
```

Os testes conferem o código. As avaliações (`server/evals/`) conferem o comportamento do modelo: cada documento tem o resultado esperado em `esperado.json` (se tem dado sensível, quais riscos precisam aparecer, faixa de score). Sempre que o prompt muda, rodo as avaliações de novo.

## Estrutura

```
Medproteg.html          painel (HTML, CSS, JS, Bootstrap, Chart.js)
server/
  src/
    index.ts            API Express (GET /health, POST /analisar)
    pii.ts              detecção e pseudonimização de dados pessoais
    prompt.ts           prompt do sistema
    llm.ts              provedores: Gemini e mock
    schema.ts           formato da resposta (Zod)
    analyzer.ts         junta tudo: pseudonimiza, chama o modelo, valida, tenta de novo
    evals.ts            script de avaliação
  tests/                testes com node:test
  evals/                documentos fictícios e resultados esperados
```

## Próximos passos

- Ler PDF e DOCX direto (hoje aceita texto e `.txt`).
- Detectar nomes sem rótulo com um modelo de NER.
- Guardar o histórico de análises em banco de dados.
- Trocar o chatbot por palavra-chave do painel por respostas com IA.

## Limitações

Protótipo acadêmico. Não substitui revisão jurídica, não tem autenticação e os dados do painel são fictícios. A detecção de dados pessoais por regex não pega tudo, por isso a análise do modelo é um apoio e não uma garantia.
