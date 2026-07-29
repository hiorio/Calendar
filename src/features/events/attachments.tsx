import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { Txt } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import {
  MAX_ATTACHMENT_BYTES,
  useDeleteEventAttachment,
  useEventAttachments,
  useUploadEventAttachments,
  type AttachmentDraft,
  type EventAttachment,
} from '@/features/events/attachment-queries';
import { useTheme } from '@/hooks/use-theme';
import { confirm, notify } from '@/lib/confirm';

const MAX_FILES = 10;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
]);

export function AttachmentDraftPicker({
  drafts,
  onChange,
  disabled = false,
  compact = false,
}: {
  drafts: AttachmentDraft[];
  onChange: (drafts: AttachmentDraft[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);

  async function add(kind: 'photo' | 'file') {
    try {
      setError(null);
      const selected = await pickAttachments(kind, MAX_FILES - drafts.length);
      if (selected.length === 0) return;
      onChange([...drafts, ...selected].slice(0, MAX_FILES));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (compact) {
    return (
      <View style={styles.compactDrafts}>
        <View style={styles.compactDraftHeading}>
          <View style={styles.compactDraftLabel}>
            <Ionicons name="attach-outline" size={20} color={colors.accent} />
            <Txt variant="body">첨부</Txt>
            {drafts.length ? (
              <Txt variant="caption" tone="tertiary">
                {drafts.length}개
              </Txt>
            ) : null}
          </View>
          <View style={styles.compactDraftActions}>
            <IconButton
              icon="image-outline"
              label="사진 선택"
              disabled={disabled || drafts.length >= MAX_FILES}
              onPress={() => add('photo')}
            />
            <IconButton
              icon="document-outline"
              label="파일 선택"
              disabled={disabled || drafts.length >= MAX_FILES}
              onPress={() => add('file')}
            />
          </View>
        </View>

        {drafts.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.compactDraftList}>
            {drafts.map((draft) => (
              <View
                key={draft.id}
                style={[styles.compactDraftChip, { backgroundColor: colors.surfaceMuted }]}>
                <Txt variant="caption" numberOfLines={1} style={styles.compactDraftName}>
                  {draft.name}
                </Txt>
                <IconButton
                  icon="close"
                  label={`${draft.name} 첨부 취소`}
                  onPress={() => onChange(drafts.filter((item) => item.id !== draft.id))}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}

        {error ? (
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Txt variant="label" tone="secondary">
          첨부
        </Txt>
        <Txt variant="caption" tone="tertiary">
          최대 10개 · 파일당 20MB
        </Txt>
      </View>

      <PickerButtons
        disabled={disabled || drafts.length >= MAX_FILES}
        onPhoto={() => add('photo')}
        onFile={() => add('file')}
      />

      {drafts.length ? (
        <Card padded={false}>
          {drafts.map((draft, index) => (
            <View key={draft.id}>
              {index > 0 ? <Divider /> : null}
              <AttachmentRow
                name={draft.name}
                mimeType={draft.mimeType}
                size={draft.size}
                imageUrl={draft.mimeType.startsWith('image/') ? draft.uri : null}
                action={
                  <IconButton
                    icon="close"
                    label={`${draft.name} 첨부 취소`}
                    onPress={() => onChange(drafts.filter((item) => item.id !== draft.id))}
                  />
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      {error ? (
        <Txt variant="caption" tone="danger">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

export function EventAttachments({
  eventId,
  calendarId,
}: {
  eventId: string;
  calendarId: string;
}) {
  const attachments = useEventAttachments(eventId);
  const upload = useUploadEventAttachments(eventId, calendarId);
  const remove = useDeleteEventAttachment(eventId);

  async function add(kind: 'photo' | 'file') {
    try {
      const remaining = MAX_FILES - (attachments.data?.length ?? 0);
      const selected = await pickAttachments(kind, remaining);
      if (selected.length) upload.mutate(selected);
    } catch (e) {
      notify('첨부할 수 없습니다', e instanceof Error ? e.message : String(e));
    }
  }

  async function askDelete(attachment: EventAttachment) {
    const ok = await confirm({
      title: '첨부 파일을 삭제할까요?',
      message: attachment.file_name,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (ok) remove.mutate(attachment);
  }

  const full = (attachments.data?.length ?? 0) >= MAX_FILES;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Txt variant="subtitle">첨부</Txt>
        <Txt variant="caption" tone="tertiary">
          {(attachments.data?.length ?? 0)}/{MAX_FILES}
        </Txt>
      </View>

      <PickerButtons
        disabled={upload.isPending || full}
        onPhoto={() => add('photo')}
        onFile={() => add('file')}
      />

      {attachments.isPending ? (
        <Txt variant="caption" tone="secondary">
          첨부 파일을 불러오는 중…
        </Txt>
      ) : attachments.data?.length ? (
        <Card padded={false}>
          {attachments.data.map((attachment, index) => (
            <View key={attachment.id}>
              {index > 0 ? <Divider /> : null}
              <AttachmentRow
                name={attachment.file_name}
                mimeType={attachment.mime_type}
                size={attachment.size_bytes}
                imageUrl={attachment.mime_type.startsWith('image/') ? attachment.signedUrl : null}
                onPress={() => WebBrowser.openBrowserAsync(attachment.signedUrl)}
                action={
                  <IconButton
                    icon="trash-outline"
                    label={`${attachment.file_name} 삭제`}
                    danger
                    disabled={remove.isPending}
                    onPress={() => askDelete(attachment)}
                  />
                }
              />
            </View>
          ))}
        </Card>
      ) : (
        <Txt variant="caption" tone="tertiary">
          사진이나 문서를 일정과 함께 보관할 수 있습니다.
        </Txt>
      )}

      {upload.isError || attachments.isError || remove.isError ? (
        <Txt variant="caption" tone="danger">
          첨부를 처리하지 못했습니다:{' '}
          {((upload.error ?? attachments.error ?? remove.error) as Error).message}
        </Txt>
      ) : null}
    </View>
  );
}

function PickerButtons({
  disabled,
  onPhoto,
  onFile,
}: {
  disabled: boolean;
  onPhoto: () => void;
  onFile: () => void;
}) {
  return (
    <View style={styles.pickerButtons}>
      <Button
        label="사진 선택"
        variant="secondary"
        size="md"
        block={false}
        disabled={disabled}
        onPress={onPhoto}
      />
      <Button
        label="파일 선택"
        variant="secondary"
        size="md"
        block={false}
        disabled={disabled}
        onPress={onFile}
      />
    </View>
  );
}

function AttachmentRow({
  name,
  mimeType,
  size,
  imageUrl,
  onPress,
  action,
}: {
  name: string;
  mimeType: string;
  size: number | null;
  imageUrl: string | null;
  onPress?: () => void;
  action: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${name} 열기` : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.attachmentRow,
        { backgroundColor: pressed && onPress ? colors.surfacePressed : 'transparent' },
      ]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} contentFit="cover" style={styles.thumbnail} />
      ) : (
        <View style={[styles.fileIcon, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="document-outline" size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.fileText}>
        <Txt variant="body" numberOfLines={1}>
          {name}
        </Txt>
        <Txt variant="caption" tone="secondary" numberOfLines={1}>
          {fileKind(mimeType)} · {formatBytes(size)}
        </Txt>
      </View>
      {action}
    </Pressable>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: pressed ? colors.surfacePressed : 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
      ]}>
      <Ionicons
        name={icon}
        size={19}
        color={danger ? colors.danger : colors.textSecondary}
      />
    </Pressable>
  );
}

async function pickAttachments(kind: 'photo' | 'file', remaining: number) {
  if (remaining <= 0) throw new Error('일정 하나에 첨부할 수 있는 파일은 최대 10개입니다.');

  const drafts: AttachmentDraft[] = [];

  if (kind === 'photo') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return drafts;

    for (const [index, asset] of result.assets.entries()) {
      drafts.push({
        id: Crypto.randomUUID(),
        uri: asset.uri,
        name: asset.fileName ?? `사진-${index + 1}.jpg`,
        mimeType: normalizedMime(asset.mimeType, asset.fileName ?? '', 'image/jpeg'),
        size: asset.fileSize ?? null,
        webFile: asset.file,
      });
    }
  } else {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
      base64: false,
    });
    if (result.canceled) return drafts;

    for (const asset of result.assets.slice(0, remaining)) {
      drafts.push({
        id: Crypto.randomUUID(),
        uri: asset.uri,
        name: asset.name,
        mimeType: normalizedMime(asset.mimeType, asset.name, 'application/octet-stream'),
        size: asset.size ?? null,
        webFile: asset.file,
      });
    }
  }

  const oversized = drafts.find((draft) => (draft.size ?? 0) > MAX_ATTACHMENT_BYTES);
  if (oversized) throw new Error(`${oversized.name}: 파일은 20MB까지 첨부할 수 있습니다.`);
  return drafts;
}

function normalizedMime(value: string | null | undefined, name: string, fallback: string) {
  const normalized = value?.toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'application/x-zip-compressed') return 'application/zip';
  if (normalized && ALLOWED_MIME_TYPES.has(normalized)) return normalized;

  const extension = name.split('.').pop()?.toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
      gif: 'image/gif',
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }[extension ?? ''] ?? (ALLOWED_MIME_TYPES.has(fallback) ? fallback : 'application/octet-stream')
  );
}

function fileKind(mimeType: string) {
  if (mimeType.startsWith('image/')) return '사진';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word')) return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
  if (mimeType === 'application/zip') return 'ZIP';
  if (mimeType.startsWith('text/')) return '문서';
  return '파일';
}

function formatBytes(value: number | null) {
  if (value === null) return '크기 확인 중';
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  pickerButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  compactDrafts: { gap: Spacing.xs },
  compactDraftHeading: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  compactDraftLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  compactDraftActions: { flexDirection: 'row', gap: Spacing.xs },
  compactDraftList: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  compactDraftChip: {
    height: 34,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    paddingLeft: Spacing.md,
  },
  compactDraftName: { maxWidth: 140 },
  attachmentRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  thumbnail: { width: 44, height: 44, borderRadius: Radius.sm },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1, gap: 1 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
