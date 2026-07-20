'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
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
          Edit
        </button>
        <button
          type="button"
          className="text-forth hover:underline"
          onClick={onRender}
        >
          Render
        </button>
        <button
          type="button"
          className="text-forth hover:underline disabled:opacity-40 disabled:no-underline"
          disabled={!variant.mediaId}
          onClick={onSend}
          title={
            variant.mediaId ? 'Send to Composer' : 'Render first to enable'
          }
        >
          Send to Composer
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
    const res = await fetch('/video-studio/brands', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'new-brand',
        name: 'New Brand',
        url: 'https://example.com',
        tokens: JSON.stringify(PRESETS.light),
        fonts: JSON.stringify({ family: 'Inter', faces: [] }),
        mascotPrefix: null,
        pillars: JSON.stringify([]),
      }),
    });
    const created: Brand = await res.json();
    await mutateBrands();
    if (created?.id) {
      setSelectedBrandId(created.id);
    }
    toaster.show('Brand created', 'success');
  }, [fetch, mutateBrands, toaster]);

  const saveBrand = useCallback(
    async (payload: Partial<Brand>) => {
      if (!activeBrandId) return;
      await fetch(`/video-studio/brands/${activeBrandId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await mutateBrands();
      toaster.show('Brand saved', 'success');
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
        spec: JSON.stringify({ slides: [''], cta: '' }),
        caption: '',
        hashtags: JSON.stringify([]),
      }),
    });
    const created: Variant = await res.json();
    await mutateVariants();
    if (created?.id) {
      setSelectedVariantId(created.id);
    }
  }, [fetch, activeBrandId, mutateVariants]);

  const saveVariant = useCallback(
    async (payload: Partial<Variant>) => {
      if (!selectedVariantId) return;
      await fetch(`/video-studio/variants/${selectedVariantId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await mutateVariants();
      toaster.show('Variant saved', 'success');
    },
    [fetch, selectedVariantId, mutateVariants, toaster]
  );

  const renderVariant = useCallback(
    async (variantId: string) => {
      toaster.show('Render started…');
      await fetch(`/video-studio/variants/${variantId}/render`, {
        method: 'POST',
      });
      await mutateVariants();
      toaster.show('Render requested', 'success');
    },
    [fetch, mutateVariants, toaster]
  );

  const sendToComposer = useCallback(
    (variant: Variant) => {
      // TODO(composer-wiring): hand variant.mediaId to the Postiz composer /
      // calendar so channel + time are picked there. Options to wire up:
      //   (a) push to useLaunchStore() with the rendered Media pre-attached, or
      //   (b) POST /video-studio/variants/:id/schedule (createPost) then open
      //       the calendar. See contract video-studio-design.md §2/§3.
      toaster.show(
        'Send to Composer is not wired yet (mediaId=' +
          (variant.mediaId ?? 'none') +
          ')',
        'warning'
      );
    },
    [toaster]
  );

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      {/* Brand selector row */}
      <div className="flex items-center gap-[12px] flex-wrap">
        <span className="text-textColor font-[600]">Brand</span>
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
            <option value="">No brands yet</option>
          )}
        </select>
        <Button onClick={createBrand}>+ New Brand</Button>
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
            Variants{activeBrand ? ` (${activeBrand.slug})` : ''}
          </span>
          <Button onClick={createVariant} disabled={!activeBrandId}>
            + New Variant
          </Button>
        </div>
        <div className="flex items-center gap-[10px] px-[12px] py-[8px] text-[12px] text-newTextColor/60 border-b border-newTableBorder">
          <div className="flex-1">id</div>
          <div className="w-[90px]">format</div>
          <div className="w-[110px]">status</div>
          <div className="w-[220px]">actions</div>
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
            No variants yet.
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
