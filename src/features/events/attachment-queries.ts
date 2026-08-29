import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase';
import type { Attachment } from '@/types/database';

const BUCKET = 'calendar-media';
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type AttachmentDraft = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
  webFile?: Blob;
};

export type EventAttachment = Attachment & {
  signedUrl: string;
};

const attachmentKeys = {
  event: (eventId: string) => ['attachments', 'event', eventId] as const,
};

export function useEventAttachments(eventId: string) {
  return useQuery<EventAttachment[]>({
    queryKey: attachmentKeys.event(eventId),
    enabled: Boolean(eventId),
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return Promise.all(
        (data as Attachment[]).map(async (attachment) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(attachment.storage_path, 60 * 60);
          if (signedError) throw signedError;
          return { ...attachment, signedUrl: signed.signedUrl };
        }),
      );
    },
  });
}

export function useUploadEventAttachments(eventId: string, calendarId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (drafts: AttachmentDraft[]) =>
      uploadAttachmentDrafts({
        drafts,
        eventId,
        calendarId,
        uploadedBy: user!.id,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: attachmentKeys.event(eventId) }),
  });
}

export function useDeleteEventAttachment(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachment: EventAttachment) => {
      const { error: rowError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id);
      if (rowError) throw rowError;

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([attachment.storage_path]);
      if (storageError) throw storageError;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: attachmentKeys.event(eventId) }),
  });
}

export async function uploadAttachmentDrafts({
  drafts,
  eventId,
  calendarId,
  uploadedBy,
}: {
  drafts: AttachmentDraft[];
  eventId: string;
  calendarId: string;
  uploadedBy: string;
}) {
  for (const draft of drafts) {
    const payload =
      Platform.OS === 'web' && draft.webFile
        ? draft.webFile
        : await new ExpoFile(draft.uri).arrayBuffer();
    const actualSize = payload instanceof ArrayBuffer ? payload.byteLength : payload.size;

    if (actualSize > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${draft.name}: 파일은 20MB까지 첨부할 수 있습니다.`);
    }

    const storagePath = `${calendarId}/${Crypto.randomUUID()}.${fileExtension(
      draft.name,
      draft.mimeType,
    )}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, payload, {
      contentType: draft.mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase.from('attachments').insert({
      calendar_id: calendarId,
      event_id: eventId,
      storage_path: storagePath,
      file_name: draft.name,
      mime_type: draft.mimeType,
      size_bytes: actualSize,
      uploaded_by: uploadedBy,
    });

    if (rowError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw rowError;
    }
  }
}

function fileExtension(name: string, mimeType: string) {
  const fromName = name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) return fromName;

  return (
    {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/zip': 'zip',
    }[mimeType] ?? 'bin'
  );
}
