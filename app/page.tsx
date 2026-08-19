'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function PerfilPage() {
  // ==========================================
  // ESTADOS Y VARIABLES
  // ==========================================
  const [userAuth, setUserAuth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'perfil' | 'legales'>('perfil');

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

  // Formulario Perfil
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [indicativoPais, setIndicativoPais] = useState(''); // Inicia vacío para obligar selección
  const [telefono, setTelefono] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [rol, setRol] = useState('ADMIN');

  // Modal Seguridad
  const [showPassModal, setShowPassModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // ==========================================
  // EFECTOS (CARGA INICIAL)
  // ==========================================
  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUserAuth(parsed);
        cargarDatosPerfil(parsed);
      } catch (e) {
        console.error('Error procesando la sesión local:', e);
      }
    }
  }, []);

  const cargarDatosPerfil = async (session: any) => {
    // 1. Carga rápida desde caché (Optimización de UX)
    setNombre(session.nombre || '');
    setEmail(session.email || session.user || '');
    setRol(session.rol || 'ADMIN');
    if (session.indicativo_pais) setIndicativoPais(session.indicativo_pais);
    if (session.telefono) setTelefono(String(session.telefono).replace(/\D/g, ''));

    // 2. Consulta a Firestore para garantizar datos frescos
    try {
      if (!session.id_usuario) return;

      const docUserRef = doc(db, 'usuarios', session.id_usuario);
      const docUserSnap = await getDoc(docUserRef);

      if (docUserSnap.exists()) {
        const data = docUserSnap.data();

        const nombreReal = data.nombre || session.nombre || '';
        const emailReal = data.email || data.user || session.email || '';
        const rolReal = data.rol || session.rol || 'ADMIN';
        const indicativoReal = data.indicativo_pais || session.indicativo_pais || ''; 
        
        // Sanitización estricta del número entrante
        const telReal = String(data.telefono || session.telefono || '').replace(/\D/g, '');

        setNombre(nombreReal);
        setEmail(emailReal);
        setRol(rolReal);
        setIndicativoPais(indicativoReal); 
        setTelefono(telReal);

        // Actualización de sesión para sincronizar DB con LocalStorage
        const sessionActualizada = {
          ...session,
          nombre: nombreReal,
          email: emailReal,
          rol: rolReal,
          indicativo_pais: indicativoReal,
          telefono: telReal
        };
        
        setUserAuth(sessionActualizada);
        localStorage.setItem('atom_user_session', JSON.stringify(sessionActualizada));
      }
    } catch (err: any) {
      // Ignorar AbortError nativo de Next.js StrictMode
      if (err.name === 'AbortError' || err.message?.includes('abort')) return;
      console.error('Error al sincronizar perfil con DB:', err);
    }
  };

  // ==========================================
  // FUNCIONES DE GUARDADO Y VALIDACIÓN
  // ==========================================
  const handleSavePerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones estrictas de Input
    if (!nombre.trim()) return alert('Por favor ingresa tu nombre.');
    if (!indicativoPais) return alert('Por favor selecciona el indicativo de tu país.'); 
    if (!telefono.trim()) return alert('Por favor ingresa tu número de teléfono.');

    setLoading(true);
    try {
      const numClean = telefono.trim().replace(/\D/g, '');

      // Guardar en Usuarios (Seguro con merge: true)
      if (userAuth?.id_usuario) {
        const userRef = doc(db, 'usuarios', userAuth.id_usuario);
        await setDoc(userRef, {
          nombre: nombre.trim(),
          telefono: numClean,
          indicativo_pais: indicativoPais,
          fecha_actualizacion: new Date().toISOString()
        }, { merge: true });
      }

      // Propagar actualización a Cuentas si aplica
      if (userAuth?.id_cuenta && userAuth?.rol === 'ADMIN') {
        const ctaRef = doc(db, 'cuentas', userAuth.id_cuenta);
        await setDoc(ctaRef, {
          telefono_contacto: numClean,
          indicativo_pais: indicativoPais,
          fecha_actualizacion: new Date().toISOString()
        }, { merge: true });
      }

      // Sincronizar memoria caché
      const updatedSession = { ...userAuth, nombre: nombre.trim(), telefono: numClean, indicativo_pais: indicativoPais };
      setUserAuth(updatedSession);
      localStorage.setItem('atom_user_session', JSON.stringify(updatedSession));

      alert('¡Perfil actualizado correctamente!');
    } catch (err: any) {
      console.error('Error al guardar:', err);
      alert('Error al guardar perfil: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones de seguridad
    if (!currentPass.trim() || !newPass.trim()) return alert('Llena todos los campos de contraseña.');
    if (newPass.length < 6) return alert('La nueva contraseña debe tener al menos 6 caracteres.');
    if (newPass !== confirmPass) return alert('Las contraseñas no coinciden.');

    setSavingPass(true);
    try {
      if (!userAuth?.id_usuario) throw new Error('Sesión inválida.');
      
      const userRef = doc(db, 'usuarios', userAuth.id_usuario);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        
        // Verificación de credenciales (TODO: Migrar a Hash/FirebaseAuth a futuro)
        if ((data.pass || data.PASS || '') !== currentPass.trim()) {
          setSavingPass(false);
          return alert('La contraseña actual es incorrecta.');
        }

        await setDoc(userRef, { 
          pass: newPass.trim(), 
          fecha_actualizacion: new Date().toISOString() 
        }, { merge: true });

        alert('¡Contraseña actualizada correctamente!');
        setShowPassModal(false);
        setCurrentPass(''); 
        setNewPass(''); 
        setConfirmPass('');
      }
    } catch (err: any) {
      console.error('Error actualizando contraseña:', err);
      alert('Error del sistema: ' + err.message);
    } finally {
      setSavingPass(false);
    }
  };

  // ==========================================
  // RENDERIZADO UI
  // ==========================================
  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA */}
      <div className="mb-8 border-b border-slate-700/60 pb-6">
        <h1 className="text-3xl font-black text-white font-satoshi-black">Perfil y Configuración</h1>
        <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular">
          Gestiona tus credenciales de acceso y la información legal de tu empresa.
        </p>
      </div>

      {/* SISTEMA DE PESTAÑAS (TABS) */}
      <div className="flex items-center gap-6 border-b border-slate-700/60 mb-8">
        <button
          onClick={() => setActiveTab('perfil')}
          className={`pb-3 text-xs font-satoshi-black tracking-wider uppercase transition-colors relative flex items-center gap-2 ${
            activeTab === 'perfil' ? 'text-[#0DE8C0]' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Perfil de Usuario
          {activeTab === 'perfil' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#0DE8C0] rounded-t-md"></span>}
        </button>

        <button
          onClick={() => setActiveTab('legales')}
          className={`pb-3 text-xs font-satoshi-black tracking-wider uppercase transition-colors relative flex items-center gap-2 ${
            activeTab === 'legales' ? 'text-[#0DE8C0]' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Datos Legales y Fiscales
          {activeTab === 'legales' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#0DE8C0] rounded-t-md"></span>}
        </button>
      </div>

      <div className="max-w-3xl space-y-6">
        
        {/* CONTENIDO PESTAÑA: PERFIL */}
        {activeTab === 'perfil' && (
          <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-6 md:p-8 shadow-xl space-y-6 animate-in fade-in">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-700/60">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#0DE8C0] to-purple-600 flex items-center justify-center font-satoshi-black text-white text-xl shadow-lg">
                {nombre ? nombre.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h2 className="text-lg font-black text-white font-satoshi-black uppercase">{nombre || 'Usuario'}</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{email}</p>
              </div>
            </div>

            <form onSubmit={handleSavePerfil} className="space-y-5">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Nombre Completo *</label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Correo Electrónico de Acceso</label>
                <input
                  type="email"
                  className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-3 text-xs text-slate-400 font-mono cursor-not-allowed opacity-70"
                  value={email}
                  disabled
                />
              </div>

              {/* SELECTOR DE PAÍSES Y TELÉFONO */}
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Teléfono de Contacto *</label>
                <div className="flex items-center gap-2">
                  <select
                    className={`bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs font-mono font-bold focus:outline-none cursor-pointer shrink-0 ${!indicativoPais ? 'text-slate-400' : 'text-[#0DE8C0]'}`}
                    value={indicativoPais}
                    onChange={(e) => setIndicativoPais(e.target.value)}
                    required
                  >
                    <option value="" disabled className="bg-[#1D2935] text-slate-500">Seleccionar...</option>
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
                    required
                  />
                </div>
              </div>

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
                  className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3 rounded-xl text-xs uppercase transition shadow-lg disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* CONTENIDO PESTAÑA: LEGALES */}
        {activeTab === 'legales' && (
          <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-6 md:p-8 shadow-xl animate-in fade-in">
            <h2 className="text-lg font-black text-white font-satoshi-black uppercase mb-4">Información de la Empresa</h2>
            <p className="text-xs text-slate-400 mb-6">
              Los datos ingresados aquí se utilizarán para la facturación electrónica y comprobantes de venta.
            </p>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Razón Social / Nombre Comercial</label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 rounded-xl p-3 text-xs text-slate-400 cursor-not-allowed opacity-70"
                  value={userAuth?.empresa || ''}
                  disabled
                />
              </div>
              <div className="p-4 bg-blue-900/20 border border-blue-800/40 rounded-xl text-xs text-blue-300">
                🚀 Módulo de configuración fiscal y facturación electrónica próximamente disponible.
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL CAMBIO DE CONTRASEÑA */}
      {showPassModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">Cambiar Contraseña</h3>
              <button onClick={() => setShowPassModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">Contraseña Actual</label>
                <input type="password" required value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white" />
              </div>
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">Nueva Contraseña</label>
                <input type="password" required value={newPass} onChange={(e) => setNewPass(e.target.value)} className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white" />
              </div>
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">Confirmar Contraseña</label>
                <input type="password" required value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white" />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-700/60">
                <button type="button" onClick={() => setShowPassModal(false)} className="flex-1 bg-[#1D2935] text-slate-300 py-3 rounded-xl text-xs uppercase hover:bg-slate-800">Cancelar</button>
                <button type="submit" disabled={savingPass} className="flex-1 bg-[#0DE8C0] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase shadow-lg disabled:opacity-50">Actualizar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}