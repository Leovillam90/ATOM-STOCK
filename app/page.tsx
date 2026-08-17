'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push('/productos');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh] text-slate-400">
      Cargando panel de administración...
    </div>
  );
}