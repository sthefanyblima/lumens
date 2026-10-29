/**
 * Gravação do número de protocolo do caminho oficial.
 *
 * O Fala.BR não tem API: o owner protocola à mão e volta ao bot com o número.
 * Este é o ponto em que a pauta deixa de ser uma reclamação interna e passa a
 * ter uma contraparte formal — e é o número que permite cobrar depois, porque
 * sem ele não há o que acompanhar nem o que citar.
 *
 * Guardar o protocolo e calcular o prazo são o mesmo ato: o prazo dos 30+30
 * conta do dia do protocolo (ver `prazo.ts`), então deixar `caminho.prazo` para
 * um segundo passo abriria a janela em que existe protocolo sem prazo — e é
 * justamente o prazo que sustenta a cobrança.
 *
 * Porta de escrita de `caminho.protocolo` e `caminho.prazo`: nenhum outro
 * módulo deve gravar nessas colunas.
 */
import { and, eq, sql, type Tx } from '@lumens/db';
import { caminhos } from '@lumens/db';
import { calcularPrazo } from './prazo';

export interface RegistroDeProtocolo {
  caminhoId: string;
  /** O número que o Fala.BR devolveu ao owner. */
  protocolo: string;
  /** Dia do protocolo, em `YYYY-MM-DD`. O prazo conta dele. */
  abertoEm: string;
  /** A ouvidoria já prorrogou? Normalmente não no momento do protocolo. */
  prorrogado?: boolean;
}

export type MotivoRecusaProtocolo =
  'caminho_inexistente' | 'caminho_sem_protocolo' | 'protocolo_divergente' | 'protocolo_invalido';

export type ResultadoProtocolo =
  | {
      registrado: true;
      protocolo: string;
      /** Dia do vencimento, em `YYYY-MM-DD`. */
      prazo: string | null;
      /** Verdadeiro quando o número já estava gravado e nada mudou. */
      jaEstava: boolean;
    }
  | { registrado: false; motivo: MotivoRecusaProtocolo };

/**
 * Espaços colapsados e pontas limpas.
 *
 * O número chega colado de um e-mail ou da tela do Fala.BR, muitas vezes com
 * espaço sobrando ou quebra de linha no meio.
 */
function arrumarProtocolo(bruto: string): string {
  return bruto.replace(/\s+/g, ' ').trim();
}

/** Comparação que ignora a pontuação do NUP, que varia conforme de onde se copia. */
function soDigitos(protocolo: string): string {
  return protocolo.replace(/\D/g, '');
}

/** Teto generoso: o NUP tem 17 dígitos, e o resto é pontuação. */
const TAMANHO_MAXIMO = 60;

/**
 * Grava o protocolo de um caminho e calcula o prazo no mesmo passo.
 *
 * **Não valida o formato do NUP de propósito.** O número único de protocolo
 * tem um desenho conhecido (`NNNNN.NNNNNN/AAAA-DD`), mas o que o owner copia
 * varia conforme a tela, o e-mail de confirmação e o tipo de manifestação.
 * Uma expressão estrita aqui erraria para o lado que não dá para contornar: o
 * estudante com o protocolo na mão não conseguiria registrá-lo, e a pauta
 * ficaria sem cobrança nenhuma. O que se recusa é o que é certamente errado —
 * vazio, sem nenhum dígito, ou comprido demais para ser um protocolo.
 *
 * **Reenviar o mesmo número não é erro.** O bot pode perder a confirmação e o
 * owner reenviar; o resultado volta com `jaEstava: true` e nada é regravado.
 * Um número *diferente* é recusado em vez de sobrescrever: o protocolo liga a
 * pauta a uma manifestação real, e trocá-lo calado perderia esse vínculo sem
 * deixar rastro.
 *
 * Roda dentro da transação de quem chama, para o protocolo e o avanço da
 * conversa do bot confirmarem ou desfazerem juntos.
 */
export async function registrarProtocolo(
  tx: Tx,
  { caminhoId, protocolo, abertoEm, prorrogado = false }: RegistroDeProtocolo,
): Promise<ResultadoProtocolo> {
  const limpo = arrumarProtocolo(protocolo);
  if (limpo === '' || soDigitos(limpo) === '' || limpo.length > TAMANHO_MAXIMO) {
    return { registrado: false, motivo: 'protocolo_invalido' };
  }

  const [caminho] = await tx
    .select({ tipo: caminhos.tipo, protocolo: caminhos.protocolo, prazo: caminhos.prazo })
    .from(caminhos)
    .where(eq(caminhos.id, caminhoId))
    .limit(1);

  if (caminho === undefined) return { registrado: false, motivo: 'caminho_inexistente' };

  // Só o Fala.BR emite protocolo. Caminho pela comunidade ou por representante
  // não tem número, e aceitar um aqui inventaria uma formalidade que não existe.
  if (caminho.tipo !== 'falabr') {
    return { registrado: false, motivo: 'caminho_sem_protocolo' };
  }

  if (caminho.protocolo !== null) {
    if (soDigitos(caminho.protocolo) !== soDigitos(limpo)) {
      return { registrado: false, motivo: 'protocolo_divergente' };
    }
    return {
      registrado: true,
      protocolo: caminho.protocolo,
      prazo: caminho.prazo,
      jaEstava: true,
    };
  }

  // `calcularPrazo` recusa data que não é dia civil, e a recusa sobe como
  // RangeError: protocolo gravado com prazo errado faria o sistema cobrar a
  // universidade na data errada e em público.
  const prazo = calcularPrazo({ abertoEm, prorrogado });

  // A gravação é condicionada a `protocolo IS NULL` para resolver a corrida no
  // banco e não na leitura acima: duas mensagens do owner em sequência chegam
  // como duas transações, e a segunda não pode sobrescrever a primeira.
  const [gravado] = await tx
    .update(caminhos)
    .set({ protocolo: limpo, prazo: prazo.vence })
    // `is null` escrito à mão porque o `isNull` do Drizzle não está na lista de
    // operadores que o @lumens/db reexporta, e essa lista é do pacote de outra
    // pessoa. Acrescentá-lo lá seria mais limpo, mas é decisão de quem o mantém.
    .where(and(eq(caminhos.id, caminhoId), sql`${caminhos.protocolo} is null`))
    .returning({ protocolo: caminhos.protocolo, prazo: caminhos.prazo });

  if (gravado !== undefined) {
    return { registrado: true, protocolo: limpo, prazo: prazo.vence, jaEstava: false };
  }

  // Perdeu a corrida: alguém gravou entre a leitura e a escrita. Vale o mesmo
  // critério de antes — número igual é reenvio, número diferente é divergência.
  const [atual] = await tx
    .select({ protocolo: caminhos.protocolo, prazo: caminhos.prazo })
    .from(caminhos)
    .where(eq(caminhos.id, caminhoId))
    .limit(1);

  if (atual?.protocolo == null) return { registrado: false, motivo: 'caminho_inexistente' };

  return soDigitos(atual.protocolo) === soDigitos(limpo)
    ? { registrado: true, protocolo: atual.protocolo, prazo: atual.prazo, jaEstava: true }
    : { registrado: false, motivo: 'protocolo_divergente' };
}
