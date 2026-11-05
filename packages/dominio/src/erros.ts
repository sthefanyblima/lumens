/**
 * Erro de regra do domínio.
 *
 * O padrão do pacote é devolver recusas esperadas como resultado (`{ registrado: false, motivo }`),
 * sem exceção. `ErroDeRegra` fica para o que precisa desfazer a transação de quem chamou: lançado
 * dentro de `db.transaction`, ele faz o rollback de tudo o que a mesma transação já gravou.
 *
 * `codigo` é estável: o bot e o painel traduzem por ele, não pela mensagem.
 */
export type CodigoErroDeRegra =
  | 'evento_desconhecido'
  | 'dados_pessoais_no_evento'
  | 'pauta_inexistente'
  | 'transicao_invalida'
  | 'motivo_obrigatorio';

export class ErroDeRegra extends Error {
  constructor(
    readonly codigo: CodigoErroDeRegra,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDeRegra';
  }
}
