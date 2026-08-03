'use client';
import { useEffect } from 'react';
export default function RedirectPage() {
  useEffect(() => { window.location.href = '/'; }, []);
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <p style={{ color: '#666', fontSize: '14px' }}>Yönlendiriliyor...</p>
    </div>
  );
}