'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { MONEDAS } from '@/lib/moneda';
import '@/app/globals.css';

export default function PerfilPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'PERFIL' | 'LEGALES'>('PERFIL');
  
  const [originalData, setOriginalData] = useState<any>(null);

  // LISTA EXCLUSIVA DE 11 PAÍSES LATAM CON BANDERAS
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

  // Formulario Perfil de Usuario
  const [nombre, setNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [prefijoPais, setPrefijoPais] = useState(''); 
  const [telefono, setTelefono] = useState('');

  // Módulo Seguridad Colapsable
  const [showSeguridad, setShowSeguridad] = useState(false);
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [passConfirm, setPassConfirm] = useState('');

  // Formulario Datos Legales (Factura_Electronica)
  const [razonSocial, setRazonSocial] = useState('');
  const [nit, setNit] = useState('');
  const [regimenFiscal, setRegimenFiscal] = useState('RESPONSABLE_IVA');
  const [pais, setPais] = useState('Colombia');
  const [monedaOficial, setMonedaOficial] = useState('COP'); // MONEDA OFICIAL
  const [ciudad, setCiudad] = useState('');
  const [telefonoCorp, setTelefonoCorp] = useState('');
  const [direccionFiscal, setDireccionFiscal] = useState('');
  const [emailFacturacion, setEmailFacturacion] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  // SANITIZACIÓN DE TELÉFONO
  const extraerNumeroLocal = (telRaw: string) => {
    if (!telRaw) return '';
    let str = String(telRaw).trim();
    const codigos = ['+593', '+507', '+506', '+502', '+503', '+504', '+505', '+591', '+595', '+598', '+57', '+52', '+54', '+56', '+51', '+58', '+55', '+1'];
    for (const cod of codigos) {
      if (str.startsWith(cod)) {
        str = str.slice(cod.length).trim();
        break;
      }
    }
    return str.replace(/\D/g, '');
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUserAuth(parsed);
        cargarDatosPerfilYCuenta(parsed);
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const cargarDatosPerfilYCuenta = async (session: any) => {
    try {
      let uNom = session.nombre || '';
      let uUser = session.user || '';
      let uPrefijo = session.indicativo_pais || ''; 
      let uTel = extraerNumeroLocal(session.telefono || '');
      let rSoc = session.empresa || '';
      let nDoc = '';
      let regF = 'RESPONSABLE_IVA';
      let cty = '';
      let telC = '';
      let dirF = '';
      let eFact = '';
      let monOf = session.moneda_oficial || 'COP';

      if (session.id_usuario) {
        const uDoc = await getDoc(doc(db, 'usuarios', session.id_usuario));
        if (uDoc.exists()) {
          const ud = uDoc.data();
          uNom = ud.nombre || uNom;
          uUser = ud.user || uUser;
          uPrefijo = ud.indicativo_pais || uPrefijo;
          uTel = extraerNumeroLocal(ud.telefono || session.telefono || '');
        }
      }

      if (session.id_cuenta) {
        const feDoc = await getDoc(doc(db, 'Factura_Electronica', session.id_cuenta));
        if (feDoc.exists()) {
          const fd = feDoc.data();
          rSoc = fd.razon_social || fd.nombre_empresa || rSoc;
          nDoc = fd.nit || fd.documento_fiscal || '';
          regF = fd.regimen_fiscal || 'RESPONSABLE_IVA';
          cty = fd.ciudad || '';
          telC = fd.telefono_corporativo || '';
          dirF = fd.direccion_fiscal || '';
          eFact = fd.email_facturacion || '';
          monOf = fd.moneda_oficial || monOf;
        } else {
          // Fallback
          const cDoc = await getDoc(doc(db, 'cuentas', session.id_cuenta));
          if (cDoc.exists()) {
            const cd = cDoc.data();
            rSoc = cd.nombre_empresa || cd.razon_social || rSoc;
            nDoc = cd.nit || cd.documento_fiscal || '';
            monOf = cd.moneda_oficial || monOf;
          }
        }
      }

      setNombre(uNom);
      setUserEmail(uUser);
      setPrefijoPais(uPrefijo);
      setTelefono(uTel);
      setRazonSocial(rSoc);
      setNit(nDoc);
      setRegimenFiscal(regF);
      setMonedaOficial(monOf);
      setCiudad(cty);
      setTelefonoCorp(telC);
      setDireccionFiscal(dirF);
      setEmailFacturacion(eFact);

      setOriginalData({
        nombre: uNom,
        userEmail: uUser,
        prefijoPais: uPrefijo,
        telefono: uTel,
        razonSocial: rSoc,
        nit: nDoc,
        regimenFiscal: regF,
        monedaOficial: monOf,
        ciudad: cty,
        telefonoCorp: telC,
        direccionFiscal: dirF,
        emailFacturacion: eFact,
        passNueva: ''
      });
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.includes('abort')) return;
      console.error('Error cargando perfil:', e);
    }
  };

  const hayCambios = () => {
    if (!originalData) return false;
    const cambioPerfil = 
      nombre !== originalData.nombre ||
      prefijoPais !== originalData.prefijoPais ||
      telefono !== originalData.telefono ||
      passNueva.trim() !== '';

    const cambioLegales = 
      razonSocial !== originalData.razonSocial ||
      nit !== originalData.nit ||
      regimenFiscal !== originalData.regimenFiscal ||
      monedaOficial !== originalData.monedaOficial ||
      ciudad !== originalData.ciudad ||
      telefonoCorp !== originalData.telefonoCorp ||
      direccionFiscal !== originalData.direccionFiscal ||
      emailFacturacion !== originalData.emailFacturacion;

    return cambioPerfil || cambioLegales;
  };

  // ==========================================
  // 🛡️ GUARDADO CON BATCH Y FIREBASE AUTH
  // ==========================================
  const handleGuardarCambios = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prefijoPais) return alert("Por favor selecciona el indicativo de tu país en la pestaña Perfil.");
    if (!telefono.trim()) return alert("Por favor ingresa tu número de teléfono.");
    if (!hayCambios()) return;
    
    // VALIDACIÓN DE CONTRASEÑAS PARA FIREBASE AUTH
    if (passNueva.trim()) {
      if (passNueva.trim().length < 6) return alert('La nueva contraseña debe tener al menos 6 caracteres.');
      if (passNueva !== passConfirm) return alert('Las nuevas contraseñas no coinciden.');
    }

    setIsSaving(true);
    try {
      const numLimpio = extraerNumeroLocal(telefono);
      const batch = writeBatch(db);
      const fechaActualizacion = new Date().toISOString();

      // 1. ACTUALIZAR CONTRASEÑA EN FIREBASE AUTH
      if (passNueva.trim()) {
        if (!auth.currentUser) {
          setIsSaving(false);
          return alert('No hay una sesión activa de seguridad. Por favor, cierra sesión y vuelve a entrar para cambiar tu contraseña.');
        }
        await updatePassword(auth.currentUser, passNueva.trim());
      }

      // 2. Actualizar usuario en Firestore
      if (userAuth?.id_usuario) {
        const userUpdate: any = {
          nombre: nombre.trim(),
          telefono: numLimpio,
          indicativo_pais: prefijoPais,
          fecha_actualizacion: fechaActualizacion
        };
        
        const userRef = doc(db, 'usuarios', userAuth.id_usuario);
        batch.set(userRef, userUpdate, { merge: true });
      }

      // 3. Guardar datos legales y actualizar cuenta
      if (userAuth?.id_cuenta) {
        const facturaElectronicaData = {
          id_cuenta: userAuth.id_cuenta,
          razon_social: razonSocial.trim(),
          nombre_empresa: razonSocial.trim(),
          nit: nit.trim(),
          regimen_fiscal: regimenFiscal,
          pais,
          moneda_oficial: monedaOficial,
          ciudad: ciudad.trim(),
          telefono_corporativo: telefonoCorp.trim(),
          direccion_fiscal: direccionFiscal.trim(),
          email_facturacion: emailFacturacion.trim(),
          fecha_actualizacion: fechaActualizacion
        };

        const feRef = doc(db, 'Factura_Electronica', userAuth.id_cuenta);
        batch.set(feRef, facturaElectronicaData, { merge: true });
        
        if (userAuth.rol === 'ADMIN') {
          const ctaRef = doc(db, 'cuentas', userAuth.id_cuenta);
          batch.set(ctaRef, {
            telefono_contacto: numLimpio,
            indicativo_pais: prefijoPais,
            moneda_oficial: monedaOficial
          }, { merge: true });
        }
      }

      await batch.commit();

      const sessionObj = {
        ...userAuth,
        nombre: nombre.trim(),
        telefono: numLimpio,
        indicativo_pais: prefijoPais,
        empresa: razonSocial.trim(),
        moneda_oficial: monedaOficial
      };
      localStorage.setItem('atom_user_session', JSON.stringify(sessionObj));
      setUserAuth(sessionObj);

      alert('¡Configuración y credenciales guardadas correctamente!');
      setPassActual('');
      setPassNueva('');
      setPassConfirm('');
      setShowSeguridad(false);

      setOriginalData({
        nombre: nombre.trim(),
        userEmail,
        prefijoPais,
        telefono: numLimpio,
        razonSocial: razonSocial.trim(),
        nit: nit.trim(),
        regimenFiscal,
        monedaOficial,
        ciudad: ciudad.trim(),
        telefonoCorp: telefonoCorp.trim(),
        direccionFiscal: direccionFiscal.trim(),
        emailFacturacion: emailFacturacion.trim(),
        passNueva: ''
      });
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        alert('Por seguridad, Firebase requiere que inicies sesión nuevamente para cambiar tu contraseña. Cierra sesión y vuelve a entrar.');
      } else {
        alert('Error guardando cambios: ' + err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-4 md:p-6 font-sans relative pb-24">
      
      {/* HEADER SUPERIOR COMPACTO */}
      <header className="max-w-5xl mx-auto mb-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight font-satoshi-black">
          Perfil y Configuración
        </h1>
        <p className="text-[11px] text-gray-500 mt-0.5 font-satoshi-regular">
          Gestiona tus credenciales de acceso y la información legal de facturación.
        </p>

        {/* PESTAÑAS (TABS) */}
        <div className="flex border-b border-gray-200 mt-4 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('PERFIL')}
            className={`pb-2 text-xs font-satoshi-black uppercase tracking-wider transition-all relative flex items-center gap-1.5 ${
              activeTab === 'PERFIL' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Perfil de Usuario</span>
            {activeTab === 'PERFIL' && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#FFD800] rounded-t-md"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LEGALES')}
            className={`pb-2 text-xs font-satoshi-black uppercase tracking-wider transition-all relative flex items-center gap-1.5 ${
              activeTab === 'LEGALES' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Datos Legales y Fiscales</span>
            {activeTab === 'LEGALES' && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#FFD800] rounded-t-md"></span>
            )}
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-5xl mx-auto">
        <form onSubmit={handleGuardarCambios}>

          {/* PESTAÑA 1: PERFIL */}
          {activeTab === 'PERFIL' && (
            <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in">
              
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[#2C2C2C] flex items-center justify-center text-[#FFD800] font-satoshi-black text-xl shadow-inner shrink-0">
                  {nombre ? nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 truncate">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-satoshi-black text-gray-900 truncate">{nombre || 'Usuario LOBO'}</h2>
                    <span className="bg-gray-100 border border-gray-200 text-gray-700 text-[9px] font-satoshi-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {userAuth?.rol || 'ADMIN'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-satoshi-regular mt-0.5 truncate">{userEmail}</p>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                <div>
                  <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                    Correo Electrónico / Usuario
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg p-2.5 pr-8 text-xs text-gray-500 font-satoshi-regular cursor-not-allowed"
                      value={userEmail}
                      disabled
                    />
                    <svg className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                    Teléfono de Contacto
                  </label>
                  <div className="flex gap-2">
                    <select
                      className={`bg-gray-50 border border-gray-300 text-xs font-satoshi-black rounded-lg px-2.5 focus:outline-none focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 cursor-pointer transition ${
                        !prefijoPais ? 'text-gray-400' : 'text-gray-900'
                      }`}
                      value={prefijoPais}
                      onChange={(e) => setPrefijoPais(e.target.value)}
                      required
                    >
                      <option value="" disabled className="text-gray-500 bg-white">Sel...</option>
                      {paisesLatam.map((p) => (
                        <option key={p.codigo} value={p.codigo} className="text-gray-900 bg-white">
                          {p.bandera} {p.codigo}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="flex-1 bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                      placeholder="300 123 4567"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowSeguridad(!showSeguridad)}
                    className="flex items-center gap-1.5 text-xs font-satoshi-black text-[#222222] hover:text-gray-600 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span>{showSeguridad ? 'Ocultar cambio de contraseña' : 'Cambiar Contraseña de Acceso'}</span>
                  </button>

                  {showSeguridad && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-0.5">Nueva Contraseña</label>
                          <input
                            type="password"
                            className="w-full bg-white border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-md p-2 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                            value={passNueva}
                            onChange={(e) => setPassNueva(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-satoshi-black text-gray-600 uppercase mb-0.5">Confirmar Nueva Contraseña</label>
                          <input
                            type="password"
                            className="w-full bg-white border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-md p-2 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                            value={passConfirm}
                            onChange={(e) => setPassConfirm(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* PESTAÑA 2: DATOS LEGALES Y FISCALES */}
          {activeTab === 'LEGALES' && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm space-y-4 animate-in fade-in">
              <div className="border-b border-gray-100 pb-2">
                <h3 className="text-sm font-satoshi-black text-gray-900 uppercase tracking-wider">
                  Información Legal de Facturación
                </h3>
                <p className="text-[11px] text-gray-500 font-satoshi-regular mt-0.5">
                  Los datos aquí ingresados se guardarán en la colección <span className="text-[#222222] font-mono font-bold">Factura_Electronica</span>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* COLUMNA 1 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      Razón Social / Nombre Comercial *
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                      placeholder="Distribuidora Ejemplo S.A.S."
                      value={razonSocial}
                      onChange={(e) => setRazonSocial(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      NIT / RUT / ID Fiscal *
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 font-mono focus:outline-none transition"
                      placeholder="900.123.456-7"
                      value={nit}
                      onChange={(e) => setNit(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      Régimen Fiscal
                    </label>
                    <select
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 font-satoshi-black focus:outline-none cursor-pointer transition"
                      value={regimenFiscal}
                      onChange={(e) => setRegimenFiscal(e.target.value)}
                    >
                      <option value="RESPONSABLE_IVA">Responsable de IVA (Común)</option>
                      <option value="NO_RESPONSABLE_IVA">No Responsable de IVA (Simplificado)</option>
                      <option value="REGIMEN_SIMPLE">Régimen Simple de Tributación (RST)</option>
                      <option value="GRAN_CONTRIBUYENTE">Gran Contribuyente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      Moneda Oficial de Operación *
                    </label>
                    <select
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 font-satoshi-black focus:outline-none cursor-pointer transition"
                      value={monedaOficial}
                      onChange={(e) => setMonedaOficial(e.target.value)}
                    >
                      {MONEDAS.map((m) => (
                        <option key={m.codigo} value={m.codigo}>
                          {m.nombre} ({m.simbolo})
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-gray-500 mt-1 italic">
                      * Moneda principal para reportes, catálogo y simuladores.
                    </p>
                  </div>
                </div>

                {/* COLUMNA 2 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      País
                    </label>
                    <select
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 font-satoshi-black focus:outline-none cursor-pointer transition"
                      value={pais}
                      onChange={(e) => setPais(e.target.value)}
                    >
                      <option value="Colombia">Colombia</option>
                      <option value="Mexico">México</option>
                      <option value="Peru">Perú</option>
                      <option value="Chile">Chile</option>
                      <option value="Estados Unidos">Estados Unidos</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                      placeholder="Cali / Bogotá"
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                      Teléfono Corporativo
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                      placeholder="+57 602 123 4567"
                      value={telefonoCorp}
                      onChange={(e) => setTelefonoCorp(e.target.value)}
                    />
                  </div>
                </div>

              </div>

              {/* FILA INFERIOR COMPACTA */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                    Dirección Fiscal / Sede Central
                  </label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    placeholder="Carrera 10 # 15-20, Oficina 501"
                    value={direccionFiscal}
                    onChange={(e) => setDireccionFiscal(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                    Correo Electrónico de Facturación
                  </label>
                  <input
                    type="email"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-lg p-2.5 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    placeholder="facturacion@miempresa.com"
                    value={emailFacturacion}
                    onChange={(e) => setEmailFacturacion(e.target.value)}
                  />
                </div>
              </div>

            </div>
          )}

          {/* BARRA FLOTANTE INFERIOR REDUCIDA Y CLARA */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-gray-200 backdrop-blur-md p-3 z-40">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <div className="text-[11px] text-gray-500 font-satoshi-regular hidden md:block">
                {hayCambios() ? (
                  <span className="text-[#222222] font-satoshi-black flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FFD800] animate-pulse"></span>
                    Tienes cambios sin guardar
                  </span>
                ) : (
                  'No se han detectado modificaciones'
                )}
              </div>

              <button
                type="submit"
                disabled={!hayCambios() || isSaving}
                className="w-full md:w-auto ml-auto bg-[#FFD800] hover:bg-[#FDCB13] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-[#222222] font-satoshi-black px-6 py-2.5 rounded-lg text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center justify-center gap-1.5"
              >
                {isSaving ? (
                  <span>Guardando en BD...</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </main>
    </div>
  );
}
