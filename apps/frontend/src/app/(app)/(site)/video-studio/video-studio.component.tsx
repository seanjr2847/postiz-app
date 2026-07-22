'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { BrandEditor } from './brand-editor.component';
import { VariantEditor } from './variant-editor.component';

// ---------------------------------------------------------------------------
// Shared types (mirrors backend MarketingBrand / MarketingVariant, contract §1)
// JSON columns (tokens / fonts / pillars / spec / hashtags) arrive as strings.
// ---------------------------------------------------------------------------
export type VariantFormat = 'slides' | 'cards' | 'meme' | 'ugc' | 'hookcta';
export type VariantStatus = 'draft' | 'rendered' | 'scheduled' | 'published';

export interface Brand {
  id: string;
  slug: string;
  name: string;
  url: string;
  tokens: string; // JSON: Record<TokenKey, string>
  fonts: string; // JSON: { family, faces }
  mascotPrefix?: string | null;
  pillars: string; // JSON: string[]
}

export interface Variant {
  id: string;
  brandId: string;
  format: VariantFormat;
  status: VariantStatus;
  hook?: string | null;
  spec: string; // JSON: format-specific fields
  caption?: string | null;
  hashtags: string; // JSON: string[]
  mediaId?: string | null;
  postId?: string | null;
  media?: { id: string; path: string } | null; // 백엔드가 mediaId 로 수동 조인
}

// The 14 brand tokens (order = editor layout). Names shared across all brands.
export const TOKEN_KEYS = [
  'PAPER',
  'PAPER_2',
  'CREAM',
  'CREAM_DEEP',
  'INK',
  'INK_SOFT',
  'INK_MUTE',
  'LINE',
  'ACCENT',
  'ACCENT_INK',
  'MARKER',
  'GOOD',
  'WARN',
  'ALERT',
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type Tokens = Record<TokenKey, string>;

// Light preset = noti brand parity. Dark preset = derived defaults.
export const PRESETS: Record<'light' | 'dark', Tokens> = {
  light: {
    PAPER: '#fbf7ee',
    PAPER_2: '#fffdf7',
    CREAM: '#f1ead9',
    CREAM_DEEP: '#e6dcc4',
    INK: '#231e18',
    INK_SOFT: '#4a4035',
    INK_MUTE: '#736654',
    LINE: '#e3d9c4',
    ACCENT: '#c2724a',
    ACCENT_INK: '#8e4e2d',
    MARKER: '#f4d9a8',
    GOOD: '#6b8e4e',
    WARN: '#c9985a',
    ALERT: '#b85042',
  },
  dark: {
    PAPER: '#1a1712',
    PAPER_2: '#221d16',
    CREAM: '#2a2318',
    CREAM_DEEP: '#332a1c',
    INK: '#f5efe2',
    INK_SOFT: '#d8cfbd',
    INK_MUTE: '#a89a82',
    LINE: '#3a3226',
    ACCENT: '#d98a5c',
    ACCENT_INK: '#f0b088',
    MARKER: '#5a4a2c',
    GOOD: '#8fb56a',
    WARN: '#d9a866',
    ALERT: '#d16558',
  },
};

export const FORMATS: VariantFormat[] = [
  'slides',
  'cards',
  'meme',
  'ugc',
  'hookcta',
];

// ---------------------------------------------------------------------------
// SWR hooks — one hook per resource (project rule: rules-of-hooks compliant).
// ---------------------------------------------------------------------------
const useBrands = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/video-studio/brands')).json();
  }, [fetch]);
  return useSWR<Brand[]>('video-studio-brands', load);
};

const useVariants = (brandId: string | null) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (
      await fetch(`/video-studio/variants?brandId=${brandId}`)
    ).json();
  }, [fetch, brandId]);
  return useSWR<Variant[]>(
    brandId ? `video-studio-variants-${brandId}` : null,
    load
  );
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
const STATUS_DOT: Record<VariantStatus, string> = {
  draft: 'text-gray-400',
  rendered: 'text-green-500',
  scheduled: 'text-blue-400',
  published: 'text-purple-400',
};

