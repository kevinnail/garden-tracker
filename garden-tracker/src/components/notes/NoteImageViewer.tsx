import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';

import { NoteImage } from '@/src/types';

interface Props {
  images: NoteImage[];
  initialIndex: number;
  onClose: () => void;
}

export default function NoteImageViewer({ images, initialIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const { width, height } = useWindowDimensions();

  const current = images[currentIndex];
  if (!current) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Image
          source={{ uri: current.uri }}
          style={{ width, height }}
          contentFit="contain"
        />

        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>

        {images.length > 1 && (
          <View style={styles.navRow}>
            <Pressable
              style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
              onPress={() => currentIndex > 0 && setCurrentIndex(i => i - 1)}
              hitSlop={16}
            >
              <Text style={styles.navBtnText}>‹</Text>
            </Pressable>

            <Text style={styles.pageIndicator}>{currentIndex + 1} / {images.length}</Text>

            <Pressable
              style={[styles.navBtn, currentIndex === images.length - 1 && styles.navBtnDisabled]}
              onPress={() => currentIndex < images.length - 1 && setCurrentIndex(i => i + 1)}
              hitSlop={16}
            >
              <Text style={styles.navBtnText}>›</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  navRow: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 34,
  },
  pageIndicator: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
    minWidth: 44,
    textAlign: 'center',
  },
});
