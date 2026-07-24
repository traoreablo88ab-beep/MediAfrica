import { ImageResponse } from 'next/og';

export const alt = 'MediAfrica — gestion de centre de santé';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Text-only card matching the app's brand palette (#2a78d6 accent on
// #f9f9f7) — avoids fetching a custom font/logo asset just for a social
// preview image.
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9f9f7',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 88,
            height: 88,
            borderRadius: 20,
            backgroundColor: '#2a78d6',
            color: '#ffffff',
            fontSize: 48,
            fontWeight: 700,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          M
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, color: '#0b0b0b' }}>MediAfrica</div>
      </div>
      <div style={{ marginTop: 28, fontSize: 30, color: '#52514e' }}>
        Gestion de centre de santé — dossiers, consultations, file d’attente
      </div>
    </div>,
    { ...size },
  );
}
