'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Guardar sesión simulada
    const userSession = {
      id_cuenta: 'CUENTA_DEMO_123',
      nombre: 'Leonardo Villamizar',
      email: email || 'admin@atomstock.com',
      rol: 'ADMIN'
    };

    localStorage.setItem('atom_user_session', JSON.stringify(userSession));

    setTimeout(() => {
      setLoading(false);
      router.push('/reportes');
    }, 800);
  };

  return (
    <div className="min-h-screen w-full bg-[#1D2935] flex items-center justify-center p-4 font-sans fixed inset-0 overflow-y-auto">
      <div className="bg-[#253443] border border-slate-700/60 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
        
        {/* ENCABEZADO LOGO */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            ATOM <span className="text-[#0DE8C0]">STOCK</span>
          </h1>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Suite de Control Multibodega Omnicanal
          </p>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-satoshi-black text-slate-300 uppercase mb-2 tracking-wider">
              Usuario / Correo
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@atomstock.com"
              className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] text-xs text-white rounded-xl p-3 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-satoshi-black text-slate-300 uppercase mb-2 tracking-wider">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] text-xs text-white rounded-xl p-3 focus:outline-none transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3.5 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-[#0DE8C0]/10 disabled:opacity-50 mt-2"
          >
            {loading ? 'INGRESANDO...' : 'INGRESAR'}
          </button>
        </form>

      </div>
    </div>
  );
}