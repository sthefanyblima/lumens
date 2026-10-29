import { describe, expect, it } from 'vitest';
import { type PautaParaTexto, gerarTextoFalaBr } from './texto-falabr';

const PAUTA: PautaParaTexto = {
  titulo: 'Ampliação do número de mesas do Restaurante Universitário',
  descricao:
    'A fila do almoço passa de quarenta minutos porque não há mesas livres. ' +
    'Estudantes com aula às 13h desistem de almoçar.',
  categoria: 'Infraestrutura',
  bloco: 'Bloco 12',
  apoios: 184,
  meta: 300,
};

const pauta = (mudanca: Partial<PautaParaTexto> = {}): PautaParaTexto => ({
  ...PAUTA,
  ...mudanca,
});

describe('gerarTextoFalaBr (SCRUM-213)', () => {
  describe('o texto', () => {
    it('traz assunto, categoria, local, descrição, apoio e pedido', () => {
      const { texto } = gerarTextoFalaBr(pauta());

      expect(texto).toContain('Assunto: Ampliação do número de mesas');
      expect(texto).toContain('Categoria: Infraestrutura');
      expect(texto).toContain('Local: Bloco 12');
      expect(texto).toContain('Descrição');
      expect(texto).toContain('passa de quarenta minutos');
      expect(texto).toContain('Pedido');
    });

    it('diz quantos estudantes assinam, que é a força do pedido', () => {
      const { texto } = gerarTextoFalaBr(pauta());

      expect(texto).toContain('184');
      expect(texto).toContain('300');
    });

    it('pauta sem bloco é do campus inteiro', () => {
      const { texto } = gerarTextoFalaBr(pauta({ bloco: null }));

      expect(texto).toContain('Local: Campus inteiro');
    });

    it('não escreve na primeira pessoa do singular', () => {
      const { texto } = gerarTextoFalaBr(pauta());

      expect(texto).not.toMatch(/\beu\b/i);
      expect(texto).toContain('coletivamente');
    });

    it('sai sem nenhum nome quando a pauta não cita ninguém', () => {
      const { anonimato } = gerarTextoFalaBr(pauta(), {
        nomesConhecidos: ['João Gabriel Seixas', 'Sthefany Lima'],
      });

      expect(anonimato.liberado).toBe(true);
      expect(anonimato.achados).toHaveLength(0);
    });
  });

  describe('arrumação do que veio do WhatsApp', () => {
    it('colapsa espaços e linhas em branco sobrando', () => {
      const { texto } = gerarTextoFalaBr(
        pauta({ descricao: 'A   fila   é longa.\n\n\n\nNinguém almoça.   ' }),
      );

      expect(texto).toContain('A fila é longa.\n\nNinguém almoça.');
      expect(texto).not.toMatch(/\n{3}/);
      expect(texto).not.toMatch(/ {2}/);
    });

    it('aceita quebra de linha do Windows', () => {
      const { texto } = gerarTextoFalaBr(pauta({ descricao: 'Primeira.\r\n\r\nSegunda.' }));

      expect(texto).toContain('Primeira.\n\nSegunda.');
      expect(texto).not.toContain('\r');
    });

    it('não começa nem termina com espaço em branco', () => {
      const { texto } = gerarTextoFalaBr(pauta({ titulo: '   Mesas do RU   ' }));

      expect(texto).toBe(texto.trim());
      expect(texto).toContain('Assunto: Mesas do RU');
    });

    it('bloco só com espaço cai no campus inteiro', () => {
      const { texto } = gerarTextoFalaBr(pauta({ bloco: '   ' }));

      expect(texto).toContain('Local: Campus inteiro');
    });
  });

  describe('RN08 · confere o próprio resultado', () => {
    it('barra quando a descrição cita quem o sistema conhece', () => {
      const { anonimato } = gerarTextoFalaBr(
        pauta({ descricao: 'A Sthefany relatou que a fila passa de quarenta minutos.' }),
        { nomesConhecidos: ['Sthefany Lima'] },
      );

      expect(anonimato.liberado).toBe(false);
      expect(anonimato.achados.map((a) => a.motivo)).toContain('nome_conhecido');
    });

    it('barra nome no título também', () => {
      const { anonimato } = gerarTextoFalaBr(pauta({ titulo: 'Pedido de Sthefany Lima' }), {
        nomesConhecidos: ['Sthefany Lima'],
      });

      expect(anonimato.liberado).toBe(false);
    });

    it('barra telefone e e-mail que entraram na descrição', () => {
      const { anonimato } = gerarTextoFalaBr(
        pauta({ descricao: 'Falar com a coordenação: (82) 99999-1234 ou jgss@ic.ufal.br.' }),
      );

      expect(anonimato.liberado).toBe(false);
      expect(anonimato.achados.map((a) => a.motivo)).toEqual(
        expect.arrayContaining(['telefone', 'email']),
      );
    });

    it('devolve o texto mesmo barrado, para o owner ver o que editar', () => {
      const r = gerarTextoFalaBr(pauta({ descricao: 'A Sthefany relatou o caso.' }), {
        nomesConhecidos: ['Sthefany Lima'],
      });

      expect(r.anonimato.liberado).toBe(false);
      expect(r.texto).toContain('Sthefany');
    });

    it('as posições dos achados apontam o trecho certo do texto gerado', () => {
      const r = gerarTextoFalaBr(pauta({ descricao: 'A Sthefany relatou o caso.' }), {
        nomesConhecidos: ['Sthefany Lima'],
      });

      expect(r.anonimato.achados.map((a) => r.texto.slice(a.inicio, a.fim))).toEqual(['Sthefany']);
    });

    it('aviso de possível nome não barra o protocolo', () => {
      const { anonimato } = gerarTextoFalaBr(
        pauta({ descricao: 'A professora Marta confirmou a fila.' }),
      );

      expect(anonimato.liberado).toBe(true);
      expect(anonimato.achados.map((a) => a.severidade)).toEqual(['aviso']);
    });
  });

  describe('o que não dá para protocolar', () => {
    it.each([
      ['título vazio', { titulo: '' }],
      ['título só com espaço', { titulo: '   \n  ' }],
      ['descrição vazia', { descricao: '' }],
      ['categoria vazia', { categoria: ' ' }],
      ['apoios negativo', { apoios: -1 }],
      ['apoios fracionário', { apoios: 1.5 }],
      ['meta zero', { meta: 0 }],
      ['meta negativa', { meta: -300 }],
    ])('rejeita %s', (_caso, mudanca) => {
      expect(() => gerarTextoFalaBr(pauta(mudanca))).toThrow(RangeError);
    });

    it('rejeita mais apoios do que a meta', () => {
      expect(() => gerarTextoFalaBr(pauta({ apoios: 301, meta: 300 }))).toThrow(RangeError);
    });

    it('apoios igual à meta é o caso normal: meta batida', () => {
      const { texto } = gerarTextoFalaBr(pauta({ apoios: 300, meta: 300 }));

      expect(texto).toContain('300');
    });

    it('zero apoio não impede o texto', () => {
      expect(() => gerarTextoFalaBr(pauta({ apoios: 0 }))).not.toThrow();
    });
  });
});
