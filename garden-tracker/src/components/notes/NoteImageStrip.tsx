import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';

import { NoteImage } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';
import { resolveNoteImageUri } from '@/src/utils/imageStorage';
import { PHOTO_UNAVAILABLE_TOAST } from './photoUnavailableToast';
import NoteImageViewer from './NoteImageViewer';

interface Props {
  images: NoteImage[];
}

export default function NoteImageStrip({ images }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  // A photo that can't load (oversize/never backed up, or a missing local file)
  // otherwise renders as a silent broken frame. Report each failure once — a
  // toast can fire on every re-render otherwise — and swap in a labeled tile.
  const reportedIds = useRef<Set<string>>(new Set());
  const noteImageUris = usePlannerStore((state) => state.noteImageUris);

  const handleImageError = (imageId: string) => {
    setFailedIds((prev) => (prev.has(imageId) ? prev : new Set(prev).add(imageId)));
    if (reportedIds.current.has(imageId)) return;
    reportedIds.current.add(imageId);
    Toast.show(PHOTO_UNAVAILABLE_TOAST);
  };

  // Point every image at its on-disk file by uuid; the viewer inherits the
  // resolved uris, so both thumbnail and full view work post-sync.
  const resolvedImages = useMemo(
    () => images.map((image) => ({ ...image, uri: resolveNoteImageUri(image, noteImageUris) })),
    [images, noteImageUris],
  );

  if (resolvedImages.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
      >
        {resolvedImages.map((img, index) =>
          failedIds.has(img.id) ? (
            <View key={img.id} style={[styles.thumb, styles.thumbBroken]}>
              <Text style={styles.thumbBrokenIcon}>⚠</Text>
              <Text style={styles.thumbBrokenText}>Unavailable</Text>
            </View>
          ) : (
            <Pressable key={img.id} onPress={() => setViewerIndex(index)} style={styles.thumb}>
              <Image
                source={{ uri: img.uri }}
                style={styles.thumbImage}
                contentFit="cover"
                onError={() => handleImageError(img.id)}
              />
            </Pressable>
          ),
        )}
      </ScrollView>

      {viewerIndex !== null && (
        <NoteImageViewer
          images={resolvedImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginTop: 8,
  },
  stripContent: {
    gap: 6,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a3136',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbBroken: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20262b',
  },
  thumbBrokenIcon: {
    color: '#d8b45c',
    fontSize: 20,
    lineHeight: 22,
  },
  thumbBrokenText: {
    color: '#8a929b',
    fontSize: 10,
    marginTop: 2,
  },
});
