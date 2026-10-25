export type ChangeKind = 'novo' | 'melhoria' | 'correção';

export interface ChangelogEntry {
  version: string;
  date: string;
  items: { kind: ChangeKind; text: string }[];
}

/** Notes shown in "Novidades do Discorja", newest first. Add one per release. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.10.0',
    date: '2026-10-25',
    items: [
      {
        kind: 'novo',
        text: 'Grupos: crie um grupo para a turma, mande o convite e veja as salas abertas por quem está nele.',
      },
      {
        kind: 'novo',
        text: 'Novo Início: as salas ficam dentro dos grupos e você entra com um clique, sem digitar código.',
      },
      {
        kind: 'novo',
        text: 'Lateral com a logo, os seus grupos e a sua foto, que abre "Editar perfil" e "Configurações".',
      },
      {
        kind: 'novo',
        text: '"Online agora" mostra quem está no grupo, inclusive quem já está em uma sala.',
      },
      {
        kind: 'novo',
        text: 'Fotos de perfil em GIF animado e botão "Procurar GIFs no GIPHY".',
      },
      {
        kind: 'novo',
        text: 'Novidades do Discorja: veja o que mudou a cada atualização.',
      },
      {
        kind: 'melhoria',
        text: 'Clique com o botão direito em um campo para colar o que você copiou.',
      },
      {
        kind: 'melhoria',
        text: 'Aviso "Acordando o servidor…" quando o servidor gratuito estava dormindo, com mais tempo para conectar.',
      },
      {
        kind: 'melhoria',
        text: 'Transmissões continuam durante quedas curtas da conexão com o servidor.',
      },
      {
        kind: 'melhoria',
        text: 'Fotos de perfil com mais qualidade nas salas novas.',
      },
      {
        kind: 'melhoria',
        text: 'Entrar e criar salas por código saiu do aplicativo: use o convite do grupo.',
      },
      {
        kind: 'correção',
        text: '"Cancelar" no perfil agora descarta as alterações.',
      },
      {
        kind: 'correção',
        text: 'A câmera do perfil não desliga mais sozinha.',
      },
      {
        kind: 'correção',
        text: 'Foco e teclado corrigidos no aviso de atualização e na foto ampliada.',
      },
      {
        kind: 'correção',
        text: 'Fonte do aplicativo instalado e encerramento do áudio filtrado.',
      },
    ],
  },
  {
    version: '0.9.12',
    date: '2026-10-20',
    items: [
      {
        kind: 'novo',
        text: 'Códigos de sala personalizados e botão para usar o último código.',
      },
      {
        kind: 'novo',
        text: 'Controles de janela para minimizar, maximizar e fechar.',
      },
      {
        kind: 'melhoria',
        text: 'Validação do código da sala e mensagens de conexão mais claras.',
      },
    ],
  },
];
