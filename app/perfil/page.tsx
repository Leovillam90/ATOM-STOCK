'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function PerfilPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'PERFIL' | 'LEGALES'>('PERFIL');
  
  const [originalData, setOriginalData] = useState<any>(null);

  // Formulario Perfil de Usuario
  const [nombre, setNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [prefijoPais, setPrefijoPais] = useState('+57');
  const [telefono, setTelefono] = useState('');

  // Módulo Seguridad Colapsable
  const [showSeguridad, setShowSeguridad] = useState(false);
  const [passActual, setPassActual] = useState('');
  const [passNueva, setPassNueva] = useState('');
  const [passConfirm, setPassConfirm] = useState('');

  // Formulario Datos Legales (Conectado a 'Factura_Electronica')
  const [razonSocial, setRazonSocial] = useState('');
  const [nit, setNit] = useState('');
  const [regimenFiscal, setRégimenFiscal] = useState('RESPONSABLE_IVA');
  const [pais, setPais] = useState('Colombia');
  const [ciudad, setCiudad] = useState('');
  const [telefonoCorp, setTelefonoCorp] = useState('');
  const [direccionFiscal, setDireccionFiscal] = useState('');
  const [emailFacturacion, setEmailFacturacion] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUserAuth(parsed);
      cargarDatosPerfilYCuenta(parsed);
    }
  }, []);

  const cargarDatosPerfilYCuenta = async (session: any) => {
    try {
      let uNom = session.nombre || '';
      let uUser = session.user || '';
      let uTel = session.telefono || '';
      let rSoc = session.empresa || '';
      let nDoc = '';
      let regF = 'RESPONSABLE_IVA';
      let cty = '';
      let telC = '';
      let dirF = '';
      let eFact = '';

      if (session.id_usuario) {
        const uDoc = await getDoc(doc(db, 'usuarios', session.id_usuario));
        if (uDoc.exists()) {
          const ud = uDoc.data();
          uNom = ud.nombre || uNom;
          uUser = ud.user || uUser;
          uTel = ud.telefono || uTel;
        }
      }

      // Consulta a la colección 'Factura_Electronica' usando el id_cuenta
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
        } else {
          // Fallback a 'cuentas' en caso de que aún no exista el documento en 'Factura_Electronica'
          const cDoc = await getDoc(doc(db, 'cuentas', session.id_cuenta));
          if (cDoc.exists()) {
            const cd = cDoc.data();
            rSoc = cd.nombre_empresa || cd.razon_social || rSoc;
            nDoc = cd.nit || cd.documento_fiscal || '';
          }
        }
      }

      setNombre(uNom);
      setUserEmail(uUser);
      setTelefono(uTel);
      setRazonSocial(rSoc);
      setNit(nDoc);
      setRégimenFiscal(regF);
      setCiudad(cty);
      setTelefonoCorp(telC);
      setDireccionFiscal(dirF);
      setEmailFacturacion(eFact);

      setOriginalData({
        nombre: uNom,
        userEmail: uUser,
        telefono: uTel,
        razonSocial: rSoc,
        nit: nDoc,
        regimenFiscal: regF,
        ciudad: cty,
        telefonoCorp: telC,
        direccionFiscal: dirF,
        emailFacturacion: eFact,
        passNueva: ''
      });
    } catch (e) {
      console.error('Error cargando perfil:', e);
    }
  };

  const hayCambios = () => {
    if (!originalData) return false;
    const cambioPerfil = 
      nombre !== originalData.nombre ||
      telefono !== originalData.telefono ||
      passNueva.trim() !== '';

    const cambioLegales = 
      razonSocial !== originalData.razonSocial ||
      nit !== originalData.nit ||
      regimenFiscal !== originalData.regimenFiscal ||
      ciudad !== originalData.ciudad ||
      telefonoCorp !== originalData.telefonoCorp ||
      direccionFiscal !== originalData.direccionFiscal ||
      emailFacturacion !== originalData.emailFacturacion;

    return cambioPerfil || cambioLegales;
  };

  const handleGuardarCambios = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hayCambios()) return;

    if (passNueva && passNueva !== passConfirm) {
      return alert('Las nuevas contraseñas no coinciden.');
    }

    setIsSaving(true);
    try {
      // 1. Actualizar usuario
      if (userAuth?.id_usuario) {
        const userUpdate: any = {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          fecha_actualizacion: new Date().toISOString()
        };
        if (passNueva.trim()) {
          userUpdate.pass = passNueva.trim();
        }
        await setDoc(doc(db, 'usuarios', userAuth.id_usuario), userUpdate, { merge: true });
      }

      // 2. Guardar datos en la colección 'Factura_Electronica'
      if (userAuth?.id_cuenta) {
        const facturaElectronicaData = {
          id_cuenta: userAuth.id_cuenta,
          razon_social: razonSocial.trim(),
          nombre_empresa: razonSocial.trim(),
          nit: nit.trim(),
          regimen_fiscal: regimenFiscal,
          pais,
          ciudad: ciudad.trim(),
          telefono_corporativo: telefonoCorp.trim(),
          direccion_fiscal: direccionFiscal.trim(),
          email_facturacion: emailFacturacion.trim(),
          fecha_actualizacion: new Date().toISOString()
        };

        await setDoc(doc(db, 'Factura_Electronica', userAuth.id_cuenta), facturaElectronicaData, { merge: true });
      }

      const sessionObj = {
        ...userAuth,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        empresa: razonSocial.trim()
      };
      localStorage.setItem('atom_user_session', JSON.stringify(sessionObj));
      setUserAuth(sessionObj);

      alert('¡Configuración guardada en Factura_Electronica correctamente!');
      setPassActual('');
      setPassNueva('');
      setPassConfirm('');
      setShowSeguridad(false);

      setOriginalData({
        nombre: nombre.trim(),
        userEmail,
        telefono: telefono.trim(),
        razonSocial: razonSocial.trim(),
        nit: nit.trim(),
        regimenFiscal,
        ciudad: ciudad.trim(),
        telefonoCorp: telefonoCorp.trim(),
        direccionFiscal: direccionFiscal.trim(),
        emailFacturacion: emailFacturacion.trim(),
        passNueva: ''
      });
    } catch (err: any) {
      console.error(err);
      alert('Error guardando cambios: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-4 md:p-6 font-sans relative pb-16">
      
      {/* HEADER SUPERIOR COMPACTO */}
      <header className="max-w-5xl mx-auto mb-4">
        <h1 className="text-2xl font-black text-white tracking-tight font-satoshi-black">
          Perfil y Configuración
        </h1>
        <p className="text-[11px] text-[#A0AEC0] mt-0.5 font-satoshi-regular">
          Gestiona tus credenciales de acceso y la información legal de facturación.
        </p>

        {/* PESTAÑAS (TABS) */}
        <div className="flex border-b border-slate-700/60 mt-4 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('PERFIL')}
            className={`pb-2 text-xs font-satoshi-black uppercase tracking-wider transition-all relative flex items-center gap-1.5 ${
              activeTab === 'PERFIL' ? 'text-[#0DE8C0]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Perfil de Usuario</span>
            {activeTab === 'PERFIL' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0DE8C0] rounded-full"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LEGALES')}
            className={`pb-2 text-xs font-satoshi-black uppercase tracking-wider transition-all relative flex items-center gap-1.5 ${
              activeTab === 'LEGALES' ? 'text-[#0DE8C0]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Datos Legales y Fiscales</span>
            {activeTab === 'LEGALES' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0DE8C0] rounded-full"></span>
            )}
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-5xl mx-auto">
        <form onSubmit={handleGuardarCambios}>

          {/* PESTAÑA 1: PERFIL */}
          {activeTab === 'PERFIL' && (
            <div className="max-w-2xl mx-auto space-y-4">
              
              <div className="bg-[#253443] border border-slate-700/50 rounded-xl p-4 flex items-center gap-4 shadow-lg">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#0DE8C0] to-purple-600 flex items-center justify-center text-white font-satoshi-black text-xl shadow-inner shrink-0">
                  {nombre ? nombre.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 truncate">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-satoshi-black text-white truncate">{nombre || 'Usuario ATOM'}</h2>
                    <span className="bg-[#1D2935] border border-[#0DE8C0]/40 text-[#0DE8C0] text-[9px] font-satoshi-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {userAuth?.rol || 'ADMIN'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A0AEC0] font-satoshi-regular mt-0.5 truncate">{userEmail}</p>
                </div>
              </div>

              <div className="bg-[#253443] border border-slate-700/50 rounded-xl p-5 shadow-lg space-y-3.5">
                <div>
                  <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                    Correo Electrónico / Usuario
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-[#1D2935]/60 border border-slate-700/80 rounded-lg p-2.5 pr-8 text-xs text-slate-300 font-satoshi-regular cursor-not-allowed"
                      value={userEmail}
                      disabled
                    />
                    <svg className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                    Teléfono de Contacto
                  </label>
                  <div className="flex gap-2">
                    <select
                      className="bg-[#1D2935] border border-slate-700 text-slate-200 text-xs font-satoshi-black rounded-lg px-2.5 focus:outline-none focus:border-[#0DE8C0]"
                      value={prefijoPais}
                      onChange={(e) => setPrefijoPais(e.target.value)}
                    >
                      <option value="+57">+57 (CO)</option>
                      <option value="+1">+1 (US)</option>
                      <option value="+52">+52 (MX)</option>
                      <option value="+51">+51 (PE)</option>
                      <option value="+56">+56 (CL)</option>
                    </select>
                    <input
                      type="text"
                      className="flex-1 bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                      placeholder="300 123 4567"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setShowSeguridad(!showSeguridad)}
                    className="flex items-center gap-1.5 text-xs font-satoshi-black text-[#0DE8C0] hover:underline"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span>{showSeguridad ? 'Ocultar cambio de contraseña' : 'Cambiar Contraseña de Acceso'}</span>
                  </button>

                  {showSeguridad && (
                    <div className="mt-3 p-3 bg-[#1D2935] rounded-lg border border-slate-700/80 space-y-3">
                      <div>
                        <label className="block text-[10px] font-satoshi-black text-slate-300 uppercase mb-0.5">Contraseña Actual</label>
                        <input
                          type="password"
                          className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-md p-2 text-xs text-white focus:outline-none font-satoshi-regular"
                          value={passActual}
                          onChange={(e) => setPassActual(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-satoshi-black text-slate-300 uppercase mb-0.5">Nueva Contraseña</label>
                          <input
                            type="password"
                            className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-md p-2 text-xs text-white focus:outline-none font-satoshi-regular"
                            value={passNueva}
                            onChange={(e) => setPassNueva(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-satoshi-black text-slate-300 uppercase mb-0.5">Confirmar Nueva Contraseña</label>
                          <input
                            type="password"
                            className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-md p-2 text-xs text-white focus:outline-none font-satoshi-regular"
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
            <div className="bg-[#253443] border border-slate-700/50 rounded-xl p-4 lg:p-5 shadow-lg space-y-4">
              <div className="border-b border-slate-700/60 pb-2">
                <h3 className="text-sm font-satoshi-black text-white uppercase tracking-wider">
                  Información Legal de Facturación
                </h3>
                <p className="text-[11px] text-[#A0AEC0] font-satoshi-regular mt-0.5">
                  Los datos aquí ingresados se guardarán en la colección <span className="text-[#0DE8C0] font-mono">Factura_Electronica</span>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* COLUMNA 1 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                      Razón Social / Nombre Comercial *
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                      placeholder="Distribuidora Ejemplo S.A.S."
                      value={razonSocial}
                      onChange={(e) => setRazonSocial(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                      NIT / RUT / ID Fiscal *
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none transition"
                      placeholder="900.123.456-7"
                      value={nit}
                      onChange={(e) => setNit(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                      Régimen Fiscal
                    </label>
                    <select
                      className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-satoshi-black focus:outline-none cursor-pointer"
                      value={regimenFiscal}
                      onChange={(e) => setRégimenFiscal(e.target.value)}
                    >
                      <option value="RESPONSABLE_IVA">Responsable de IVA (Común)</option>
                      <option value="NO_RESPONSABLE_IVA">No Responsable de IVA (Simplificado)</option>
                      <option value="REGIMEN_SIMPLE">Régimen Simple de Tributación (RST)</option>
                      <option value="GRAN_CONTRIBUYENTE">Gran Contribuyente</option>
                    </select>
                  </div>
                </div>

                {/* COLUMNA 2 */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                      País
                    </label>
                    <select
                      className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-satoshi-black focus:outline-none cursor-pointer"
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
                    <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                      placeholder="Cali / Bogotá"
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                      Teléfono Corporativo
                    </label>
                    <input
                      type="text"
                      className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                      placeholder="+57 602 123 4567"
                      value={telefonoCorp}
                      onChange={(e) => setTelefonoCorp(e.target.value)}
                    />
                  </div>
                </div>

              </div>

              {/* FILA INFERIOR COMPACTA */}
              <div className="space-y-3 pt-3 border-t border-slate-700/60">
                <div>
                  <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                    Dirección Fiscal / Sede Central
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                    placeholder="Carrera 10 # 15-20, Oficina 501"
                    value={direccionFiscal}
                    onChange={(e) => setDireccionFiscal(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-satoshi-black text-white uppercase tracking-wider mb-1">
                    Correo Electrónico de Facturación
                  </label>
                  <input
                    type="email"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white focus:outline-none font-satoshi-regular transition"
                    placeholder="facturacion@miempresa.com"
                    value={emailFacturacion}
                    onChange={(e) => setEmailFacturacion(e.target.value)}
                  />
                </div>
              </div>

            </div>
          )}

          {/* BARRA FLOTANTE INFERIOR REDUCIDA */}
          <div className="fixed bottom-0 left-0 right-0 bg-[#1D2935]/95 border-t border-slate-700/80 backdrop-blur-md p-2.5 z-40">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <div className="text-[11px] text-[#A0AEC0] font-satoshi-regular hidden md:block">
                {hayCambios() ? (
                  <span className="text-[#0DE8C0] font-satoshi-black flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
                    Tienes cambios sin guardar
                  </span>
                ) : (
                  'No se han detectado modificaciones'
                )}
              </div>

              <button
                type="submit"
                disabled={!hayCambios() || isSaving}
                className="w-full md:w-auto ml-auto bg-[#C81FDA] hover:bg-[#a617b5] disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-satoshi-black px-6 py-2.5 rounded-lg text-xs uppercase tracking-wider transition-all duration-300 shadow-md flex items-center justify-center gap-1.5"
              >
                {isSaving ? (
                  <span>Guardando en Factura_Electronica...</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
