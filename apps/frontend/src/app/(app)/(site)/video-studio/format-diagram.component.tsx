'use client';

import { FC } from 'react';
import type { VariantFormat } from './video-studio.component';
import { FORMATS, FORMAT_LABELS } from './video-studio.component';

// 각 포맷이 "무엇을 만드는지" 한 줄로 — 이름만으론 결과가 안 그려져서 붙인다.
export const FORMAT_BLURB: Record<VariantFormat, string> = {
  slides: '텍스트 화면을 한 장씩 넘기는 영상',
  cards: '이미지+문구 카드를 넘기고 데모를 붙인 영상',
  meme: '짤 이미지에 위/아래 문구를 얹은 영상',
  ugc: '데모 영상 위에 반응 영상을 얹은 리액션 영상',
  hookcta: '짧은 훅 클립 뒤에 데모와 CTA를 붙인 영상',
};

// 포맷 선택 카드에 채워 보여줄 예시 — 빈 칸이면 무엇이 들어가는지 안 보인다.
export const EXAMPLE_SPEC: Record<VariantFormat, Record<string, any>> = {
  slides: { slides: ['이런 실수 하고 있나요?', '이렇게 바꿔보세요', '결과는?'], cta: { text: '팔로우하고 더 보기' } },
  cards: { cards: [{ text: '전' }, { text: '후' }], demoSrc: 'demo', cta: { text: '지금 시작' } },
  meme: { topText: '월요일의 나', bottomText: '금요일의 나', image: 'img', cta: { text: '공감하면 팔로우' } },
  ugc: { demoSrc: 'demo', reactionSrc: 'reaction', cta: { text: '더 알아보기' } },
  hookcta: { demoSrc: 'demo', hookClipSrc: 'hook', cta: { text: '링크는 프로필에' } },
};

const ctaLabel = (spec: Record<string, any>): string => {
  const c = spec?.cta;
  return (typeof c === 'string' ? c : c?.text) || 'CTA';
};

// 프레임 안의 조각들 — 실제 값이 있으면 글자를, 없으면 회색 바를 보여준다.
const Line: FC<{ text?: string; accent?: boolean; strong?: boolean }> = ({
  text,
  accent,
  strong,
}) =>
  text ? (
    <div
      className={`truncate text-[7px] leading-[1.3] px-[3px] py-[2px] rounded-[2px] ${
        accent
          ? 'bg-forth/25 text-forth'
          : strong
          ? 'bg-newBgColor text-textColor font-[600]'
          : 'bg-newBgColor text-newTextColor/70'
      }`}
    >
      {text}
    </div>
  ) : (
    <div
      className={`h-[6px] rounded-[2px] ${accent ? 'bg-forth/40' : 'bg-newTextColor/20'}`}
    />
  );

const Box: FC<{ label?: string; grow?: boolean }> = ({ label, grow }) => (
  <div
    className={`rounded-[3px] border border-dashed border-newTextColor/30 bg-newTextColor/5 flex items-center justify-center text-[6px] text-newTextColor/50 ${
      grow ? 'flex-1' : 'h-[26px]'
    }`}
  >
    {label ?? '미디어'}
  </div>
);

// 9:16 프레임 안에 포맷별 레이아웃 골격을 그린다. spec/hook 을 넘기면 그 값으로,
// 안 넘기면 예시로 채워진다. 실제 렌더 결과가 아니라 "무엇이 어디에 들어가는지" 지도.
export const FormatDiagram: FC<{
  format: VariantFormat;
  spec?: Record<string, any>;
  hook?: string;
  className?: string;
}> = ({ format, spec, hook, className }) => {
  const s = spec ?? EXAMPLE_SPEC[format];
  const inner = (() => {
    switch (format) {
      case 'slides': {
        const slides: string[] = (s.slides ?? []).filter((x: string) => x?.trim());
        return (
          <>
            <Line text={hook} strong />
            {(slides.length ? slides : ['']).slice(0, 3).map((t, i) => (
              <Line key={i} text={t} />
            ))}
            {slides.length > 3 && (
              <div className="text-[6px] text-newTextColor/40">
                +{slides.length - 3}장
              </div>
            )}
            <div className="flex-1" />
            <Line text={ctaLabel(s)} accent />
          </>
        );
      }
      case 'cards': {
        const cards: any[] = s.cards ?? [];
        return (
          <>
            <Line text={hook} strong />
            {(cards.length ? cards : [{}]).slice(0, 2).map((c, i) => (
              <div key={i} className="flex gap-[3px] items-center">
                <div className="w-[16px] h-[16px] shrink-0 rounded-[2px] border border-dashed border-newTextColor/30 bg-newTextColor/5" />
                <Line text={c?.text} />
              </div>
            ))}
            <Box label="데모" />
            <div className="flex-1" />
            <Line text={ctaLabel(s)} accent />
          </>
        );
      }
      case 'meme':
        return (
          <>
            <Line text={s.topText} strong />
            <Box label="짤 이미지" grow />
            <Line text={s.bottomText} strong />
            <Line text={ctaLabel(s)} accent />
          </>
        );
      case 'ugc':
        return (
          <>
            <Line text={hook} strong />
            <div className="relative flex-1">
              <Box label="데모 영상" grow />
              <div className="absolute bottom-[3px] right-[3px] w-[26px] h-[20px] rounded-[2px] border border-newTableBorder bg-newBgColor flex items-center justify-center text-[6px] text-newTextColor/60">
                반응
              </div>
            </div>
            <Line text={ctaLabel(s)} accent />
          </>
        );
      case 'hookcta':
        return (
          <>
            <Box label="훅 클립" />
            <Box label="데모 영상" grow />
            <Line text={ctaLabel(s)} accent />
          </>
        );
    }
  })();

  return (
    <div
      className={`aspect-[9/16] rounded-[5px] border border-newTableBorder bg-newBgColorInner p-[5px] flex flex-col gap-[3px] overflow-hidden ${
        className ?? ''
      }`}
    >
      {inner}
    </div>
  );
};

// 포맷 선택 — 드롭다운 대신 각 포맷을 그림+한 줄 설명 카드로 고른다.
export const FormatPicker: FC<{
  value: VariantFormat;
  onChange: (f: VariantFormat) => void;
}> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[8px]">
    {FORMATS.map((f) => {
      const active = f === value;
      return (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`text-start rounded-[8px] border p-[8px] flex flex-col gap-[6px] transition-colors ${
            active
              ? 'border-forth bg-forth/10'
              : 'border-newTableBorder hover:bg-newBgColor'
          }`}
        >
          <FormatDiagram format={f} className="w-full max-w-[84px] mx-auto" />
          <div className="flex flex-col gap-[2px]">
            <span
              className={`text-[13px] font-[600] ${
                active ? 'text-forth' : 'text-textColor'
              }`}
            >
              {FORMAT_LABELS[f]}
            </span>
            <span className="text-[11px] leading-[1.3] text-newTextColor/60">
              {FORMAT_BLURB[f]}
            </span>
          </div>
        </button>
      );
    })}
  </div>
);
