'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Campos de Formulario
  const [tipoDoc, setTipoDoc] = useState('NIT');
  const [numDoc, setNumDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const emailClean = email.trim().toLowerCase();
    const docClean = numDoc.trim();

    try {
      if (isRegister) {
        // ==========================================
        // 1. PROCESO DE REGISTRO DE NUEVA EMPRESA
        // ==========================================
        if (!nombre.trim() || !emailClean || !password || !docClean) {
          setLoading(false);
          return alert('Por favor completa todos los campos del registro.');
        }

        // Generar IDs únicos para la cuenta, usuario y sucursal
        const idCuentaGen = `CTA_${Date.now().toString().slice(-8)}`;
        const idUsuarioGen = `USR_${Date.now().toString().slice(-8)}`;
        const idSucursalGen = `SUC_PRINCIPAL_${Date.now().toString().slice(-4)}`;

        // A. Crear documento de la Cuenta Corporativa
        await setDoc(doc(db, 'cuentas', idCuentaGen), {
          id_cuenta: idCuentaGen,
          nombre_empresa: nombre.trim(),
          nit: docClean,
          tipo_doc: tipoDoc,
          email_contacto: emailClean,
          fecha_creacion: new Date().toISOString(),
          estado: 'ACTIVO'
        });

        // B. Crear Sucursal Principal por Defecto
        await setDoc(doc(db, 'sucursales', idSucursalGen), {
          id_cuenta: idCuentaGen,
          id_sucursal: idSucursalGen,
          nombre: 'Sede Principal',
          direccion: 'Dirección Principal',
          ciudad: 'Cali',
          estado: 'ACTIVO',
          fecha_creacion: new Date().toISOString()
        });

        // C. Crear Usuario Administrador
        const usuarioAdminObj = {
          id_cuenta: idCuentaGen,
          id_usuario: idUsuarioGen,
          id_sucursal: idSucursalGen,
          nombre: nombre.trim(),
          email: emailClean,
          password: password, // En entorno de producción se recomienda hashing
          rol: 'ADMIN',
          tipo_doc: tipoDoc,
          num_doc: docClean,
          estado: 'ACTIVO',
          fecha_creacion: new Date().toISOString()
        };

        await setDoc(doc(db, 'usuarios', idUsuarioGen), usuarioAdminObj);

        // D. Iniciar sesión en LocalStorage
        const userSession = {
          id_cuenta: idCuentaGen,
          id_usuario: idUsuarioGen,
          id_sucursal: idSucursalGen,
          nombre: nombre.trim(),
          email: emailClean,
          rol: 'ADMIN',
          tipo_doc: tipoDoc,
          num_doc: docClean
        };

        localStorage.setItem('atom_user_session', JSON.stringify(userSession));
        alert('¡Empresa y cuenta de administrador creadas con éxito!');
        router.push('/reportes');

      } else {
        // ==========================================
        // 2. PROCESO DE INICIO DE SESIÓN
        // ==========================================
        if (!emailClean || !password) {
          setLoading(false);
          return alert('Ingresa tu correo y clave de acceso.');
        }

        // Buscar usuario en Firestore por email
        const qUser = query(
          collection(db, 'usuarios'),
          where('email', '==', emailClean)
        );

        const snapUser = await getDocs(qUser);

        if (snapUser.empty) {
          setLoading(false);
          return alert('Usuario no encontrado. Verifica el correo o crea una cuenta nueva.');
        }

        const userDocData = snapUser.docs[0].data();

        // Validar contraseña
        if (userDocData.password !== password) {
          setLoading(false);
          return alert('Contraseña incorrecta. Inténtalo de nuevo.');
        }

        // Guardar sesión del usuario encontrado
        const userSession = {
          id_cuenta: userDocData.id_cuenta,
          id_usuario: userDocData.id_usuario || snapUser.docs[0].id,
          id_sucursal: userDocData.id_sucursal || '',
          nombre: userDocData.nombre || 'Usuario ATOM',
          email: userDocData.email,
          rol: userDocData.rol || 'ADMIN',
          tipo_doc: userDocData.tipo_doc || 'NIT',
          num_doc: userDocData.num_doc || ''
        };

        localStorage.setItem('atom_user_session', JSON.stringify(userSession));
        router.push('/reportes');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error en el proceso: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#111823] flex font-sans text-white relative overflow-hidden p-0 md:p-4 lg:p-6">
      
      <div className="w-full h-full min-h-[calc(100vh-2rem)] flex flex-col lg:flex-row rounded-none md:rounded-3xl overflow-hidden border border-slate-800/80 shadow-2xl bg-[#1a2332]">
        
        {/* LADO IZQUIERDO: BRANDING E IMAGEN DE AMBIENTE */}
        <div className="hidden lg:flex w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-[#0d131f]">
          
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity scale-105"
            style={{ 
              backgroundImage: `url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=1600&auto=format&fit=crop')` 
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-[#0d131f] via-[#0d131f]/70 to-transparent" />
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#0DE8C0]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* CABECERA BRANDING LOGO */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0DE8C0] to-purple-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-[#0DE8C0]/20">
              A
            </div>
            <div>
              <span className="text-xl font-black tracking-wider text-white font-mono block leading-none">
                ATOM <span className="text-[#0DE8C0]">STOCK</span>
              </span>
              <span className="text-[10px] text-slate-400 tracking-widest uppercase font-mono">
                SUITE OMNICANAL
              </span>
            </div>
          </div>

          {/* MENSAJE DE IMPACTO */}
          <div className="relative z-10 max-w-md space-y-6 my-auto">
            <div className="inline-flex items-center gap-2 bg-[#1a2332]/90 border border-[#0DE8C0]/30 px-3 py-1.5 rounded-full backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse" />
              <span className="text-xs font-mono text-[#0DE8C0]">Control Total Multibodega v1.0</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
              Potencia tu inventario y sincroniza tus ventas en tiempo real.
            </h1>

            <p className="text-xs text-slate-300 leading-relaxed">
              Conecta tus tiendas físicas y canales digitales (Dropi, Véndelo, Shopify) centralizando stock, despachos y facturación electrónica.
            </p>

            <div className="bg-[#1a2332]/80 border border-slate-700/60 backdrop-blur-md p-4 rounded-2xl flex items-center justify-between text-xs space-x-4">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-mono">Sincronización</span>
                <span className="font-bold text-[#0DE8C0]">Omnicanal 100%</span>
              </div>
              <div className="h-8 w-px bg-slate-700" />
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-mono">Facturación</span>
                <span className="font-bold text-white">Cumplimiento DIAN</span>
              </div>
              <div className="h-8 w-px bg-slate-700" />
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-mono">Inventario</span>
                <span className="font-bold text-purple-400">Multibodega</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 text-[10px] text-slate-500 font-mono">
            © 2026 ATOM STOCK · Todos los derechos reservados.
          </div>
        </div>

        {/* LADO DERECHO: FORMULARIO DE ACCESO / REGISTRO */}
        <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 bg-[#1a2332] relative">
          
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="w-8 h-8 rounded-lg bg-[#0DE8C0]/20 text-[#0DE8C0] font-black flex items-center justify-center text-xs">
                A
              </div>
              <span className="font-bold text-sm text-white">ATOM STOCK</span>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button 
                type="button" 
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 bg-[#111823] px-3 py-1.5 rounded-full border border-slate-700/60 transition"
              >
                <svg className="w-3.5 h-3.5 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Soporte</span>
              </button>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto space-y-8 my-auto py-8">
            
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">
                {isRegister ? 'Registro de Empresa' : 'Bienvenido, ingresa tus datos'}
              </h2>
              <p className="text-xs text-slate-400">
                {isRegister
                  ? 'Crea tu cuenta corporativa para administrar bodegas y puntos de venta.'
                  : 'Ingresa la información de tu negocio para acceder a la plataforma.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* TIPO Y NÚMERO DE DOCUMENTO DE LA EMPRESA */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-5 relative border-b border-slate-700 focus-within:border-[#0DE8C0] transition-colors pb-1">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                    Documento
                  </label>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-slate-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <select
                      value={tipoDoc}
                      onChange={(e) => setTipoDoc(e.target.value)}
                      className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-2"
                    >
                      <option value="NIT" className="bg-[#111823] text-white">NIT Empresa</option>
                      <option value="CC" className="bg-[#111823] text-white">Cédula Ciudadanía</option>
                      <option value="CE" className="bg-[#111823] text-white">Cédula Extranjería</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-7 relative border-b border-slate-700 focus-within:border-[#0DE8C0] transition-colors pb-1">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                    Número de Documento
                  </label>
                  <input
                    type="text"
                    required
                    value={numDoc}
                    onChange={(e) => setNumDoc(e.target.value)}
                    placeholder="901234567"
                    className="w-full bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* CAMPO DE NOMBRE COMPLETO (SOLO SI SE REGISTRA) */}
              {isRegister && (
                <div className="relative border-b border-slate-700 focus-within:border-[#0DE8C0] transition-colors pb-1">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                    Nombre del Administrador / Empresa
                  </label>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-slate-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <input
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Leonardo Villamizar"
                      className="w-full bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* CAMPO DE USUARIO Y CLAVE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* USUARIO / CORREO */}
                <div className="relative border-b border-slate-700 focus-within:border-[#0DE8C0] transition-colors pb-1">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                    Usuario / Correo
                  </label>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-slate-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@empresa.com"
                      className="w-full bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* CLAVE */}
                <div className="relative border-b border-slate-700 focus-within:border-[#0DE8C0] transition-colors pb-1">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                    Clave de Acceso
                  </label>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-slate-500 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none pr-6"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-500 hover:text-[#0DE8C0] transition ml-1"
                    >
                      {showPassword ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

              </div>

              {!isRegister && (
                <div className="flex justify-between items-center text-[11px] pt-1">
                  <label className="flex items-center text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="rounded bg-[#111823] border-slate-700 text-[#0DE8C0] focus:ring-0 mr-2 w-3.5 h-3.5"
                    />
                    Recordar sesión
                  </label>

                  <button
                    type="button"
                    className="text-slate-400 hover:text-[#0DE8C0] transition font-medium underline underline-offset-2"
                  >
                    ¿Olvidaste tu clave?
                  </button>
                </div>
              )}

              {/* BOTÓN PRINCIPAL DINÁMICO */}
              <div className="pt-4 space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-[#0DE8C0] to-[#0bcfa8] hover:from-[#0bcfa8] hover:to-[#09b897] text-[#0d131f] font-black py-3.5 rounded-full text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-[#0DE8C0]/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span>{isRegister ? 'Registrando empresa...' : 'Iniciando sesión...'}</span>
                  ) : (
                    <>
                      <span>{isRegister ? 'Registrar Empresa' : 'Iniciar sesión'}</span>
                      <svg className="w-4 h-4 text-[#0d131f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>

                {/* BOTÓN DE CAMBIO DE MODO (LOGIN / REGISTRO) */}
                <button
                  type="button"
                  onClick={() => setIsRegister(!isRegister)}
                  className="w-full bg-[#111823] hover:bg-[#151f2e] text-slate-300 border border-slate-700 font-bold py-3 rounded-full text-xs transition flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span>{isRegister ? '¿Ya tienes cuenta? Inicia Sesión' : 'Crear una cuenta nueva'}</span>
                </button>
              </div>

            </form>

          </div>

          <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 pt-6 border-t border-slate-800/60 gap-2">
            <div className="flex gap-3">
              <a href="#" className="hover:text-slate-300 transition">Términos de servicio</a>
              <span>·</span>
              <a href="#" className="hover:text-slate-300 transition">Políticas de privacidad</a>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Conexión segura SSL</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
