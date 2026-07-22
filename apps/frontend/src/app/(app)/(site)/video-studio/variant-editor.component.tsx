'use client';

import { FC, useCallback, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import type { Variant, VariantFormat } from './video-studio.component';
import { FORMATS } from './video-studio.component';

const safeParse = <T,>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// Default spec shape per format (contract §3 "포맷별 폼").
const DEFAULT_SPEC: Record<VariantFormat, Record<string, any>> = {
  slides: { slides: [''], cta: '' },
  meme: { topText: '', bottomText: '', image: '', cta: '' },
  cards: { cards: [{ image: '', text: '' }], demoSrc: '', cta: '' },
  ugc: { demoSrc: '', reactionSrc: '', cta: '' },
  hookcta: { demoSrc: '', hookClipSrc: '', cta: '' },
};

const labelClass = 'text-[12px] text-newTextColor/60 mb-[4px]';
const inputClass =
  'bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] h-[36px] text-textColor w-full';

// A single text field row.
const Field: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  mediaHint?: boolean;
}> = ({ label, value, onChange, mediaHint }) => (
  <div className="flex flex-col">
    <label className={labelClass}>
      {label}
      {mediaHint ? ' (Postiz Media id / src)' : ''}
    </label>
    <input
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export const VariantEditor: FC<{
  variant: Variant;
  // DTO(UpdateVariantDto)는 spec 객체·hashtags 배열을 받는다(stringify 는 백엔드 몫).
  onSave: (payload: Record<string, any>) => void;
  onRender: () => void;
  onSendToComposer: () => void;
}> = ({ variant, onSave, onRender, onSendToComposer }) => {
  const [format, setFormat] = useState<VariantFormat>(variant.format);
  const [hook, setHook] = useState(variant.hook ?? '');
  const [caption, setCaption] = useState(variant.caption ?? '');
  const [hashtags, setHashtags] = useState<string[]>(() =>
    safeParse<string[]>(variant.hashtags, [])
  );
  const [spec, setSpec] = useState<Record<string, any>>(() =>
    safeParse<Record<string, any>>(variant.spec, DEFAULT_SPEC[variant.format])
  );

  const changeFormat = useCallback((next: VariantFormat) => {
    setFormat(next);
    setSpec(DEFAULT_SPEC[next]);
  }, []);

  const setSpecField = useCallback((key: string, value: any) => {
    setSpec((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(() => {
    onSave({
      format,
      hook: hook || null,
      caption: caption || null,
      hashtags: hashtags.filter((h) => h.trim()),
      spec,
    });
  }, [format, hook, caption, hashtags, spec, onSave]);

  return (
    <div className="border border-newTableBorder rounded-[8px] p-[16px] flex flex-col gap-[14px]">
      <div className="flex items-center justify-between">
        <span className="text-textColor font-[600]">
          변형 편집 — {variant.id}
        </span>
        <span className="text-[12px] text-newTextColor/60">
          상태: {variant.status}
        </span>
      </div>

      {/* format + hook */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
        <div className="flex flex-col">
          <label className={labelClass}>포맷</label>
          <select
            className={inputClass}
            value={format}
            onChange={(e) => changeFormat(e.target.value as VariantFormat)}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <Field label="훅 (hook)" value={hook} onChange={setHook} />
      </div>

      {/* per-format spec fields */}
      <div className="flex flex-col gap-[12px] border-t border-newTableBorder pt-[12px]">
        {format === 'slides' && (
          <SlidesForm spec={spec} setSpecField={setSpecField} />
        )}
        {format === 'meme' && (
          <>
            <Field
              label="topText"
              value={spec.topText ?? ''}
              onChange={(v) => setSpecField('topText', v)}
            />
            <Field
              label="bottomText"
              value={spec.bottomText ?? ''}
              onChange={(v) => setSpecField('bottomText', v)}
            />
            <Field
              label="image"
              mediaHint
              value={spec.image ?? ''}
              onChange={(v) => setSpecField('image', v)}
            />
            <Field
              label="cta"
              value={spec.cta ?? ''}
              onChange={(v) => setSpecField('cta', v)}
            />
          </>
        )}
        {format === 'cards' && (
          <CardsForm spec={spec} setSpecField={setSpecField} />
        )}
        {(format === 'ugc' || format === 'hookcta') && (
          <>
            <Field
              label="demoSrc"
              mediaHint
              value={spec.demoSrc ?? ''}
              onChange={(v) => setSpecField('demoSrc', v)}
            />
            {format === 'ugc' && (
              <Field
                label="reactionSrc (선택)"
                mediaHint
                value={spec.reactionSrc ?? ''}
                onChange={(v) => setSpecField('reactionSrc', v)}
              />
            )}
            {format === 'hookcta' && (
              <Field
                label="hookClipSrc (선택)"
                mediaHint
                value={spec.hookClipSrc ?? ''}
                onChange={(v) => setSpecField('hookClipSrc', v)}
              />
            )}
            <Field
              label="cta"
              value={spec.cta ?? ''}
              onChange={(v) => setSpecField('cta', v)}
            />
          </>
        )}
      </div>

      {/* caption + hashtags */}
      <div className="flex flex-col gap-[12px] border-t border-newTableBorder pt-[12px]">
        <div className="flex flex-col">
          <label className={labelClass}>캡션</label>
          <textarea
            className="bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] py-[8px] text-textColor w-full min-h-[70px]"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className={labelClass}>해시태그 (띄어쓰기 구분)</label>
          <input
            className={inputClass}
            value={hashtags.join(' ')}
            onChange={(e) =>
              setHashtags(
                e.target.value.split(/\s+/).filter((h) => h.length > 0)
              )
            }
          />
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-[10px] justify-end border-t border-newTableBorder pt-[12px]">
        <Button secondary onClick={save}>
          저장
        </Button>
        <Button onClick={onRender}>렌더</Button>
        <Button
          disabled={!variant.mediaId}
          onClick={onSendToComposer}
        >
          컴포저로 보내기
        </Button>
      </div>

      {variant.mediaId && (
        <div className="text-[12px] text-newTextColor/60">
          렌더된 mediaId: <span className="font-mono">{variant.mediaId}</span>
          {/* TODO(preview): show thumbnail from the rendered Media once the
              render contract returns a url (contract §3 "완료 시 썸네일"). */}
        </div>
      )}
    </div>
  );
};

// --- slides: string[] + cta ------------------------------------------------
const SlidesForm: FC<{
  spec: Record<string, any>;
  setSpecField: (key: string, value: any) => void;
}> = ({ spec, setSpecField }) => {
  const slides: string[] = spec.slides ?? [''];
  const update = (i: number, value: string) => {
    const next = slides.slice();
    next[i] = value;
    setSpecField('slides', next);
  };
  return (
    <>
      <label className={labelClass}>슬라이드</label>
      {slides.map((line, i) => (
        <div key={i} className="flex items-center gap-[8px]">
          <input
            className={inputClass}
            value={line}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`${i + 1}번째 줄`}
          />
          <button
            type="button"
            className="text-forth px-[8px] disabled:opacity-40"
            disabled={slides.length <= 1}
            onClick={() =>
              setSpecField(
                'slides',
                slides.filter((_, idx) => idx !== i)
              )
            }
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-forth text-[13px] hover:underline self-start"
        onClick={() => setSpecField('slides', [...slides, ''])}
      >
        + 슬라이드 추가
      </button>
      <Field
        label="cta"
        value={spec.cta ?? ''}
        onChange={(v) => setSpecField('cta', v)}
      />
    </>
  );
};

// --- cards: cards[] (image+text) + demoSrc + cta ---------------------------
const CardsForm: FC<{
  spec: Record<string, any>;
  setSpecField: (key: string, value: any) => void;
}> = ({ spec, setSpecField }) => {
  const cards: { image: string; text: string }[] = spec.cards ?? [
    { image: '', text: '' },
  ];
  const update = (i: number, patch: Partial<{ image: string; text: string }>) => {
    const next = cards.slice();
    next[i] = { ...next[i], ...patch };
    setSpecField('cards', next);
  };
  return (
    <>
      <label className={labelClass}>카드</label>
      {cards.map((card, i) => (
        <div
          key={i}
          className="flex items-center gap-[8px] border border-newTableBorder rounded-[6px] p-[8px]"
        >
          <input
            className={inputClass}
            value={card.image}
            onChange={(e) => update(i, { image: e.target.value })}
            placeholder="이미지 (Media id / src)"
          />
          <input
            className={inputClass}
            value={card.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="텍스트"
          />
          <button
            type="button"
            className="text-forth px-[8px] disabled:opacity-40"
            disabled={cards.length <= 1}
            onClick={() =>
              setSpecField(
                'cards',
                cards.filter((_, idx) => idx !== i)
              )
            }
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-forth text-[13px] hover:underline self-start"
        onClick={() =>
          setSpecField('cards', [...cards, { image: '', text: '' }])
        }
      >
        + 카드 추가
      </button>
      <Field
        label="demoSrc"
        mediaHint
        value={spec.demoSrc ?? ''}
        onChange={(v) => setSpecField('demoSrc', v)}
      />
      <Field
        label="cta"
        value={spec.cta ?? ''}
        onChange={(v) => setSpecField('cta', v)}
      />
    </>
  );
};
