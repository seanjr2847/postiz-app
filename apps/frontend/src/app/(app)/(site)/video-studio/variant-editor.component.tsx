'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { showMediaBox } from '@gitroom/frontend/components/media/media.component';
import type { Variant, VariantFormat } from './video-studio.component';
import { STATUS_CHIP } from './video-studio.component';
import { FormatPicker, FormatDiagram } from './format-diagram.component';

// cta 는 렌더 계약(v2)상 { text } 객체 — 편집기는 text 만 다루고 저장 시 객체로 감싼다.
const ctaText = (c: any): string => (typeof c === 'string' ? c : c?.text ?? '');

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
  slides: { slides: [''], cta: { text: '' } },
  meme: { topText: '', bottomText: '', image: '', cta: { text: '' } },
  cards: { cards: [{ image: '', text: '' }], demoSrc: '', cta: { text: '' } },
  ugc: { demoSrc: '', reactionSrc: '', cta: { text: '' } },
  hookcta: { demoSrc: '', hookClipSrc: '', cta: { text: '' } },
};

const labelClass = 'text-[12px] text-newTextColor/60 mb-[4px]';
const inputClass =
  'bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] h-[36px] text-textColor w-full';

// A single text field row.
const Field: FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, hint, value, onChange }) => (
  <div className="flex flex-col">
    <label className={labelClass}>{label}</label>
    <input
      className={inputClass}
      value={value}
      placeholder={hint}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

// 미디어 필드 — 손으로 URL 을 붙여넣는 대신 미디어 라이브러리에서 고른다.
// (레지스트리 임포트가 넣어둔 값도 있으므로 직접 입력은 계속 열어둔다.)
const MediaField: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex flex-col">
    <label className={labelClass}>{label}</label>
    <div className="flex items-center gap-[8px]">
      <input
        className={inputClass}
        value={value}
        placeholder="라이브러리에서 고르거나 URL 을 붙여넣으세요"
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        secondary
        onClick={() =>
          // showMediaBox 의 선언 타입은 단일 객체지만 실제로는 배열이 온다.
          showMediaBox((picked: any) => {
            const media = Array.isArray(picked) ? picked[0] : picked;
            if (media?.path) onChange(media.path);
          })
        }
      >
        라이브러리
      </Button>
    </div>
  </div>
);

