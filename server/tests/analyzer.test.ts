import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarDocumento } from "../src/analyzer.ts";
import { mock, type ProvedorLLM } from "../src/llm.ts";

const RESPOSTA_VALIDA = JSON.stringify({
  tipoDocumento: "Contrato",
  resumo: "Contrato de prestação de serviços.",
  contemDadosSensiveis: false,
  riscos: [],
  recomendacoes: [],
  score: 90,
});

/** Provedor de teste que devolve respostas pré-definidas e guarda o que recebeu. */
function roteiro(respostas: string[]) {
  const recebidos: string[] = [];
  const provedor: ProvedorLLM = {
    nome: "roteiro",
    async gerarJson({ usuario }) {
      recebidos.push(usuario);
      return respostas.shift() ?? "";
    },
  };
  return { provedor, recebidos };
}

test("o modelo nunca recebe o CPF original", async () => {
  const { provedor, recebidos } = roteiro([RESPOSTA_VALIDA]);
  await analisarDocumento("Paciente CPF 529.982.247-25", provedor);
  assert.ok(!recebidos[0].includes("529.982.247-25"));
  assert.ok(recebidos[0].includes("[CPF_1]"));
});

test("aceita JSON embrulhado em bloco de código", async () => {
  const { provedor } = roteiro(["```json\n" + RESPOSTA_VALIDA + "\n```"]);
  const r = await analisarDocumento("texto qualquer", provedor);
  assert.equal(r.analise.score, 90);
});

test("pede correção quando a resposta vem fora do formato", async () => {
  const { provedor, recebidos } = roteiro(['{"score": "alto"}', RESPOSTA_VALIDA]);
  const r = await analisarDocumento("texto qualquer", provedor);
  assert.equal(r.tentativas, 2);
  assert.match(recebidos[1], /resposta anterior foi inválida/);
});

test("desiste depois de duas respostas inválidas", async () => {
  const { provedor } = roteiro(["não é json", "também não"]);
  await assert.rejects(analisarDocumento("texto qualquer", provedor), /não devolveu uma análise válida/);
});

test("CID no texto força contemDadosSensiveis = true", async () => {
  const { provedor } = roteiro([RESPOSTA_VALIDA]); // modelo diz false
  const r = await analisarDocumento("Diagnóstico: CID J45", provedor);
  assert.equal(r.analise.contemDadosSensiveis, true);
});

test("rejeita documento vazio", async () => {
  await assert.rejects(analisarDocumento("   ", mock()), /vazio/);
});
