import type { ReactNode } from 'react';

const TONES = [
  'bg-[#d2c4ff] text-[#15161b]',
  'bg-[#a6dfc8] text-[#15161b]',
  'bg-[#ffc8a8] text-[#15161b]',
  'bg-[#a9c8ff] text-[#15161b]',
  'bg-[#f4b7d4] text-[#15161b]',
];

/** Colors for the n-th person in a list without photos. */
export const avatarTone = (index: number) => TONES[index % TONES.length]!;

/** Round avatar; each use adds its size, border, font size and colors. */
const ROUND_AVATAR =
  'grid flex-none place-items-center rounded-[50%] font-bold';
const STACKED = `${ROUND_AVATAR} -ml-2 size-[30px] border-2 border-surface text-[12px]`;

/** Overlapping initials on a room card; `extra` counts who is not shown. */
export function AvatarStack(props: {
  label: string;
  initials: string[];
  extra: number;
}) {
  return (
    <span className="flex pl-2" role="img" aria-label={props.label}>
      {props.initials.map((initial, index) => (
        <span key={index} className={`${STACKED} ${avatarTone(index)}`}>
          {initial}
        </span>
      ))}
      {props.extra > 0 && (
        <span className={`${STACKED} bg-[#3a3b4a] text-text`}>
          +{props.extra}
        </span>
      )}
    </span>
  );
}

/** A person in "Online agora": photo or initial, then the name. */
export function OnlineChip(props: {
  photo: string;
  initial: string;
  /** Classes behind the initial: a tone, or a neutral one in the preview. */
  tone: string;
  className?: string;
  as?: 'li' | 'span';
  children: ReactNode;
}) {
  const Chip = props.as ?? 'span';
  return (
    <Chip
      className={`flex items-center gap-2 rounded-full border border-[#2b2c37] bg-surface py-1 pr-3 pl-1 text-[13px] [&_small]:text-[13px] [&_small]:text-kbd ${props.className ?? ''}`}
    >
      <span
        className={`${ROUND_AVATAR} size-[26px] text-[11px] ${props.photo ? 'overflow-hidden bg-raised' : props.tone}`}
        aria-hidden="true"
      >
        {props.photo ? (
          <img
            className="block size-full object-cover"
            src={props.photo}
            alt=""
          />
        ) : (
          props.initial
        )}
      </span>
      {props.children}
    </Chip>
  );
}