export const VariantEditor: FC<{
  variant: Variant;
  // DTO(UpdateVariantDto)는 spec 객체·hashtags 배열을 받는다(stringify 는 백엔드 몫).
  onSave: (payload: Record<string, any>) => void | Promise<void>;
  onRender: () => void | Promise<void>;
  onSendToComposer: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: () => void;
}> = ({
  variant,
  onSave,
  onRender,
  onSendToComposer,
  onDirtyChange,
  onDelete,
}) => {
  const [format, setFormat] = useState<VariantFormat>(variant.format);
  const [hook, setHook] = useState(variant.hook ?? '');
  const [caption, setCaption] = useState(variant.caption ?? '');
  const [hashtags, setHashtags] = useState<string[]>(() =>
    safeParse<string[]>(variant.hashtags, [])
  );
  const [spec, setSpec] = useState<Record<string, any>>(() =>
    safeParse<Record<string, any>>(variant.spec, DEFAULT_SPEC[variant.format])
  );
  const [busy, setBusy] = useState(false);

  // 저장 안 한 변경 감지 — 부모가 다른 행으로 이동할 때 경고를 띄운다.
  // key={variant.id} 로 리마운트되므로 첫 렌더의 스냅샷이 곧 원본이다.
  const snapshot = JSON.stringify({ format, hook, caption, hashtags, spec });
  const savedRef = useRef(snapshot);
  const dirty = snapshot !== savedRef.current;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // 포맷을 바꿔도 CTA 는 포맷 공통이라 유지한다 — 예전엔 조용히 사라졌다.
  // (훅·캡션·해시태그는 spec 밖 별도 상태라 원래 안 지워진다.)
  const changeFormat = useCallback((next: VariantFormat) => {
    setFormat(next);
    setSpec((prev) => ({
      ...DEFAULT_SPEC[next],
      ...(prev?.cta ? { cta: prev.cta } : {}),
    }));
  }, []);

  const setSpecField = useCallback((key: string, value: any) => {
    setSpec((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    await onSave({
      format,
      hook: hook || null,
      caption: caption || null,
      hashtags: hashtags.filter((h) => h.trim()),
      spec,
    });
    savedRef.current = snapshot;
  }, [format, hook, caption, hashtags, spec, snapshot, onSave]);

  // 렌더·게시는 저장된 내용을 쓴다 — 편집 중이면 먼저 저장해서
  // "고쳤는데 왜 그대로지?" 를 없앤다.
  const saveThen = useCallback(
    async (action: () => void | Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        if (dirty) await save();
        await action();
      } finally {
        setBusy(false);
      }
    },
    [busy, dirty, save]
  );

  // status 는 DB 에서 오는 문자열이라 목록 행과 같은 폴백을 둔다.
  const chip = STATUS_CHIP[variant.status] ?? {
    label: variant.status,
    cls: 'text-gray-300 bg-gray-500/20',
  };

  // 편집 → 렌더 → 게시 순서. 지금 어디인지로 강조할 버튼과 안내를 정한다.
  const step = dirty ? 'save' : !variant.mediaId ? 'render' : 'publish';
  const hint =
    step === 'save'
      ? '내용을 바꿨습니다 — 「저장 후 렌더」를 누르면 저장과 렌더를 한 번에 합니다.'
      : step === 'render'
      ? '아직 영상이 없습니다 — 렌더하면 1분쯤 뒤에 영상이 만들어집니다.'
      : variant.status === 'draft' || variant.status === 'rendered'
      ? '영상이 준비됐습니다 — 컴포저로 보내 채널과 시간을 정하세요.'
      : '이미 컴포저로 보냈습니다. 내용을 고치면 다시 렌더해야 반영됩니다.';

  return (
    <div className="border border-newTableBorder rounded-[8px] p-[16px] flex flex-col gap-[14px]">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-textColor font-[600] truncate">
          {hook || '(제목 없음)'}
        </span>
        <div className="flex items-center gap-[8px] shrink-0">
          {dirty && (
            <span className="text-[12px] text-orange-300">• 저장 안 함</span>
          )}
          <span
            className={`px-[8px] py-[2px] rounded-full text-[12px] ${chip.cls}`}
          >
            {chip.label}
          </span>
          <button
            type="button"
            className="text-[12px] text-red-400 hover:underline"
            onClick={onDelete}
          >
            삭제
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-[16px]">
        <div className="flex-1 min-w-0 flex flex-col gap-[14px]">
          {/* 포맷 — 이름 드롭다운 대신 그림 카드로 고른다(고르는 순간 결과가 보이게) */}
          <div className="flex flex-col gap-[6px]">
            <label className={labelClass}>포맷 — 어떤 영상을 만들지</label>
            <FormatPicker value={format} onChange={changeFormat} />
          </div>

          <Field
            label="훅 — 첫 화면에 크게 뜨는 한 줄"
            value={hook}
            onChange={setHook}
          />

          {/* per-format spec fields */}
          <div className="flex flex-col gap-[12px] border-t border-newTableBorder pt-[12px]">
            {format === 'slides' && (
              <SlidesForm spec={spec} setSpecField={setSpecField} />
            )}
            {format === 'meme' && (
              <>
                <Field
                  label="위 문구"
                  value={spec.topText ?? ''}
                  onChange={(v) => setSpecField('topText', v)}
                />
                <Field
                  label="아래 문구"
                  value={spec.bottomText ?? ''}
                  onChange={(v) => setSpecField('bottomText', v)}
                />
                <MediaField
                  label="배경 이미지"
                  value={spec.image ?? ''}
                  onChange={(v) => setSpecField('image', v)}
                />
                <Field
                  label="CTA 문구 — 마지막에 띄울 행동 유도"
                  value={ctaText(spec.cta)}
                  onChange={(v) => setSpecField('cta', { text: v })}
                />
              </>
            )}
            {format === 'cards' && (
              <CardsForm spec={spec} setSpecField={setSpecField} />
            )}
            {(format === 'ugc' || format === 'hookcta') && (
              <>
                <MediaField
                  label="데모 영상"
                  value={spec.demoSrc ?? ''}
                  onChange={(v) => setSpecField('demoSrc', v)}
                />
                {format === 'ugc' && (
                  <MediaField
                    label="반응 영상 (선택)"
                    value={spec.reactionSrc ?? ''}
                    onChange={(v) => setSpecField('reactionSrc', v)}
                  />
                )}
                {format === 'hookcta' && (
                  <MediaField
                    label="훅 클립 (선택)"
                    value={spec.hookClipSrc ?? ''}
                    onChange={(v) => setSpecField('hookClipSrc', v)}
                  />
                )}
                <Field
                  label="CTA 문구 — 마지막에 띄울 행동 유도"
                  value={ctaText(spec.cta)}
                  onChange={(v) => setSpecField('cta', { text: v })}
                />
              </>
            )}
          </div>

          {/* caption + hashtags */}
          <div className="flex flex-col gap-[12px] border-t border-newTableBorder pt-[12px]">
            <div className="flex flex-col">
              <label className={labelClass}>
                캡션 — 게시할 때 본문에 들어갑니다
              </label>
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
                placeholder="#마케팅 #숏폼"
                onChange={(e) =>
                  setHashtags(
                    e.target.value.split(/\s+/).filter((h) => h.length > 0)
                  )
                }
              />
            </div>
          </div>
        </div>

        {/* 실시간 레이아웃 미리보기 — 입력하는 대로 무엇이 어디에 들어가는지 보인다.
            실제 영상은 렌더가 만들지만, "뭘 하면 뭐가 나오나" 는 여기서 즉시 답한다. */}
        <aside className="lg:w-[210px] shrink-0">
          <div className="lg:sticky lg:top-[12px] flex flex-col gap-[8px]">
            <div className={labelClass}>미리보기</div>
            <FormatDiagram
              format={format}
              spec={spec}
              hook={hook}
              className="w-[180px]"
            />
            <div className="text-[11px] leading-[1.4] text-newTextColor/50">
              레이아웃 미리보기입니다 — 실제 영상은 아래 「렌더」로 만듭니다.
            </div>
            {variant.media?.path && (
              <div className="flex flex-col gap-[6px] pt-[8px] border-t border-newTableBorder">
                <div className={labelClass}>렌더 결과</div>
                <video
                  controls
                  preload="metadata"
                  className="w-[180px] rounded-[8px] border border-newTableBorder"
                  src={variant.media.path}
                />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* actions — 저장·렌더·게시가 같은 굵기로 나란히 있어서 어느 걸 먼저
          눌러야 하는지 알 수 없었다. 지금 할 일 하나만 강조한다. */}
      <div className="flex flex-col gap-[10px] border-t border-newTableBorder pt-[12px]">
        <div className="text-[12px] text-newTextColor/60">{hint}</div>
        <div className="flex items-center gap-[10px] justify-end">
          <Button
            secondary={step !== 'save'}
            disabled={!dirty || busy}
            onClick={save}
          >
            저장
          </Button>
          <Button
            secondary={step !== 'render'}
            disabled={busy}
            onClick={() => saveThen(onRender)}
          >
            {busy ? '처리 중…' : dirty ? '저장 후 렌더' : '렌더'}
          </Button>
          <Button
            secondary={step !== 'publish'}
            disabled={!variant.mediaId || busy}
            onClick={() => saveThen(onSendToComposer)}
          >
            컴포저로 보내기
          </Button>
        </div>
      </div>
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
      <label className={labelClass}>슬라이드 — 한 줄에 한 화면씩</label>
      {slides.map((line, i) => (
        <div key={i} className="flex items-center gap-[8px]">
          <input
            className={inputClass}
            value={line}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`${i + 1}번째 화면`}
          />
          <button
            type="button"
            className="text-forth px-[8px] disabled:opacity-40"
            disabled={slides.length <= 1}
            title="이 슬라이드 삭제"
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
        label="CTA 문구 — 마지막에 띄울 행동 유도"
        value={ctaText(spec.cta)}
        onChange={(v) => setSpecField('cta', { text: v })}
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
  const update = (
    i: number,
    patch: Partial<{ image: string; text: string }>
  ) => {
    const next = cards.slice();
    next[i] = { ...next[i], ...patch };
    setSpecField('cards', next);
  };
  return (
    <>
      <label className={labelClass}>카드 — 이미지 + 문구 한 쌍이 한 화면</label>
      {cards.map((card, i) => (
        <div
          key={i}
          className="flex items-start gap-[8px] border border-newTableBorder rounded-[6px] p-[8px]"
        >
          <div className="flex-1 flex flex-col gap-[8px]">
            <MediaField
              label={`${i + 1}번째 카드 이미지`}
              value={card.image}
              onChange={(v) => update(i, { image: v })}
            />
            <Field
              label={`${i + 1}번째 카드 문구`}
              value={card.text}
              onChange={(v) => update(i, { text: v })}
            />
          </div>
          <button
            type="button"
            className="text-forth px-[8px] pt-[20px] disabled:opacity-40"
            disabled={cards.length <= 1}
            title="이 카드 삭제"
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
      <MediaField
        label="데모 영상"
        value={spec.demoSrc ?? ''}
        onChange={(v) => setSpecField('demoSrc', v)}
      />
      <Field
        label="CTA 문구 — 마지막에 띄울 행동 유도"
        value={ctaText(spec.cta)}
        onChange={(v) => setSpecField('cta', { text: v })}
      />
    </>
  );
};
