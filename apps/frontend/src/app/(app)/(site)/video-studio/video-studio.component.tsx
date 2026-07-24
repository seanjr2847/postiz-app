'use client';

import { FC, useCallback, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
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

// 렌더 계약의 포맷 키는 그대로 두고, 화면에는 사람 말로 보여준다.
export const FORMAT_LABELS: Record<VariantFormat, string> = {
  slides: '슬라이드',
  cards: '카드',
  meme: '밈',
  ugc: 'UGC 반응',
  hookcta: '훅 + CTA',
};

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
    return (await fetch(`/video-studio/variants?brandId=${brandId}`)).json();
  }, [fetch, brandId]);
  return useSWR<Variant[]>(
    brandId ? `video-studio-variants-${brandId}` : null,
    load
  );
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
export const STATUS_CHIP: Record<
  VariantStatus,
  { label: string; cls: string }
> = {
  draft: { label: '초안', cls: 'text-gray-300 bg-gray-500/20' },
  rendered: { label: '렌더됨', cls: 'text-green-300 bg-green-500/20' },
  scheduled: { label: '예약됨', cls: 'text-blue-300 bg-blue-500/20' },
  published: { label: '게시됨', cls: 'text-purple-300 bg-purple-500/20' },
};

// 렌더된 변형은 실제 프레임을 보여준다 — 텍스트 표만 보고 어느 게 어느 건지
// 알아내야 했던 게 이 화면의 제일 큰 불만이었다.
const Thumb: FC<{ variant: Variant }> = ({ variant }) =>
  variant.media?.path ? (
    <video
      // #t=0.1 로 첫 프레임을 포스터처럼 쓴다 — 별도 썸네일 생성 없이.
      src={`${variant.media.path}#t=0.1`}
      preload="metadata"
      muted
      className="w-[36px] h-[52px] shrink-0 object-cover rounded-[4px] bg-black/30"
    />
  ) : (
    <div className="w-[36px] h-[52px] shrink-0 rounded-[4px] bg-newBgColor border border-newTableBorder" />
  );

