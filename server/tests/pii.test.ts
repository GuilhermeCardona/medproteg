import { test } from "node:test";
import assert from "node:assert/strict";
import { pseudonimizar, cpfValido } from "../src/pii.ts";

test("valida dígitos do CPF", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("529.982.247-26"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
});

test("troca CPF, e-mail e telefone por marcadores", () => {
  const { texto, contagem } = pseudonimizar(
    "CPF 529.982.247-25, e-mail joao.silva@email.com, fone (51) 99876-5432",
  );
  assert.equal(texto, "CPF [CPF_1], e-mail [EMAIL_1], fone [TELEFONE_1]");
  assert.deepEqual(contagem, { CPF: 1, EMAIL: 1, TELEFONE: 1 });
});

test("não mascara número com formato de CPF mas inválido", () => {
  const { texto } = pseudonimizar("Protocolo 123.456.789-00");
  assert.equal(texto, "Protocolo 123.456.789-00");
});

test("mesmo dado repetido recebe o mesmo marcador", () => {
  const { texto, ocorrencias } = pseudonimizar("529.982.247-25 e de novo 529.982.247-25");
  assert.equal(texto, "[CPF_1] e de novo [CPF_1]");
  assert.equal(ocorrencias.length, 1);
});

test("detecta nome depois de rótulo e data de nascimento", () => {
  const { texto } = pseudonimizar("Paciente: Maria da Silva Souza\nData de nascimento: 12/03/1980");
  assert.equal(texto, "Paciente: [NOME_1]\nData de nascimento: [DATA_NASCIMENTO_1]");
});

test("encontra códigos CID (dado de saúde)", () => {
  const { codigosCid } = pseudonimizar("Hipótese diagnóstica: asma (CID J45.0). CID-10: I10");
  assert.deepEqual(codigosCid, ["J45.0", "I10"]);
});

test("CNPJ não é confundido com telefone", () => {
  const { texto } = pseudonimizar("Contratada: CNPJ 12.345.678/0001-95");
  assert.equal(texto, "Contratada: CNPJ [CNPJ_1]");
});
