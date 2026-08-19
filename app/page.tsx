'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function PerfilPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // LISTA EXCLUSIVA DE 11 PAÍSES LATAM
  const paisesLatam = [
    { codigo: '+57', nombre: 'Colombia (+57)', bandera: '🇨🇴' },
    { codigo: '+593', nombre: 'Ecuador (+593)', bandera: '🇪🇨' },
    { codigo: '+52', nombre: 'México (+52)', bandera: '🇲🇽' },
    { codigo: '+595', nombre: 'Paraguay (+595)', bandera: '🇵🇾' },
    { codigo: '+51', nombre: 'Perú (+51)', bandera: '🇵🇪' },
    { codigo: '+56', nombre: 'Chile (+56)', bandera: '🇨🇱' },
    { codigo: '+507', nombre: 'Panamá (+507)', bandera: '🇵🇦' },
    { codigo: '+502', nombre: 'Guatemala (+502)', bandera: '🇬🇹' },
    { codigo: '+55', nombre: 'Brasil (+55)', bandera: '🇧🇷' },
    { codigo: '+54', nombre: 'Argentina (+54)', bandera: '🇦🇷' },
    { codigo: '+58', nombre: 'Venezuela (+58)', bandera: '🇻🇪' },
  ];

  // Campos del Formulario de Perfil
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [indicativoPais, setIndicativoPais] = useState('+57');
  const [telefono, setTelefono] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [rol, setRol] = useState('ADMIN');

  // Modal para cambio de contraseña
  const [showPassModal, setShowPassModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // FUNCIÓN DE LIMPIEZA PROFUNDA DE TELÉFONOS (Extrae el número local sin el indicativo)
  const extraerNumeroLocal = (telRaw: string, indicativoActual: string) => {
    if (!telRaw) return '';
    let str = String(telRaw).trim();

    // Remover todos los indicativos de LATAM conocidos si están al inicio
    const codigos = ['+593', '+507', '+506', '+502', '+503', '+504', '+505', '+591', '+595', '+598', '+57', '+52', '+54', '+56', '+51', '+58', '+55', '+1'];
    
    let huboCambio = true;
    while (huboCambio) {
      huboCambio = false;
      for (const cod of codigos) {
        if (str.startsWith(cod)) {
          str = str.slice(cod.length).trim();
          huboCambio = true;
          break;
        }
      }
    }

    // Extraer solo los dígitos restantes
    let digitos = str.replace(/\D/g, '');

    // Caso especial Colombia: Si empieza con 57 y tiene 12 dígitos (ej: 573138712634), quitar el 57 inicial
    if (indicativoActual === '+57' && digitos.startsWith('57') && digitos.length === 12) {
      digitos = digitos.slice(2);
    }

    return digitos;
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUserAuth(parsed);
      cargarDatosPerfil(parsed);
    }
  }, []);

  const cargarDatosPerfil = async (session: any) => {
    setNombre(session.nombre || '');
    setEmail(session.email || session.user || '');
    setEmpresa(session.empresa || 'ATOM STOCK');
    setRol(session.rol || 'ADMIN');

    try {
      if (session.id_usuario) {
        const docUserRef = doc(db, 'usuarios', session.id_usuario);
        const docUserSnap = await getDoc(docUserRef);

        if (docUserSnap.exists()) {
          const data = docUserSnap.data();
          setNombre(data.nombre || session.nombre || '');
          setEmail(data.email || data.user || session.email || '');
          setRol(data.rol || session.rol || 'ADMIN');

          const ind = data.indicativo_pais || session.indicativo_pais || '+57';
          setIndicativoPais(ind);

          const rawTel = data.telefono || session.telefono || '';
          setTelefono(extraerNumeroLocal(rawTel, ind));
        } else {
          const ind = session.indicativo_pais || '+57';
          setIndicativoPais(ind);
          setTelefono(extraerNumeroLocal(session.telefono || '', ind));
        }
      }
    } catch (err) {
      console.error('Error al cargar perfil:', err);
    }
  };

  const handleSavePerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return alert('Por favor ingresa tu nombre.');

    setLoading(true);
    try {
      // Extraer únicamente los dígitos limpios sin prefijo
      const numLimpio = extraerNumeroLocal(telefono, indicativoPais);

      // 1. Actualizar en la colección de usuarios
      if (userAuth?.id_usuario) {
        const userRef = doc(db, 'usuarios', userAuth.id_usuario);
        await setDoc(
          userRef,
          {
            nombre: nombre.trim(),
            telefono: numLimpio,
            indicativo_pais: indicativoPais,
            fecha_actualizacion: new Date().toISOString()
          },
          { merge: true }
        );
      }

      // 2. Actualizar en la colección de cuentas si es Administrador
      if (userAuth?.id_cuenta && userAuth?.rol === 'ADMIN') {
        const ctaRef = doc(db, 'cuentas', userAuth.id_cuenta);
        await setDoc(
          ctaRef,
          {
            nombre_empresa: empresa.trim(),
            telefono_contacto: numLimpio,
            indicativo_pais: indicativoPais,
            fecha_actualizacion: new Date().toISOString()
          },
          { merge: true }
        );
      }

      // 3. Actualizar la sesión activa en localStorage
      const updatedSession = {
        ...userAuth,
        nombre: nombre.trim(),
        empresa: empresa.trim(),
        telefono: numLimpio,
        indicativo_pais: indicativoPais
      };

      setUserAuth(updatedSession);
      localStorage.setItem('atom_user_session', JSON.stringify(updatedSession));

      // Actualizar el estado local con el número limpio
      setTelefono(numLimpio);

      alert('¡Perfil y teléfono de contacto corregidos y actualizados con éxito!');
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar perfil: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass.trim() || !newPass.trim()) {
      return alert('Ingresa tu contraseña actual y la nueva contraseña.');
    }

    if (newPass.length < 6) {
      return alert('La nueva contraseña debe tener al menos 6 caracteres.');
    }

    if (newPass !== confirmPass) {
      return alert('La nueva contraseña y la confirmación no coinciden.');
    }

    setSavingPass(true);
    try {
      if (!userAuth?.id_usuario) throw new Error('Sesión inválida.');

      const userRef = doc(db, 'usuarios', userAuth.id_usuario);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        const passValida = (data.pass || data.PASS || '') === currentPass.trim();

        if (!passValida) {
          setSavingPass(false);
          return alert('La contraseña actual es incorrecta.');
        }

        await setDoc(
          userRef,
          {
            pass: newPass.trim(),
            fecha_actualizacion: new Date().toISOString()
          },
          { merge: true }
        );

        alert('¡Contraseña de acceso actualizada correctamente!');
        setShowPassModal(false);
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error al actualizar contraseña: ' + err.message);
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Seguridad & Configuración de Cuenta
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Perfil de Usuario
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Administra tus datos de contacto corporativos y tus credenciales de acceso al sistema ATOM STOCK.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* TARJETA PRINCIPAL DE DATOS DE PERFIL */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-6 md:p-8 shadow-xl space-y-6">
          <div className="flex items-center gap-4 pb-4 border-b border-slate-700/60">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#0DE8C0] to-purple-600 flex items-center justify-center font-satoshi-black text-white text-xl shadow-lg">
              {nombre ? nombre.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 className="text-lg font-black text-white font-satoshi-black uppercase">
                {nombre || 'Usuario ATOM'}
              </h2>
              <p className="text-xs text-[#0DE8C0] font-satoshi-black uppercase tracking-wider">
                {rol === 'ADMIN' ? 'ADMINISTRADOR GENERAL (ADM)' : rol}
              </p>
              <p className="text-[11px] text-[#A0AEC0] font-mono mt-0.5">
                Empresa: {empresa}
              </p>
            </div>
          </div>

          <form onSubmit={handleSavePerfil} className="space-y-5">
            <div>
              <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                Nombre Completo *
              </label>
              <input
                type="text"
                className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                Correo Electrónico de Acceso
              </label>
              <input
                type="email"
                className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-3 text-xs text-slate-400 font-mono focus:outline-none cursor-not-allowed opacity-70"
                value={email}
                disabled
              />
            </div>

            {/* TELÉFONO CON SELECTOR DE PAÍS E INPUT LIMPIO */}
            <div>
              <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                Teléfono de Contacto
              </label>
              <div className="flex items-center gap-2">
                <select
                  className="bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs font-mono font-bold text-[#0DE8C0] focus:outline-none cursor-pointer shrink-0"
                  value={indicativoPais}
                  onChange={(e) => setIndicativoPais(e.target.value)}
                >
                  {paisesLatam.map((p) => (
                    <option key={p.codigo} value={p.codigo} className="bg-[#1D2935] text-white">
                      {p.bandera} {p.codigo}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-mono"
                  placeholder="313 871 2634"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
            </div>

            {rol === 'ADMIN' && (
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Nombre de la Empresa / Organización
                </label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setShowPassModal(true)}
                className="text-xs text-[#0DE8C0] hover:underline font-satoshi-black flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z" />
                </svg>
                <span>Cambiar Contraseña de Acceso</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>

      </div>

      {/* MODAL CAMBIO DE CONTRASEÑA */}
      {showPassModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">Cambiar Contraseña</h3>
              <button onClick={() => setShowPassModal(false)} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Contraseña Actual *
                </label>
                <input
                  type="password"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-mono"
                  placeholder="••••••••••••"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Nueva Contraseña *
                </label>
                <input
                  type="password"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-mono"
                  placeholder="Mínimo 6 caracteres"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Confirmar Nueva Contraseña *
                </label>
                <input
                  type="password"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-mono"
                  placeholder="Repite la nueva contraseña"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPass}
                  className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg disabled:opacity-50 transition"
                >
                  {savingPass ? 'Actualizando...' : 'Actualizar Clave'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
