import { describe, expect, it } from 'vitest';
import { type Achado, conferirAnonimato } from './anonimato';

const EQUIPE = ['João Gabriel Seixas', 'Sthefany Lima', 'Marcos Mendonça'];

const motivos = (achados: Achado[]): string[] => achados.map((a) => a.motivo);
const trechos = (achados: Achado[]): string[] => achados.map((a) => a.trecho);

describe('conferirAnonimato (RN08)', () => {
  it('libera texto que não cita ninguém', () => {
    const texto =
      'Solicitamos a ampliação do número de mesas do Restaurante Universitário do campus A. C. Simões.';

    const v = conferirAnonimato(texto, { nomesConhecidos: EQUIPE });

    expect(v.liberado).toBe(true);
    expect(v.achados).toHaveLength(0);
  });

  describe('nomes que o sistema conhece', () => {
    it('bloqueia o nome inteiro', () => {
      const v = conferirAnonimato('A pauta foi criada por João Gabriel Seixas.', {
        nomesConhecidos: EQUIPE,
      });

      expect(v.liberado).toBe(false);
      expect(trechos(v.achados)).toEqual(['João Gabriel Seixas']);
    });

    it('bloqueia o primeiro nome sozinho', () => {
      const v = conferirAnonimato('A Sthefany relatou o problema.', {
        nomesConhecidos: EQUIPE,
      });

      expect(v.liberado).toBe(false);
      expect(trechos(v.achados)).toEqual(['Sthefany']);
    });

    it('bloqueia o sobrenome sozinho', () => {
      const v = conferirAnonimato('Procurar Mendonça para detalhes.', {
        nomesConhecidos: EQUIPE,
      });

      expect(v.liberado).toBe(false);
      expect(motivos(v.achados)).toEqual(['nome_conhecido']);
    });

    it('acha mesmo sem acento e em caixa alta', () => {
      const v = conferirAnonimato('RELATADO POR MARCOS MENDONCA.', {
        nomesConhecidos: EQUIPE,
      });

      expect(v.liberado).toBe(false);
      expect(trechos(v.achados)).toEqual(['MARCOS MENDONCA']);
    });

    it('reporta o nome inteiro uma vez só, não um achado por pedaço', () => {
      const v = conferirAnonimato('João Gabriel Seixas assina.', {
        nomesConhecidos: EQUIPE,
      });

      expect(v.achados).toHaveLength(1);
    });

    it('as posições apontam o trecho certo do texto original', () => {
      const texto = 'Pedido de ampliação. Sthefany Lima acompanha.';
      const v = conferirAnonimato(texto, { nomesConhecidos: EQUIPE });

      expect(v.achados.map((a) => texto.slice(a.inicio, a.fim))).toEqual(['Sthefany Lima']);
    });

    it('não casa nome dentro de outra palavra', () => {
      // "Lima" está em "Limatambém"; "Ana" em "Banana".
      const v = conferirAnonimato('A limpeza e a banana não têm dono.', {
        nomesConhecidos: ['Ana Lima'],
      });

      expect(v.liberado).toBe(true);
    });

    it('não bloqueia por partícula de nome composto', () => {
      // "de" e "da" sozinhos não identificam ninguém.
      const v = conferirAnonimato('O prazo de resposta da reitoria é de 30 dias.', {
        nomesConhecidos: ['Maria de Souza da Silva'],
      });

      expect(v.liberado).toBe(true);
    });

    it('sem nomes conhecidos, a camada exata não acusa nada', () => {
      const v = conferirAnonimato('A Sthefany relatou o problema.');

      expect(v.liberado).toBe(true);
    });
  });

  describe('dados de contato', () => {
    it.each([
      ['e-mail', 'Contato: jgss@ic.ufal.br para dúvidas.', 'email'],
      ['telefone com DDD', 'Ligar para (82) 99999-1234.', 'telefone'],
      ['telefone com traço', 'Telefone 82 98888-7777 para contato.', 'telefone'],
      ['matrícula', 'Matrícula 20231234567 do solicitante.', 'matricula'],
      // Regressão: com +55 colado no DDD não havia separador nenhum, então o
      // padrão de telefone não pegava — e os 13 dígitos passavam do teto de 12
      // da matrícula. O contato inteiro escapava para o texto público.
      ['telefone com +55 sem separador', 'Ligar +5582999991234.', 'telefone'],
      ['telefone com +55 espaçado', 'Ligar +55 82 99999-1234.', 'telefone'],
    ])('bloqueia %s', (_caso, texto, motivo) => {
      const v = conferirAnonimato(texto);

      expect(v.liberado).toBe(false);
      expect(motivos(v.achados)).toContain(motivo);
    });

    it('sequência longa de dígitos sem formato nenhum também é bloqueada', () => {
      // O vão entre os dois padrões: sem o teto na matrícula, nada com oito ou
      // mais dígitos seguidos passa calado.
      const v = conferirAnonimato('Contato 5582999991234 para falar.');

      expect(v.liberado).toBe(false);
    });

    it('não confunde número comum com telefone', () => {
      const v = conferirAnonimato('Em 2026 foram 300 apoios e 1500 estudantes no bloco.');

      expect(v.liberado).toBe(true);
    });

    it('não acusa prazo nem data', () => {
      const v = conferirAnonimato('Prazo de 30 + 30 dias, contado a partir de 24/10/2026.');

      expect(v.liberado).toBe(true);
    });
  });

  describe('possíveis nomes que o sistema não conhece', () => {
    it('avisa sobre tratamento seguido de nome próprio', () => {
      const v = conferirAnonimato('A professora Marta confirmou o problema.');

      expect(motivos(v.achados)).toEqual(['possivel_nome']);
    });

    it('aviso não impede o envio', () => {
      const v = conferirAnonimato('A professora Marta confirmou o problema.');

      expect(v.liberado).toBe(true);
      expect(v.achados.map((a) => a.severidade)).toEqual(['aviso']);
    });

    it('tratamento antes de nome conhecido continua bloqueando', () => {
      // Regressão: o aviso "professora Sthefany" começa antes e contém o
      // bloqueio do nome conhecido. Enquanto a limpeza olhava os dois juntos,
      // o aviso absorvia o bloqueio e bastava escrever um tratamento antes do
      // nome para um texto barrado virar liberado.
      const v = conferirAnonimato('A professora Sthefany confirmou.', {
        nomesConhecidos: ['Sthefany Lima'],
      });

      expect(v.liberado).toBe(false);
      expect(motivos(v.achados)).toContain('nome_conhecido');
    });

    it('aviso que cruza bloqueio não vira achado separado', () => {
      const v = conferirAnonimato('A professora Sthefany confirmou.', {
        nomesConhecidos: ['Sthefany Lima'],
      });

      expect(trechos(v.achados)).toEqual(['Sthefany']);
    });

    it('não avisa quando o tratamento se refere a um lugar, não a uma pessoa', () => {
      const v = conferirAnonimato('O coordenador do Restaurante Universitário foi procurado.');

      expect(v.achados).toHaveLength(0);
    });

    it('não avisa sobre cargo genérico sem nome', () => {
      const v = conferirAnonimato('Os estudantes e a coordenação pedem mais mesas.');

      expect(v.achados).toHaveLength(0);
    });

    it('não trata "estudante" como tratamento', () => {
      // Apareceria em toda pauta e viraria ruído.
      const v = conferirAnonimato('Os estudantes do Bloco 12 assinam este pedido.');

      expect(v.achados).toHaveLength(0);
    });
  });

  describe('texto real, com mais de um problema', () => {
    const texto = [
      'Prezados, a pauta foi aberta por Sthefany Lima, do Bloco 12.',
      'A professora Marta já havia relatado o caso.',
      'Em caso de dúvida, escrever para jgss@ic.ufal.br ou ligar (82) 99999-1234.',
    ].join(' ');

    it('acha tudo e bloqueia', () => {
      const v = conferirAnonimato(texto, { nomesConhecidos: EQUIPE });

      expect(v.liberado).toBe(false);
      expect(motivos(v.achados)).toEqual(['nome_conhecido', 'possivel_nome', 'email', 'telefone']);
    });

    it('devolve os achados na ordem em que aparecem no texto', () => {
      const v = conferirAnonimato(texto, { nomesConhecidos: EQUIPE });
      const posicoes = v.achados.map((a) => a.inicio);

      expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    });

    it('depois de limpo, o mesmo texto passa', () => {
      const limpo = [
        'Prezados, a pauta foi aberta por estudantes do Bloco 12.',
        'Uma docente já havia relatado o caso.',
        'Em caso de dúvida, responder por este protocolo.',
      ].join(' ');

      expect(conferirAnonimato(limpo, { nomesConhecidos: EQUIPE }).liberado).toBe(true);
    });
  });

  describe('bordas', () => {
    it('texto vazio passa', () => {
      expect(conferirAnonimato('').liberado).toBe(true);
    });

    it('nome conhecido vazio ou só com partícula é ignorado', () => {
      const v = conferirAnonimato('Texto qualquer sobre o campus.', {
        nomesConhecidos: ['', '   ', 'de'],
      });

      expect(v.achados).toHaveLength(0);
    });

    it('nome no comecinho do texto é encontrado', () => {
      const v = conferirAnonimato('Sthefany abriu a pauta.', { nomesConhecidos: EQUIPE });

      expect(v.achados.map((a) => a.inicio)).toEqual([0]);
    });
  });
});
