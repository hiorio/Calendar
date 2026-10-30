import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const CALENDAR_MEDIA_BUCKET = 'calendar-media';
const MAX_COVER_BYTES = 10 * 1024 * 1024;

export type CalendarCoverDraft = {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
  webFile?: Blob;
};

export async function pickCalendarCover(): Promise<CalendarCoverDraft | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  const name = asset.fileName ?? '캘린더-사진.jpg';
  const mimeType = normalizeImageMime(asset.mimeType, name);

  if ((asset.fileSize ?? 0) > MAX_COVER_BYTES) {
    throw new Error('캘린더 사진은 10MB까지 올릴 수 있습니다.');
  }

  return {
    uri: asset.uri,
    name,
    mimeType,
    size: asset.fileSize ?? null,
    webFile: asset.file,
  };
}

export function useSetCalendarCover(calendarId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      draft,
      previousPath,
    }: {
      draft: CalendarCoverDraft | null;
      previousPath: string | null;
    }) => {
      let nextPath: string | null = null;

      if (draft) {
        const payload =
          Platform.OS === 'web' && draft.webFile
            ? draft.webFile
            : await new ExpoFile(draft.uri).arrayBuffer();
        const actualSize = payload instanceof ArrayBuffer ? payload.byteLength : payload.size;

        if (actualSize > MAX_COVER_BYTES) {
          throw new Error('캘린더 사진은 10MB까지 올릴 수 있습니다.');
        }

        nextPath = `${calendarId}/covers/${Crypto.randomUUID()}.${fileExtension(
          draft.name,
          draft.mimeType,
        )}`;

        const { error: uploadError } = await supabase.storage
          .from(CALENDAR_MEDIA_BUCKET)
          .upload(nextPath, payload, {
            contentType: draft.mimeType,
            upsert: false,
          });
        if (uploadError) throw uploadError;
      }

      const { error: updateError } = await supabase
        .from('calendars')
        .update({ cover_url: nextPath })
        .eq('id', calendarId);

      if (updateError) {
        if (nextPath) {
          await supabase.storage.from(CALENDAR_MEDIA_BUCKET).remove([nextPath]);
        }
        throw updateError;
      }

      if (previousPath && previousPath !== nextPath) {
        // DB가 새 경로를 가리킨 뒤 오래된 파일을 정리한다. 정리 실패 때문에 이미
        // 적용된 사진 변경을 실패로 보이지는 않는다.
        await supabase.storage.from(CALENDAR_MEDIA_BUCKET).remove([previousPath]);
      }

      return nextPath;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['calendars'] }),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
      ]);
    },
  });
}

function normalizeImageMime(value: string | null | undefined, name: string) {
  const normalized = value?.toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/heic' ||
    normalized === 'image/heif'
  ) {
    return normalized;
  }

  const extension = name.split('.').pop()?.toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
    }[extension ?? ''] ?? 'image/jpeg'
  );
}

function fileExtension(name: string, mimeType: string) {
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && /^(jpe?g|png|webp|heic|heif)$/.test(fromName)) return fromName;

  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    }[mimeType] ?? 'jpg'
  );
}