const VariantRow: FC<{
  variant: Variant;
  selected: boolean;
  checked: boolean;
  rendering: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ variant, selected, checked, rendering, onCheck, onEdit, onDelete }) => {
  const chip = STATUS_CHIP[variant.status] ?? {
    label: variant.status,
    cls: 'text-gray-300 bg-gray-500/20',
  };
  return (
    <div
      className={`group flex items-center gap-[10px] px-[12px] py-[8px] border-b border-newTableBorder text-[14px] cursor-pointer hover:bg-newBgColor ${
        selected ? 'bg-newBgColor border-s-[3px] border-s-forth' : ''
      }`}
      onClick={onEdit}
    >
      <input
        type="checkbox"
        className="shrink-0 cursor-pointer"
        checked={checked}
        onChange={onCheck}
        onClick={(e) => e.stopPropagation()}
      />
      <Thumb variant={variant} />
      <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
        <div className="truncate text-textColor">
          {variant.hook || (
            <span className="text-newTextColor/50">(제목 없음)</span>
          )}
        </div>
        <div className="flex items-center gap-[6px]">
          <span className="text-[12px] text-newTextColor/60">
            {FORMAT_LABELS[variant.format] ?? variant.format}
          </span>
          <span
            className={`px-[8px] py-[1px] rounded-full text-[11px] ${chip.cls}`}
          >
            {rendering ? '렌더 중…' : chip.label}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 text-newTextColor/40 hover:text-red-400 opacity-0 group-hover:opacity-100"
        title="변형 삭제"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        ✕
      </button>
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

  const {
    data: brands,
    mutate: mutateBrands,
    isLoading: brandsLoading,
  } = useBrands();

  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());

  // 편집기가 알려주는 "저장 안 한 변경" 플래그 — ref 라서 리렌더를 안 일으킨다.
  const dirtyRef = useRef(false);
  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  // 다른 변형으로 옮기기 전에 편집 중인 내용을 버릴지 묻는다.
  // (예전엔 key 변경으로 리마운트되며 조용히 사라졌다.)
  const confirmDiscard = useCallback(async () => {
    if (!dirtyRef.current) return true;
    const ok = await deleteDialog(
      '저장하지 않은 변경이 있습니다. 버리고 이동할까요?',
      '버리고 이동',
      '변경 사항 버리기'
    );
    if (ok) dirtyRef.current = false;
    return ok;
  }, []);

  const selectVariant = useCallback(
    async (id: string | null) => {
      if (await confirmDiscard()) setSelectedVariantId(id);
    },
    [confirmDiscard]
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

  // 백엔드엔 DELETE 가 있었는데 화면엔 없었다 — 만들면 지울 수가 없었다.
  // 설정 모달이 "지웠을 때만" 닫히도록 성공 여부를 돌려준다.
  const deleteBrand = useCallback(async () => {
    if (!activeBrand) return false;
    const ok = await deleteDialog(
      `「${activeBrand.name}」 브랜드와 그 변형이 모두 사라집니다.`,
      '브랜드 삭제',
      '브랜드를 삭제할까요?'
    );
    if (!ok) return false;
    const res = await fetch(`/video-studio/brands/${activeBrand.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toaster.show('브랜드 삭제 실패', 'warning');
      return false;
    }
    setSelectedBrandId(null);
    setSelectedVariantId(null);
    await mutateBrands();
    toaster.show('브랜드 삭제됨', 'success');
    return true;
  }, [fetch, activeBrand, mutateBrands, toaster]);

  // --- variant actions ---
  const createVariant = useCallback(async () => {
    if (!activeBrandId) return;
    if (!(await confirmDiscard())) return;
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
  }, [fetch, activeBrandId, confirmDiscard, mutateVariants, toaster]);

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

  const deleteVariant = useCallback(
    async (variant: Variant) => {
      const ok = await deleteDialog(
        `「${variant.hook || '(제목 없음)'}」 변형을 삭제합니다.`,
        '변형 삭제',
        '변형을 삭제할까요?'
      );
      if (!ok) return;
      const res = await fetch(`/video-studio/variants/${variant.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toaster.show('변형 삭제 실패', 'warning');
        return;
      }
      if (selectedVariantId === variant.id) {
        dirtyRef.current = false;
        setSelectedVariantId(null);
      }
      setCheckedIds((prev) => {
        const next = new Set(prev);
        next.delete(variant.id);
        return next;
      });
      await mutateVariants();
      toaster.show('변형 삭제됨', 'success');
    },
    [fetch, selectedVariantId, mutateVariants, toaster]
  );

  const renderVariant = useCallback(
    async (variantId: string) => {
      setRenderingIds((prev) => new Set(prev).add(variantId));
      toaster.show('렌더 시작 — 1분쯤 걸립니다');
      try {
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
        toaster.show('렌더 완료 — 게시 버튼이 활성화됐습니다', 'success');
      } finally {
        setRenderingIds((prev) => {
          const next = new Set(prev);
          next.delete(variantId);
          return next;
        });
      }
    },
    [fetch, mutateVariants, toaster]
  );

  // 양산 임포트 — 렌더 서비스 레지스트리(정적+생성엔진 전체)에서 없는 것만 추가
  const importRegistry = useCallback(async () => {
    if (!activeBrandId) return;
    toaster.show('레지스트리에서 가져오는 중…');
    const res = await fetch(
      `/video-studio/brands/${activeBrandId}/import-registry`,
      { method: 'POST' }
    );
    if (!res.ok) {
      let message = '임포트 실패';
      try {
        message = (await res.json())?.message ?? message;
      } catch {}
      toaster.show(String(message), 'warning');
      return;
    }
    const { imported, skipped } = await res.json();
    await mutateVariants();
    toaster.show(
      `양산 임포트: ${imported}개 추가, ${skipped}개는 이미 있음`,
      'success'
    );
  }, [fetch, activeBrandId, mutateVariants, toaster]);

  // 일괄 렌더 — 체크된 변형을 순차 렌더 (렌더 서비스가 1건씩 처리하므로 직렬)
  const bulkRender = useCallback(async () => {
    const ids = [...checkedIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      toaster.show(`일괄 렌더 ${done + failed + 1}/${ids.length}…`);
      const res = await fetch(`/video-studio/variants/${id}/render`, {
        method: 'POST',
      });
      res.ok ? done++ : failed++;
      await mutateVariants();
    }
    setBulkBusy(false);
    setCheckedIds(new Set());
    toaster.show(
      `일괄 렌더 끝: 성공 ${done}${failed ? `, 실패 ${failed}` : ''}`,
      failed ? 'warning' : 'success'
    );
  }, [checkedIds, bulkBusy, fetch, mutateVariants, toaster]);

  // 렌더된 Media + 캡션을 기존 컴포저(AddEditModal)에 프리로드해서 연다 —
  // 채널 선택·시간·프로바이더별 설정은 전부 컴포저 UX 를 재사용 (standalone.modal 패턴).
  const sendToComposer = useCallback(
    async (variant: Variant) => {
      if (!variant.media?.path) {
        toaster.show(
          '렌더부터 하세요 — 이 변형에 미디어가 없습니다',
          'warning'
        );
        return;
      }

      // find-slot 은 이 인스턴스에서 응답이 안 돌아와(행) 컴포저가 영영 안 열리는
      // 원인이었다 — 시간은 컴포저에서 고르므로 지금+10분으로 충분하다.
      const integrations = await (await fetch('/integrations/list')).json();
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
            date={newDayjs().add(10, 'minute')}
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

  // 브랜드 설정·소재 도구는 본 작업(변형 목록 + 편집)이 아니라 곁다리다 —
  // 페이지에 나란히 쌓아두니 다 따로 노는 상자로 보였다. 모달로 내린다.
  const openBrandSettings = useCallback(() => {
    if (!activeBrand) return;
    modal.openModal({
      title: '브랜드 설정',
      size: '820px',
      children: (close) => (
        <BrandEditor
          key={activeBrand.id}
          brand={activeBrand}
          onSave={async (payload) => {
            await saveBrand(payload);
            close();
          }}
          onDelete={async () => {
            if (await deleteBrand()) close();
          }}
        />
      ),
    });
  }, [modal, activeBrand, saveBrand, deleteBrand]);

  const openTools = useCallback(() => {
    modal.openModal({
      title: '소재 도구 — 스크랩 · CTA · 스티치 · 마스코트',
      size: '900px',
      children: <ToolsPanel />,
    });
  }, [modal]);

  // 브랜드가 없으면 다른 건 전부 눌러도 아무 일이 없다 — 할 일 하나만 보여준다.
  if (!brandsLoading && (brands ?? []).length === 0) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col justify-center items-center text-center gap-[12px]">
        <div className="text-textColor font-[600] text-[18px]">
          아직 브랜드가 없습니다
        </div>
        <div className="text-[13px] text-newTextColor/60 max-w-[420px]">
          브랜드는 색·폰트·마스코트를 담는 상자입니다. 여기서 만든 변형은 모두
          이 브랜드 스타일로 렌더됩니다.
        </div>
        <Button onClick={createBrand}>브랜드 만들기</Button>
      </div>
    );
  }

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      {/* 헤더는 "지금 어느 브랜드로 일하는가" 하나만 말한다 —
          변형을 만드는 버튼은 전부 목록 헤더로 내려갔다(예전엔 「양산 임포트」와
          「+ 새 변형」이 서로 다른 줄에 흩어져 있었다). */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <span className="text-textColor font-[600]">브랜드</span>
        <select
          className="bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] h-[36px] text-textColor min-w-[180px]"
          value={activeBrandId ?? ''}
          onChange={async (e) => {
            const next = e.target.value;
            if (!(await confirmDiscard())) return;
            setSelectedBrandId(next);
            setSelectedVariantId(null);
          }}
        >
          {(brands ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.slug})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-forth text-[13px] hover:underline"
          onClick={openBrandSettings}
        >
          설정
        </button>
        <button
          type="button"
          className="text-forth text-[13px] hover:underline"
          onClick={createBrand}
        >
          + 새 브랜드
        </button>
        <div className="flex-1" />
        <Button secondary onClick={openTools}>
          소재 도구
        </Button>
      </div>

      {/* 목록(좌) + 편집기(우) — 행을 클릭해도 레이아웃이 밀리지 않는다.
          예전엔 편집기가 목록 위에 끼어들어 화면이 통째로 튀었다. */}
      <div className="flex flex-col lg:flex-row gap-[15px] flex-1 min-h-0">
        <div className="w-full lg:w-[380px] shrink-0 border border-newTableBorder rounded-[8px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-[12px] py-[10px] bg-newBgColor gap-[8px]">
            <span className="text-textColor font-[600]">
              변형 {variants?.length ? `(${variants.length})` : ''}
            </span>
            <div className="flex items-center gap-[8px]">
              <Button
                secondary
                onClick={importRegistry}
                disabled={!activeBrandId}
              >
                양산 임포트
              </Button>
              <Button onClick={createVariant} disabled={!activeBrandId}>
                + 새 변형
              </Button>
            </div>
          </div>
          {(variants ?? []).length > 0 && (
            <div className="flex items-center gap-[10px] px-[12px] py-[8px] text-[12px] text-newTextColor/60 border-b border-newTableBorder">
              <input
                type="checkbox"
                className="shrink-0 cursor-pointer"
                checked={checkedIds.size === (variants ?? []).length}
                onChange={() =>
                  setCheckedIds((prev) =>
                    prev.size === (variants ?? []).length
                      ? new Set()
                      : new Set((variants ?? []).map((v) => v.id))
                  )
                }
              />
              <span className="flex-1">전체 선택</span>
              {checkedIds.size > 0 && (
                <Button secondary onClick={bulkRender} disabled={bulkBusy}>
                  {bulkBusy
                    ? '일괄 렌더 중…'
                    : `선택 ${checkedIds.size}개 렌더`}
                </Button>
              )}
            </div>
          )}
          <div className="flex-1 min-h-[200px] max-h-[calc(100vh-260px)] overflow-y-auto">
            {(variants ?? []).map((v) => (
              <VariantRow
                key={v.id}
                variant={v}
                selected={v.id === selectedVariantId}
                checked={checkedIds.has(v.id)}
                rendering={renderingIds.has(v.id)}
                onCheck={() =>
                  setCheckedIds((prev) => {
                    const next = new Set(prev);
                    next.has(v.id) ? next.delete(v.id) : next.add(v.id);
                    return next;
                  })
                }
                onEdit={() => selectVariant(v.id)}
                onDelete={() => deleteVariant(v)}
              />
            ))}
            {(variants ?? []).length === 0 && (
              <div className="px-[12px] py-[16px] text-[13px] text-newTextColor/60">
                아직 변형이 없습니다 — 「양산 임포트」로 기존 콘텐츠를
                가져오거나 「+ 새 변형」으로 시작하세요.
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {activeVariant ? (
            <VariantEditor
              key={activeVariant.id}
              variant={activeVariant}
              onSave={saveVariant}
              onRender={() => renderVariant(activeVariant.id)}
              onSendToComposer={() => sendToComposer(activeVariant)}
              onDirtyChange={setDirty}
              onDelete={() => deleteVariant(activeVariant)}
            />
          ) : (
            <div className="h-full min-h-[200px] border border-dashed border-newTableBorder rounded-[8px] flex items-center justify-center text-[13px] text-newTextColor/50 px-[20px] text-center">
              왼쪽에서 변형을 고르면 여기서 편집합니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CLI 도구 패널 — noti-marketing 스크립트를 렌더 서비스 프록시로 실행.
// 스크랩(yt-dlp) → CTA 렌더 → 스티치(ffmpeg) → Media 임포트 / 마스코트(fal) 생성.
// ---------------------------------------------------------------------------
const ToolsPanel: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const [busy, setBusy] = useState<string | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeCount, setScrapeCount] = useState('5');
  const [hookSeconds, setHookSeconds] = useState('3');
  const [mascotRef, setMascotRef] = useState('');
  const [mascotPose, setMascotPose] = useState('');
  const [log, setLog] = useState('');

  const run = useCallback(
    async (tool: string, body: Record<string, any>, label: string) => {
      if (busy) return null;
      setBusy(tool);
      setLog('');
      toaster.show(`${label} 실행 중… (몇 분 걸릴 수 있음)`);
      try {
        const res = await fetch(`/video-studio/tools/${tool}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await res.json();
        setLog(
          [data.stdout, data.stderr].filter(Boolean).join('\n').slice(-2000)
        );
        if (!res.ok || !data.ok) {
          toaster.show(`${label} 실패 — 로그 확인`, 'warning');
          return null;
        }
        toaster.show(`${label} 완료`, 'success');
        return data;
      } finally {
        setBusy(null);
      }
    },
    [busy, fetch, toaster]
  );

  const inputCls =
    'bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] h-[36px] text-textColor';

  return (
    <div className="flex flex-col gap-[12px] text-textColor">
      <div className="text-[13px] text-newTextColor/60">
        여기서 만든 결과물은 미디어 라이브러리로 들어갑니다 — 변형 편집기의
        「라이브러리」 버튼으로 골라 쓰세요.
      </div>
      <div className="flex flex-col gap-[14px]">
        {/* 스크랩 */}
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="text-textColor w-[110px]">① 훅 스크랩</span>
          <input
            className={inputCls + ' flex-1 min-w-[260px]'}
            placeholder="유튜브 채널 Shorts URL (https://youtube.com/@x/shorts)"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
          />
          <input
            className={inputCls + ' w-[70px]'}
            value={scrapeCount}
            onChange={(e) => setScrapeCount(e.target.value)}
            title="개수"
          />
          <Button
            secondary
            disabled={!scrapeUrl || !!busy}
            onClick={async () => {
              const d = await run(
                'scrape',
                { url: scrapeUrl, count: Number(scrapeCount) || 5 },
                '훅 스크랩'
              );
              if (d?.manifest?.length) {
                toaster.show(`클립 ${d.manifest.length}개 확보`, 'success');
              }
            }}
          >
            스크랩
          </Button>
        </div>

        {/* CTA 렌더 */}
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="text-textColor w-[110px]">② CTA 렌더</span>
          <span className="text-[12px] text-newTextColor/60 flex-1">
            스티치가 라운드로빈으로 붙일 CTA 클립(3종) 생성
          </span>
          <Button
            secondary
            disabled={!!busy}
            onClick={() => run('render-cta', {}, 'CTA 렌더')}
          >
            CTA 렌더
          </Button>
        </div>

        {/* 스티치 */}
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="text-textColor w-[110px]">③ 스티치</span>
          <span className="text-[12px] text-newTextColor/60">훅 앞</span>
          <input
            className={inputCls + ' w-[60px]'}
            value={hookSeconds}
            onChange={(e) => setHookSeconds(e.target.value)}
          />
          <span className="text-[12px] text-newTextColor/60 flex-1">
            초 + CTA 합성 → 완성본은 미디어 라이브러리로 임포트
          </span>
          <Button
            secondary
            disabled={!!busy}
            onClick={async () => {
              const d = await run(
                'stitch',
                { hookSeconds: Number(hookSeconds) || 3 },
                '스티치'
              );
              if (d?.files?.length) {
                const res = await fetch('/video-studio/tools/stitch/import', {
                  method: 'POST',
                  body: JSON.stringify({ urls: d.files }),
                });
                if (res.ok) {
                  toaster.show(
                    `완성본 ${d.files.length}개를 미디어로 가져옴`,
                    'success'
                  );
                }
              }
            }}
          >
            스티치 + 임포트
          </Button>
        </div>

        {/* 마스코트 */}
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="text-textColor w-[110px]">④ 마스코트</span>
          <input
            className={inputCls + ' flex-1 min-w-[220px]'}
            placeholder="레퍼런스 이미지 URL (fal 업로드)"
            value={mascotRef}
            onChange={(e) => setMascotRef(e.target.value)}
          />
          <input
            className={inputCls + ' w-[120px]'}
            placeholder="포즈 (선택)"
            value={mascotPose}
            onChange={(e) => setMascotPose(e.target.value)}
          />
          <Button
            secondary
            disabled={!mascotRef || !!busy}
            onClick={() =>
              run(
                'mascot',
                {
                  refUrl: mascotRef,
                  ...(mascotPose ? { pose: mascotPose } : {}),
                },
                '마스코트 생성'
              )
            }
          >
            포즈 생성
          </Button>
        </div>

        {log && (
          <pre className="text-[11px] text-newTextColor/70 bg-newBgColor border border-newTableBorder rounded-[6px] p-[10px] max-h-[220px] overflow-auto whitespace-pre-wrap">
            {log}
          </pre>
        )}
      </div>
    </div>
  );
};
