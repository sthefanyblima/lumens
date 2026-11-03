import type { Db } from '../src/client';
import {
  apoios,
  blocos,
  caminhos,
  curadores,
  estudantes,
  eventos,
  papeisPauta,
  pautas,
  promessas,
  propostas,
  relatos,
  respostasConferencia,
  voluntarios,
} from '../src/schema';
import { dadosSeed } from './data';

/**
 * TODO(T9): substituir as inserções diretas pelas funções do domínio quando os casos de
 * uso de criação existirem. Até lá, a transação e as constraints preservam a consistência.
 */
export async function executarSeed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(blocos).values(dadosSeed.blocos).onConflictDoNothing();
    await tx.insert(estudantes).values(dadosSeed.estudantes).onConflictDoNothing();
    await tx.insert(curadores).values(dadosSeed.curadores).onConflictDoNothing();
    await tx.insert(pautas).values(dadosSeed.pautas).onConflictDoNothing();
    await tx.insert(papeisPauta).values(dadosSeed.papeisPauta).onConflictDoNothing();
    await tx.insert(apoios).values(dadosSeed.apoios).onConflictDoNothing();
    await tx.insert(relatos).values(dadosSeed.relatos).onConflictDoNothing();
    await tx.insert(caminhos).values(dadosSeed.caminhos).onConflictDoNothing();
    await tx.insert(propostas).values(dadosSeed.propostas).onConflictDoNothing();
    await tx.insert(voluntarios).values(dadosSeed.voluntarios).onConflictDoNothing();
    await tx.insert(promessas).values(dadosSeed.promessas).onConflictDoNothing();
    await tx
      .insert(respostasConferencia)
      .values(dadosSeed.respostasConferencia)
      .onConflictDoNothing();
    await tx.insert(eventos).values(dadosSeed.eventos).onConflictDoNothing();
  });
}
