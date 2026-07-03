import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { NoteImage } from '@/src/types';
import { usePlannerStore } from '@/src/store/plannerStore';
import { resolveNoteImageUri } from '@/src/utils/imageStorage';
import NoteImageViewer from './NoteImageViewer';

interface Props {
  images: NoteImage[];
}

export default function NoteImageStrip({ images }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const noteImageUris = usePlannerStore((state) => state.noteImageUris);

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
        {resolvedImages.map((img, index) => (
          <Pressable key={img.id} onPress={() => setViewerIndex(index)} style={styles.thumb}>
            <Image source={{ uri: img.uri }} style={styles.thumbImage} contentFit="cover" />
          </Pressable>
        ))}
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
});
