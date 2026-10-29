// Detecção e pseudonimização de dados pessoais.
//
// Roda ANTES de qualquer chamada ao modelo de IA: o texto que sai do servidor
// vai com os dados pessoais trocados por marcadores ([CPF_1], [EMAIL_1]...).
// É a aplicação prática do princípio da necessidade (art. 6º, III, da LGPD):
// o modelo não precisa saber o CPF do paciente para avaliar o documento.

export type TipoDado =
  | "CPF"
  | "CNPJ"
  | "CNS"
  | "EMAIL"
  | "TELEFONE"
  | "CEP"
  | "DATA_NASCIMENTO"
  | "NOME";

export interface Ocorrencia {
  tipo: TipoDado;
  valor: string;
  marcador: string;
}

export interface ResultadoPseudonimizacao {
  texto: string;
  ocorrencias: Ocorrencia[];
  contagem: Partial<Record<TipoDado, number>>;
  /** Códigos CID encontrados: indicam dado de saúde (dado sensível, art. 11). */
  codigosCid: string[];
}

// A ordem importa: padrões mais específicos primeiro, para um CNPJ não ser
// lido como telefone, por exemplo.
const PADROES: { tipo: TipoDado; regex: RegExp; validar?: (v: string) => boolean }[] = [
  { tipo: "EMAIL", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { tipo: "CNPJ", regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  { tipo: "CPF", regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, validar: cpfValido },
  // Cartão Nacional de Saúde: 15 dígitos, às vezes em blocos de 3 ou 4
  { tipo: "CNS", regex: /\b[1-9]\d{2}[ .]?\d{4}[ .]?\d{4}[ .]?\d{4}\b/g },
  { tipo: "TELEFONE", regex: /(?:\+55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g },
  { tipo: "CEP", regex: /\b\d{5}-\d{3}\b/g },
  {
    tipo: "DATA_NASCIMENTO",
    regex: /(?<=nascimento:?\s*|nasc\.:?\s*|nascido em\s*|nascida em\s*)\d{2}\/\d{2}\/\d{4}/gi,
  },
  // Nome só quando vem depois de um rótulo; detectar nome solto no texto
  // gera muito falso positivo sem um modelo de NER.
  {
    tipo: "NOME",
    regex: /(?<=(?:[Pp]aciente|[Nn]ome|[Rr]esponsável|[Aa]companhante): *)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?: +(?:d[aeo]s? +)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)+/g,
  },
];

const CID = /\bCID(?:-10)?:?\s*([A-TV-Z]\d{2}(?:\.\d)?)\b/gi;

export function pseudonimizar(textoOriginal: string): ResultadoPseudonimizacao {
  let texto = textoOriginal;
  const ocorrencias: Ocorrencia[] = [];
  const contagem: Partial<Record<TipoDado, number>> = {};
  // Mesmo valor sempre recebe o mesmo marcador (o modelo percebe que é a mesma pessoa)
  const jaVistos = new Map<string, string>();

  for (const { tipo, regex, validar } of PADROES) {
    texto = texto.replace(regex, (valor) => {
      if (validar && !validar(valor)) return valor;
      const chave = `${tipo}:${valor}`;
      let marcador = jaVistos.get(chave);
      if (!marcador) {
        contagem[tipo] = (contagem[tipo] ?? 0) + 1;
        marcador = `[${tipo}_${contagem[tipo]}]`;
        jaVistos.set(chave, marcador);
        ocorrencias.push({ tipo, valor, marcador });
      }
      return marcador;
    });
  }

  const codigosCid = [...textoOriginal.matchAll(CID)].map((m) => m[1].toUpperCase());

  return { texto, ocorrencias, contagem, codigosCid };
}

/** Confere os dígitos verificadores do CPF. */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(d.slice(0, 9)) === Number(d[9]) && digito(d.slice(0, 10)) === Number(d[10]);
}
