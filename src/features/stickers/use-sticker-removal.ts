import { useRef, useState } from 'react';

import { stickerByKey } from '@/features/stickers/catalog';
import { type DaySticker, useRemoveDaySticker } from '@/features/stickers/queries';
import { confirm, notify } from '@/lib/confirm';

/** 날짜 상세와 선택창에서 같은 대상 확인·중복 요청 방지·오류 처리를 사용한다. */
export function useStickerRemoval(date: string) {
  const removeSticker = useRemoveDaySticker(date);
  const locked = useRef(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function requestRemoval(sticker: DaySticker): Promise<boolean> {
    if (locked.current) return false;
    locked.current = true;
    setRemovingId(sticker.id);
    try {
      const label = stickerByKey(sticker.stickerKey)?.label ?? '선택한';
      const accepted = await confirm({
        title: '스티커를 제거할까요?',
        message: `${date} · ${sticker.calendarName}\n${label} 스티커가 이 캘린더를 함께 보는 사람들의 화면에서도 사라집니다. 일정은 유지됩니다.`,
        confirmLabel: '제거',
        destructive: true,
      });
      if (!accepted) return false;
      await removeSticker.mutateAsync(sticker);
      return true;
    } catch (error) {
      notify('스티커를 제거하지 못했습니다', error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      locked.current = false;
      setRemovingId(null);
    }
  }

  return { requestRemoval, removingId, isPending: removingId !== null };
}
