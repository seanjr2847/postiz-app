import { FC, useCallback, useMemo, useState } from 'react';
import { Integration } from '@prisma/client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { ChartSocial } from '@gitroom/frontend/components/analytics/chart-social';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const RenderAnalytics: FC<{
  integration: Integration;
  date: number;
}> = (props) => {
  const { integration, date } = props;
  const [loading, setLoading] = useState(true);
  const fetch = useFetch();
  const load = useCallback(async () => {
    setLoading(true);
    const load = (
      await fetch(`/analytics/${integration.id}?date=${date}`)
    ).json();
    setLoading(false);
    return load;
  }, [integration, date]);
  const { data } = useSWR(`/analytics-${integration?.id}-${date}`, load, {
    refreshInterval: 0,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    revalidateOnMount: true,
  });
  const refreshChannel = useCallback(
    (
        integration: Integration & {
          identifier: string;
        }
      ) =>
      async () => {
        const { url } = await (
          await fetch(
            `/integrations/social/${integration.identifier}?refresh=${integration.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    []
  );

  const t = useT();

  // 백엔드가 500(예: 토큰 만료 후 재연결 실패 "Channel not found")이면 data 가
  // 에러 객체라 .map 이 터져 페이지 전체가 죽는다 → 배열 아니면 빈 배열로 취급,
  // 아래 length===0 분기가 "리프레시 필요" UI 를 띄운다.
  const list: any[] = Array.isArray(data) ? data : [];

  const total = useMemo(() => {
    return list.map((p: any) => {
      const value =
        (p?.data.reduce((acc: number, curr: any) => acc + curr.total, 0) || 0) /
        (p.average ? p.data.length : 1);
      if (p.average) {
        return value.toFixed(2) + '%';
      }
      return value;
    });
  }, [list]);
  if (loading) {
    return (
      <>
        <LoadingComponent />
      </>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-[20px]">
      {list.length === 0 && (
        <div>
          {t(
            'this_channel_needs_to_be_refreshed',
            'This channel needs to be refreshed,'
          )}
          <div
            className="underline hover:font-bold cursor-pointer"
            onClick={refreshChannel(integration as any)}
          >
            {t('click_here_to_refresh', 'click here to refresh')}
          </div>
        </div>
      )}
      {list.map((p: any, index: number) => (
        <div key={`pl-${index}`} className="flex">
          <div className="flex-1 bg-newTableHeader rounded-[8px] py-[10px] px-[16px] gap-[10px] flex flex-col">
            <div className="flex items-center gap-[14px]">
              <div className="text-[20px]">{p.label}</div>
            </div>
            <div className="flex-1">
              <div className="h-[156px] relative">
                <ChartSocial {...p} key={`p-${index}`} />
              </div>
            </div>
            <div className="text-[50px] leading-[60px]">{total[index]}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