const VariantRow: FC<{
  variant: Variant;
  selected: boolean;
  onEdit: () => void;
  onRender: () => void;
  onSend: () => void;
}> = ({ variant, selected, onEdit, onRender, onSend }) => {
  return (
    <div
      className={`flex items-center gap-[10px] px-[12px] py-[10px] border-b border-newTableBorder text-[14px] ${
        selected ? 'bg-newBgColorInner' : ''
      }`}
    >
      <div className="flex-1 truncate font-mono text-textColor">
        {variant.id}
      </div>
      <div className="w-[90px] text-textColor">{variant.format}</div>
      <div className="w-[110px] flex items-center gap-[6px]">
        <span className={STATUS_DOT[variant.status]}>●</span>
        <span className="text-textColor">{variant.status}</span>
      </div>
      <div className="flex gap-[8px]">
        <button
          type="button"
          className="text-forth hover:underline"
          onClick={onEdit}
        >
          수정
        </button>
        <button
          type="button"
          className="text-forth hover:underline"
          onClick={onRender}
        >
          렌더
        </button>
        <button
          type="button"
          className="text-forth hover:underline disabled:opacity-40 disabled:no-underline"
          disabled={!variant.mediaId}
          onClick={onSend}
          title={
            variant.mediaId ? '컴포저로 보내기' : '렌더 먼저 필요'
          }
        >
          컴포저로 보내기
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const VideoStudioComponent: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();

  const { data: brands, mutate: mutateBrands, isLoading: brandsLoading } =
    useBrands();

  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );

  const activeBrandId = useMemo(() => {
    if (selectedBrandId) return selectedBrandId;
    return brands?.[0]?.id ?? null;
  }, [selectedBrandId, brands]);

  const activeBrand = useMemo(
    () => brands?.find((b) => b.id === activeBrandId) ?? null,
    [brands, activeBrandId]
  );

  const { data: variants, mutate: mutateVariants } = useVariants(activeBrandId);

  const activeVariant = useMemo(
    () => variants?.find((v) => v.id === selectedVariantId) ?? null,
    [variants, selectedVariantId]
  );

  // --- brand actions ---
  const createBrand = useCallback(async () => {
    // DTO 는 tokens/fonts/pillars 를 객체로 검증한다 — stringify 는 백엔드 repository 몫.
    const res = await fetch('/video-studio/brands', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'new-brand',
        name: '새 브랜드',
        url: 'https://example.com',
        tokens: PRESETS.light,
        fonts: { family: 'Inter', faces: [] },
        pillars: [],
      }),
    });
    if (!res.ok) {
      toaster.show('브랜드 생성 실패 — 입력값을 확인하세요', 'warning');
      return;
    }
    const created: Brand = await res.json();
    await mutateBrands();
    if (created?.id) {
      setSelectedBrandId(created.id);
    }
    toaster.show('브랜드 생성됨', 'success');
  }, [fetch, mutateBrands, toaster]);

  const saveBrand = useCallback(
    async (payload: Record<string, any>) => {
      if (!activeBrandId) return;
      const res = await fetch(`/video-studio/brands/${activeBrandId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toaster.show('브랜드 저장 실패 — 입력값을 확인하세요', 'warning');
        return;
      }
      await mutateBrands();
      toaster.show('브랜드 저장됨', 'success');
    },
    [fetch, activeBrandId, mutateBrands, toaster]
  );

  // --- variant actions ---
  const createVariant = useCallback(async () => {
    if (!activeBrandId) return;
    const res = await fetch('/video-studio/variants', {
      method: 'POST',
      body: JSON.stringify({
        brandId: activeBrandId,
        format: 'slides',
        status: 'draft',
        hook: '',
        spec: { slides: [''], cta: '' },
        caption: '',
        hashtags: [],
      }),
    });
    if (!res.ok) {
      toaster.show('변형 생성 실패 — 입력값을 확인하세요', 'warning');
      return;
    }
    const created: Variant = await res.json();
    await mutateVariants();
    if (created?.id) {
      setSelectedVariantId(created.id);
    }
  }, [fetch, activeBrandId, mutateVariants, toaster]);

  const saveVariant = useCallback(
    async (payload: Record<string, any>) => {
      if (!selectedVariantId) return;
      const res = await fetch(`/video-studio/variants/${selectedVariantId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toaster.show('변형 저장 실패 — 입력값을 확인하세요', 'warning');
        return;
      }
      await mutateVariants();
      toaster.show('변형 저장됨', 'success');
    },
    [fetch, selectedVariantId, mutateVariants, toaster]
  );

  const renderVariant = useCallback(
    async (variantId: string) => {
      toaster.show('렌더 시작…');
      const res = await fetch(`/video-studio/variants/${variantId}/render`, {
        method: 'POST',
      });
      if (!res.ok) {
        let message = '렌더 실패';
        try {
          message = (await res.json())?.message ?? message;
        } catch {}
        toaster.show(String(message), 'warning');
        return;
      }
      await mutateVariants();
      toaster.show('렌더 완료 — 미디어 연결됨', 'success');
    },
    [fetch, mutateVariants, toaster]
  );

  // 렌더된 Media + 캡션을 기존 컴포저(AddEditModal)에 프리로드해서 연다 —
  // 채널 선택·시간·프로바이더별 설정은 전부 컴포저 UX 를 재사용 (standalone.modal 패턴).
  const sendToComposer = useCallback(
    async (variant: Variant) => {
      if (!variant.media?.path) {
        toaster.show('렌더부터 하세요 — 이 변형에 미디어가 없습니다', 'warning');
        return;
      }

      const [integrations, slot] = await Promise.all([
        (await fetch('/integrations/list')).json(),
        (await fetch('/posts/find-slot')).json(),
      ]);
      if (!integrations?.integrations?.length) {
        toaster.show('먼저 채널을 연결하세요', 'warning');
        return;
      }

      let hashtags: string[] = [];
      try {
        hashtags = JSON.parse(variant.hashtags || '[]');
      } catch {}
      const content = [variant.caption, hashtags.join(' ')]
        .filter(Boolean)
        .join('\n\n');

      modal.openModal({
        id: 'add-edit-modal',
        closeOnClickOutside: false,
        removeLayout: true,
        closeOnEscape: false,
        withCloseButton: false,
        askClose: true,
        fullScreen: true,
        classNames: {
          modal: 'w-[100%] max-w-[1400px] text-textColor',
        },
        children: (
          <AddEditModal
            allIntegrations={integrations.integrations}
            integrations={integrations.integrations}
            onlyValues={[
              {
                content,
                image: [{ id: variant.media.id, path: variant.media.path }],
              },
            ]}
            date={dayjs.utc(slot.date).local()}
            reopenModal={() => ({})}
            mutate={async () => {
              // 컴포저 저장 성공 후: 변형 상태를 scheduled 로 반영
              await fetch(`/video-studio/variants/${variant.id}`, {
                method: 'PUT',
                body: JSON.stringify({ status: 'scheduled' }),
              });
              await mutateVariants();
            }}
          />
        ),
        size: '80%',
      });
    },
    [fetch, modal, mutateVariants, toaster]
  );

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      {/* Brand selector row */}
      <div className="flex items-center gap-[12px] flex-wrap">
        <span className="text-textColor font-[600]">브랜드</span>
        <select
          className="bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] h-[36px] text-textColor min-w-[180px]"
          value={activeBrandId ?? ''}
          onChange={(e) => {
            setSelectedBrandId(e.target.value);
            setSelectedVariantId(null);
          }}
        >
          {(brands ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.slug})
            </option>
          ))}
          {!brandsLoading && (brands ?? []).length === 0 && (
            <option value="">브랜드 없음</option>
          )}
        </select>
        <Button onClick={createBrand}>+ 새 브랜드</Button>
      </div>

      {/* Brand editor */}
      {activeBrand && (
        <BrandEditor
          key={activeBrand.id}
          brand={activeBrand}
          onSave={saveBrand}
        />
      )}

      {/* Variant list */}
      <div className="border border-newTableBorder rounded-[8px] overflow-hidden">
        <div className="flex items-center justify-between px-[12px] py-[10px] bg-newBgColor">
          <span className="text-textColor font-[600]">
            변형{activeBrand ? ` (${activeBrand.slug})` : ''}
          </span>
          <Button onClick={createVariant} disabled={!activeBrandId}>
            + 새 변형
          </Button>
        </div>
        <div className="flex items-center gap-[10px] px-[12px] py-[8px] text-[12px] text-newTextColor/60 border-b border-newTableBorder">
          <div className="flex-1">id</div>
          <div className="w-[90px]">포맷</div>
          <div className="w-[110px]">상태</div>
          <div className="w-[220px]">동작</div>
        </div>
        {(variants ?? []).map((v) => (
          <VariantRow
            key={v.id}
            variant={v}
            selected={v.id === selectedVariantId}
            onEdit={() => setSelectedVariantId(v.id)}
            onRender={() => renderVariant(v.id)}
            onSend={() => sendToComposer(v)}
          />
        ))}
        {(variants ?? []).length === 0 && (
          <div className="px-[12px] py-[16px] text-[13px] text-newTextColor/60">
            아직 변형이 없습니다.
          </div>
        )}
      </div>

      {/* Variant editor */}
      {activeVariant && (
        <VariantEditor
          key={activeVariant.id}
          variant={activeVariant}
          onSave={saveVariant}
          onRender={() => renderVariant(activeVariant.id)}
          onSendToComposer={() => sendToComposer(activeVariant)}
        />
      )}
    </div>
  );
};
