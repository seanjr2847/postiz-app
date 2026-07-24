'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import type { Brand, Tokens } from './video-studio.component';
import { PRESETS, TOKEN_KEYS } from './video-studio.component';

const safeParse = <T,>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const labelClass = 'text-[12px] text-newTextColor/60 mb-[4px]';
const inputClass =
  'bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] h-[36px] text-textColor w-full';

export const BrandEditor: FC<{
  brand: Brand;
  // DTO(CreateBrandDto/UpdateBrandDto)는 tokens/fonts/pillars 를 객체로 받는다
  // (stringify 는 백엔드 repository 몫) — payload 는 Brand 컬럼형(string)과 다르다.
  onSave: (payload: Record<string, any>) => void;
  onDelete: () => void;
}> = ({ brand, onSave, onDelete }) => {
  const [name, setName] = useState(brand.name);
  const [slug, setSlug] = useState(brand.slug);
  const [url, setUrl] = useState(brand.url);
  const [mascotPrefix, setMascotPrefix] = useState(brand.mascotPrefix ?? '');

  const [tokens, setTokens] = useState<Tokens>(() =>
    safeParse<Tokens>(brand.tokens, PRESETS.light)
  );
  const [pillars, setPillars] = useState<string[]>(() =>
    safeParse<string[]>(brand.pillars, [])
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const applyPreset = useCallback((preset: 'light' | 'dark') => {
    // Preset resets all tokens but keeps the current ACCENT choice.
    setTokens((prev) => ({ ...PRESETS[preset], ACCENT: prev.ACCENT }));
  }, []);

  const setToken = useCallback((key: keyof Tokens, value: string) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  }, []);

  const fonts = useMemo(
    () => safeParse(brand.fonts, { family: 'Inter', faces: [] }),
    [brand.fonts]
  );

  const save = useCallback(() => {
    onSave({
      name,
      slug,
      url,
      mascotPrefix: mascotPrefix || null,
      tokens,
      pillars: pillars.filter((p) => p.trim()),
      fonts,
    });
  }, [name, slug, url, mascotPrefix, tokens, pillars, fonts, onSave]);

  return (
    // 모달 안에서만 쓰므로 자체 테두리·패딩은 없앤다 (상자 안 상자 방지).
    <div className="flex flex-col gap-[14px]">
      {/* Basic fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
        <div className="flex flex-col">
          <label className={labelClass}>이름</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className={labelClass}>슬러그</label>
          <input
            className={inputClass}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className={labelClass}>URL</label>
          <input
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className={labelClass}>마스코트 프리픽스</label>
          <input
            className={inputClass}
            value={mascotPrefix}
            onChange={(e) => setMascotPrefix(e.target.value)}
          />
        </div>
      </div>

      {/* Preset + accent */}
      <div className="flex items-center gap-[16px] flex-wrap">
        <div className="flex items-center gap-[8px]">
          <span className={labelClass + ' !mb-0'}>프리셋</span>
          <Button secondary onClick={() => applyPreset('light')}>
            Light
          </Button>
          <Button secondary onClick={() => applyPreset('dark')}>
            Dark
          </Button>
        </div>
        <div className="flex items-center gap-[8px]">
          <span className={labelClass + ' !mb-0'}>포인트 색</span>
          <input
            type="color"
            className="w-[40px] h-[36px] bg-transparent border border-newTableBorder rounded-[6px] cursor-pointer"
            value={tokens.ACCENT}
            onChange={(e) => setToken('ACCENT', e.target.value)}
          />
          <span className="font-mono text-[13px] text-textColor">
            {tokens.ACCENT}
          </span>
        </div>
      </div>

      {/* Pillars */}
      <div className="flex flex-col">
        <label className={labelClass}>콘텐츠 기둥 (쉼표 구분)</label>
        <input
          className={inputClass}
          value={pillars.join(', ')}
          onChange={(e) =>
            setPillars(e.target.value.split(',').map((p) => p.trim()))
          }
        />
      </div>

      {/* Advanced: all 14 tokens */}
      <div>
        <button
          type="button"
          className="text-forth text-[13px] hover:underline"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          {advancedOpen ? '▾' : '▸'} 고급 — 토큰 14개 전체
        </button>
        {advancedOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px] mt-[10px]">
            {TOKEN_KEYS.map((key) => (
              <div key={key} className="flex flex-col">
                <label className={labelClass}>{key}</label>
                <div className="flex items-center gap-[6px]">
                  <input
                    type="color"
                    className="w-[34px] h-[34px] bg-transparent border border-newTableBorder rounded-[6px] cursor-pointer shrink-0"
                    value={tokens[key]}
                    onChange={(e) => setToken(key, e.target.value)}
                  />
                  <input
                    className={inputClass + ' font-mono text-[12px]'}
                    value={tokens[key]}
                    onChange={(e) => setToken(key, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-[13px] text-red-400 hover:underline"
          onClick={onDelete}
        >
          브랜드 삭제
        </button>
        <Button onClick={save}>브랜드 저장</Button>
      </div>
    </div>
  );
};
