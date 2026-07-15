// Shared types for the content calendar feature.
//
// Content items represent scheduled social/marketing content that partners
// import (via CSV) and manage on a monthly calendar. Each item carries a
// `content_type` describing the media format so the calendar can badge it and
// the sidebar can edit it.

export const CONTENT_TYPES = [
  'video',
  'still_image',
  'carousel',
  'animated_flyer',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/** Human-readable label for each content type. */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video: 'Video',
  still_image: 'Still Image',
  carousel: 'Carousel',
  animated_flyer: 'Animated Flyer',
};

/**
 * Accent color per content type. Used for calendar badges and the sidebar so a
 * given format is visually consistent across the UI.
 */
export const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  video: '#E11D48', // rose
  still_image: '#2563EB', // blue
  carousel: '#7C3AED', // violet
  animated_flyer: '#D97706', // amber
};

/** Short emoji glyph per content type for compact calendar cells. */
export const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  video: '🎬',
  still_image: '🖼️',
  carousel: '🎠',
  animated_flyer: '✨',
};

/**
 * Normalize a free-form CSV value into a known ContentType.
 * Accepts labels ("Still Image"), slugs ("still_image"), and common synonyms
 * ("image", "photo", "reel", "gif"). Returns null when it can't be mapped.
 */
export function parseContentType(raw: string | undefined | null): ContentType | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');

  const map: Record<string, ContentType> = {
    video: 'video',
    reel: 'video',
    reels: 'video',
    movie: 'video',
    still_image: 'still_image',
    still: 'still_image',
    image: 'still_image',
    images: 'still_image',
    photo: 'still_image',
    picture: 'still_image',
    graphic: 'still_image',
    carousel: 'carousel',
    slideshow: 'carousel',
    album: 'carousel',
    gallery: 'carousel',
    animated_flyer: 'animated_flyer',
    animated: 'animated_flyer',
    flyer: 'animated_flyer',
    gif: 'animated_flyer',
    animation: 'animated_flyer',
  };

  return map[normalized] ?? null;
}

export interface ContentItem {
  id: string;
  title: string;
  contentType: ContentType;
  scheduledDate: string; // YYYY-MM-DD
  caption: string;
  status: string; // 'draft' | 'scheduled' | 'published'
  mediaUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
