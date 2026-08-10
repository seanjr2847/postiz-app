'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

// ---------------------------------------------------------------------------
// 렌더 큐 — 렌더는 항목당 5~70초짜리 동기 HTTP 이고 렌더 서비스가 1건씩 처리한다.
// 진행 상황을 사라지는 토스트에 맡기면 무엇이 도는지 알 수 없으므로, 큐를 UI 상태로
// 들고 화면에 계속 띄운다. 실패는 지우지 않고 남겨서 다시 렌더할 수 있게 한다.
// 'aborted' 는 'failed' 와 따로 둔다 — 사용자가 일부러 멈춘 것을 실패로 칠하면
// 정확히 이 화면이 없애려던 혼동을 다시 만든다.
// ponytail: 새로고침하면 큐는 사라진다(렌더 자체는 서버에서 계속 돌고 DB 에 반영됨).
//           살아남게 하려면 백엔드 job 테이블 + 폴링이 필요 — 그때 올린다.
// ---------------------------------------------------------------------------
type JobState = 'queued' | 'running' | 'done' | 'failed' | 'aborted';

interface Job {
  id: string;
  hook: string;
  format: string;
  state: JobState;
  error?: string;
  ms?: number;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(
    s % 60
  ).padStart(2, '0')}`;
};

const etaText = (msPerItem: number, left: number) => {
  const total = msPerItem * left;
  return total < 90_000
    ? `~${Math.max(1, Math.round(total / 1000))}초`
    : `~${Math.round(total / 60_000)}분`;
};

// 큐에 들어간 항목은 큐 상태가 DB 상태를 가린다 — "지금 무슨 일이 일어나는가"가 먼저다.
// 색은 팔레트 색(amber/red)으로만 알파를 쓴다 — 테마가 forth 를 `var(--color-forth)`
// (알파 자리 없는 평범한 hex)로 정의해서 `bg-forth/15` 는 알파가 무시되고 통짜 보라가
// 된다. gray 도 테마가 스케일 전체를 단색 var 로 덮어써서 `bg-gray-500` 은 아예 없다.
const jobChip = (job: Job | undefined, elapsed: number) =>
  job?.state === 'running'
    ? { label: `렌더 중 ${mmss(elapsed)}`, cls: 'text-amber-200 bg-amber-500/20' }
    : job?.state === 'queued'
    ? { label: '대기', cls: 'text-newTextColor/70 bg-newTableBorder' }
    : job?.state === 'failed'
    ? { label: '실패', cls: 'text-red-300 bg-red-500/20' }
    : job?.state === 'aborted'
    ? { label: '중단됨', cls: 'text-newTextColor/70 bg-newTableBorder' }
    : null;

// 큐 스트립 — 지금 뭐가 도는지 / 얼마나 남았는지 / 뭐가 깨졌는지 한 곳에서 답한다.
const RenderQueue: FC<{
  jobs: Job[];
  elapsed: number;
  aborting: boolean;
  onAbort: () => void;
  onRetry: () => void;
  onClear: () => void;
}> = ({ jobs, elapsed, aborting, onAbort, onRetry, onClear }) => {
  const done = jobs.filter((j) => j.state === 'done');
  const failed = jobs.filter((j) => j.state === 'failed');
  const aborted = jobs.filter((j) => j.state === 'aborted');
  const running = jobs.find((j) => j.state === 'running');
  const settled = done.length + failed.length + aborted.length;
  const pct = Math.round((settled / jobs.length) * 100);
  const avgMs = done.length
    ? done.reduce((a, j) => a + (j.ms ?? 0), 0) / done.length
    : 0;
  const retryable = failed.length + aborted.length;
  // 실패가 많으면 스트립이 페이지를 삼킨다 — 앞 5개만 펼치고 나머지는 목록의 칩으로 본다.
  const shown = failed.slice(0, 5);

  return (
    <div className="border border-newTableBorder rounded-[8px] overflow-hidden">
      <div className="flex items-center gap-[10px] px-[12px] py-[10px] bg-newBgColor">
        <span className="text-textColor font-[600]">렌더 큐</span>
        <span className="text-[13px] text-newTextColor/70 tabular-nums">
          {settled}/{jobs.length}
          {running && avgMs > 0
            ? ` · 남은 시간 ${etaText(avgMs, jobs.length - settled)}`
            : ''}
        </span>
        <div className="flex-1" />
        {running ? (
          <button
            type="button"
            className="text-[13px] text-forth hover:underline disabled:opacity-50 disabled:no-underline"
            disabled={aborting}
            onClick={onAbort}
          >
            {aborting ? '현재 항목 끝나면 중단' : '남은 항목 중단'}
          </button>
        ) : (
          <button
            type="button"
            className="text-[13px] text-newTextColor/70 hover:underline"
            onClick={onClear}
          >
            큐 지우기
          </button>
        )}
      </div>

      <div
        className="h-[4px] bg-newTableBorder"
        role="progressbar"
        aria-label="렌더 진행률"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-forth transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="px-[12px] py-[10px] flex items-center gap-[10px] text-[14px]">
        {running ? (
          <>
            <span className="w-[6px] h-[6px] rounded-full bg-forth animate-pulse motion-reduce:animate-none shrink-0" />
            {/* 초 단위 타이머는 aria-live 밖에 둔다 — 안에 넣으면 매초 읽어버린다. */}
            <span className="text-textColor truncate flex-1" aria-live="polite">
              {running.hook}
            </span>
            <span className="text-[12px] text-newTextColor/60">
              {running.format}
            </span>
            <span className="text-[13px] text-textColor tabular-nums">
              {mmss(elapsed)}
            </span>
          </>
        ) : (
          <span className="text-newTextColor/70" aria-live="polite">
            렌더 완료 {done.length}개
            {failed.length ? ` · 실패 ${failed.length}개` : ''}
            {aborted.length ? ` · 중단 ${aborted.length}개` : ''}
          </span>
        )}
      </div>

      {failed.length > 0 && (
        <div className="border-t border-newTableBorder">
          {shown.map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-[8px] px-[12px] py-[6px] text-[13px]"
            >
              <span className="text-red-300 shrink-0">✕</span>
              <span className="text-textColor truncate max-w-[280px]">
                {j.hook}
              </span>
              <span className="text-[12px] text-newTextColor/60 truncate flex-1">
                {j.error}
              </span>
            </div>
          ))}
          {failed.length > shown.length && (
            <div className="px-[12px] py-[6px] text-[12px] text-newTextColor/60">
              외 {failed.length - shown.length}개 — 목록에서 「실패」 칩으로
              확인하세요
            </div>
          )}
        </div>
      )}

      {!running && retryable > 0 && (
        <div className="px-[12px] py-[10px] border-t border-newTableBorder">
          <Button secondary onClick={onRetry}>
            다시 렌더 ({retryable})
          </Button>
        </div>
      )}
    </div>
  );
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
  job?: Job;
  elapsed: number;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ variant, selected, checked, job, elapsed, onCheck, onEdit, onDelete }) => {
  const chip = jobChip(job, elapsed) ??
    STATUS_CHIP[variant.status] ?? {
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
            className={`px-[8px] py-[1px] rounded-full text-[11px] tabular-nums ${chip.cls}`}
          >
            {chip.label}
          </span>
        </div>
        {job?.state === 'failed' && job.error && (
          <div className="truncate text-[11px] text-red-300/80">
            {job.error}
          </div>
        )}
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

  // 렌더 큐 상태 — 단일·일괄·재시도가 같은 경로를 쓴다.
  const [jobs, setJobs] = useState<Job[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [aborting, setAborting] = useState(false);
  const abortRef = useRef(false);
  const queueRunningRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  const queueActive = jobs.some((j) => j.state === 'running');
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  // 경과 타이머는 큐 전체에 하나만 — 행마다 타이머를 두지 않는다.
  useEffect(() => {
    if (!queueActive) return;
    const t = setInterval(
      () =>
        setElapsed(
          startedAtRef.current ? Date.now() - startedAtRef.current : 0
        ),
      1000
    );
    return () => clearInterval(t);
  }, [queueActive, jobs]);

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

  // 렌더 큐 실행 — 단일 렌더·일괄 렌더·재시도가 전부 여기로 들어온다.
  // 렌더 서비스가 1건씩 처리하므로 직렬. 진행 상황은 화면의 큐 스트립이 계속 보여준다.
  const runQueue = useCallback(
    async (ids: string[]) => {
      if (!ids.length || queueRunningRef.current) return;
      queueRunningRef.current = true;
      abortRef.current = false;
      setAborting(false);
      setJobs(
        ids.map((id) => {
          const v = variants?.find((x) => x.id === id);
          return {
            id,
            hook: v?.hook || '(제목 없음)',
            format: v ? FORMAT_LABELS[v.format] ?? v.format : '',
            state: 'queued' as JobState,
          };
        })
      );

      let ok = 0;
      let bad = 0;
      for (const id of ids) {
        if (abortRef.current) {
          setJobs((prev) =>
            prev.map((j) =>
              j.state === 'queued' ? { ...j, state: 'aborted' } : j
            )
          );
          break;
        }

        startedAtRef.current = Date.now();
        setElapsed(0);
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, state: 'running' } : j))
        );

        let error: string | undefined;
        try {
          const res = await fetch(`/video-studio/variants/${id}/render`, {
            method: 'POST',
          });
          if (!res.ok) {
            error = `렌더 실패 (${res.status})`;
            try {
              error = (await res.json())?.message ?? error;
            } catch {}
          }
        } catch (e: any) {
          error = e?.message || '렌더 서비스 응답 없음';
        }

        const ms = Date.now() - (startedAtRef.current ?? Date.now());
        error ? bad++ : ok++;
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? { ...j, state: error ? 'failed' : 'done', error, ms }
              : j
          )
        );
        await mutateVariants();
      }

      startedAtRef.current = null;
      queueRunningRef.current = false;
      setAborting(false);
      toaster.show(
        `렌더 끝 — 완료 ${ok}개${bad ? `, 실패 ${bad}개` : ''}`,
        bad ? 'warning' : 'success'
      );
    },
    [fetch, variants, mutateVariants, toaster]
  );

  const renderVariant = useCallback(
    (variantId: string) => runQueue([variantId]),
    [runQueue]
  );

  // 실패 + 중단(=아직 안 돌린 것)을 원래 큐 순서 그대로 다시 넣는다.
  const retryQueue = useCallback(
    () =>
      runQueue(
        jobs
          .filter((j) => j.state === 'failed' || j.state === 'aborted')
          .map((j) => j.id)
      ),
    [jobs, runQueue]
  );

  const abortQueue = useCallback(() => {
    abortRef.current = true;
    setAborting(true);
  }, []);

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

  // 일괄 렌더 — 체크된 변형을 큐에 넣는다.
  const bulkRender = useCallback(() => {
    // 큐가 이미 도는 중이면 runQueue 가 무시한다 — 체크를 먼저 지우면 선택이 조용히 증발한다.
    if (queueRunningRef.current) return;
    const ids = [...checkedIds];
    setCheckedIds(new Set());
    return runQueue(ids);
  }, [checkedIds, runQueue]);

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

      {/* 렌더 큐 — 도는 동안, 그리고 끝난 뒤에도 결과를 들고 남는다 */}
      {jobs.length > 0 && (
        <RenderQueue
          jobs={jobs}
          elapsed={elapsed}
          aborting={aborting}
          onAbort={abortQueue}
          onRetry={retryQueue}
          onClear={() => setJobs([])}
        />
      )}

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
                <Button
                  secondary
                  onClick={bulkRender}
                  disabled={queueActive}
                >
                  선택 {checkedIds.size}개 렌더
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
                job={jobById.get(v.id)}
                elapsed={elapsed}
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
              queueActive={queueActive}
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
