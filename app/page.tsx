'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const userSession = {
      id_cuenta: 'CUENTA_DEMO_123',
      nombre: isRegister ? nombre : 'Usuario ATOM',
      email: email,
      rol: 'ADMIN'
    };

    localStorage.setItem('atom_user_session', JSON.stringify(userSession));

    setTimeout(() => {
      setLoading(false);
      router.push('/reportes');
    }, 800);
  };

  return (
    <div className="min-h-screen w-full bg-[#1c2633] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-[#233041] rounded-2xl p-8 shadow-2xl border border-slate-700/50">
        
        {/* ENCABEZADO / LOGO ATOM STOCK */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-wider text-white">
            ATOM <span className="text-[#0DE8C0]">STOCK</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isRegister ? 'Registro de Nueva Cuenta' : 'Suite de Control Multibodega Omnicanal'}
          </p>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {isRegister && (
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                Nombre Completo
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Leonardo Villamizar"
                className="w-full bg-[#17212e] border border-slate-700 focus:border-[#0DE8C0] text-sm text-white rounded-xl p-3.5 focus:outline-none transition"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
              Usuario / Correo
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@atomstock.com"
              className="w-full bg-[#17212e] border border-slate-700 focus:border-[#0DE8C0] text-sm text-white rounded-xl p-3.5 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#17212e] border border-slate-700 focus:border-[#0DE8C0] text-sm text-white rounded-xl p-3.5 focus:outline-none transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0DE8C0] hover:bg-[#0bcba8] text-[#131c27] font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition shadow-lg disabled:opacity-50 mt-2"
          >
            {loading
              ? 'PROCESANDO...'
              : isRegister
              ? 'CREAR CUENTA'
              : 'INGRESAR'}
          </button>
        </form>

        {/* OPCIÓN PARA CREAR CUENTA / INICIAR SESIÓN */}
        <div className="text-center text-xs text-slate-400 mt-6">
          {isRegister ? (
            <p>
              ¿Ya tienes una cuenta?{' '}
              <button
                type="button"
                onClick={() => setIsRegister(false)}
                className="text-[#0DE8C0] font-bold hover:underline ml-1"
              >
                Inicia sesión
              </button>
            </p>
          ) : (
            <p>
              ¿No tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => setIsRegister(true)}
                className="text-[#0DE8C0] font-bold hover:underline ml-1"
              >
                Regístrate / Crear cuenta
              </button>
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
