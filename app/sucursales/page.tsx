'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SucursalesPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'POS' | 'BODEGA'>('TODOS');

  // Modal Crear / Editar Sede
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipoSucursal, setTipoSucursal] = useState<'POS' | 'BODEGA'>('POS');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [telefono, setTelefono] = useState('');
  const [encargado, setEncargado] = useState('');
  const [estado, setEstado] = useState<'ACTIVA' | 'INACTIVA'>('ACTIVA');
  const [loading, setLoading] = useState(false);

  // Menú Flotante de Opciones (Menú de tres puntos ⋮)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      setUserAuth(JSON.parse(savedUser));
    }
  }, []);

  // Escuchar 'sucursales' en Firestore
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const q = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsub = onSnapshot(q, (snap) => {
      setSucursales(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    return () => unsub();
  }, [userAuth]);

  // Cerrar menú de tres puntos al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Formateador estandarizado de teléfono (+57 XXX XXX XXXX)
  const formatTelefono = (tel: string) => {
    if (!tel) return 'Sin teléfono';
    const num = tel.replace(/\D/g, '');
    if (num.length === 10) {
      return `+57 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
    }
    return tel.startsWith('+') ? tel : `+57 ${tel}`;
  };

  const handleCopiarId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setNombre('');
    setTipoSucursal('POS');
    setDireccion('');
    setCiudad('');
    setTelefono('');
    setEncargado('');
    setEstado('ACTIVA');
    setShowModal(true);
  };

  const handleOpenEdit = (s: any) => {
    setEditingId(s.id_doc);
    setNombre(s.nombre || s.NOMBRE || '');
    setTipoSucursal(s.tipo_sucursal || s.tipo || 'POS');
    setDireccion(s.direccion || s.DIRECCION || '');
    setCiudad(s.ciudad || s.CIUDAD || '');
    setTelefono(s.telefono || s.TELEFONO || '');
    setEncargado(s.encargado || s.ENCARGADO || '');
    setEstado(s.estado || 'ACTIVA');
    setOpenMenuId(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return alert('Ingresa el nombre de la sede o bodega.');

    setLoading(true);
    try {
      const idSucFinal = editingId || `SUC_${Date.now().toString().slice(-6)}`;

      const sucObj = {
        id_cuenta: userAuth.id_cuenta,
        id_sucursal: idSucFinal,
        nombre: nombre.trim(),
        tipo_sucursal: tipoSucursal,
        direccion: direccion.trim() || 'Dirección no especificada',
        ciudad: ciudad.trim() || 'Colombia',
        telefono: telefono.trim(),
        encargado: encargado.trim() || 'Administrador General',
        estado,
        fecha_actualizacion: new Date().toISOString()
      };

      await setDoc(doc(db, 'sucursales', idSucFinal), sucObj, { merge: true });
      setShowModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar la sede: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, s: any) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (!confirm(`¿Estás seguro de eliminar la sede ${s.nombre}? Esta acción no se puede deshacer.`)) return;

    try {
      await deleteDoc(doc(db, 'sucursales', s.id_doc));
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar la sede: ' + err.message);
    }
  };

  // Filtrado
  const sucursalesFiltradas = sucursales.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = String(s.nombre || '').toLowerCase().includes(q) ||
                        String(s.ciudad || '').toLowerCase().includes(q) ||
                        String(s.id_sucursal || '').toLowerCase().includes(q);
    
    if (!matchSearch) return false;

    if (tipoFiltro === 'POS') return s.tipo_sucursal === 'POS';
    if (tipoFiltro === 'BODEGA') return s.tipo_sucursal === 'BODEGA';

    return true;
  });

  // Conteos
  const totalPos = sucursales.filter(s => s.tipo_sucursal === 'POS').length;
  const totalBodegas = sucursales.filter(s => s.tipo_sucursal === 'BODEGA').length;

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL CON INDICADOR DISCRETO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              CONTROL MAESTRO DE VENTAS
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Sucursales y Sedes
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Administra los puntos de venta POS, bodegas logísticas y centros de distribución de tu red comercial.
          </p>
        </div>

        {/* BOTÓN ACCIÓN PRINCIPAL (SEA GREEN) */}
        <button
          type="button"
          onClick={handleOpenCreate}
          className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-emerald-950/40 flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Nueva Sede / Bodega</span>
        </button>
      </div>

      {/* METRICAS SUPERIORES CON JERARQUÍA TIPOGRÁFICA, ICONOS Y ALTO CONTRASTE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* TARJETA 1: TOTAL RED LOGÍSTICA */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              RED LOGÍSTICA TOTAL
            </span>
            <div className="w-10 h-10 rounded-full bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5a2.5 2.5 0 002.5-2.5V11a2 2 0 012-2h1.055M11 20.055V18a2 2 0 012-2h1a2 2 0 002-2v-1a2 2 0 012-2h2.945" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {sucursales.length}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {sucursales.length === 1 ? 'Sede Registrada' : 'Sedes Registradas'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Infraestructura global activa
          </p>
        </div>

        {/* TARJETA 2: TIENDAS POS */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#C81FDA] uppercase tracking-wider">
              PUNTOS DE VENTA
            </span>
            <div className="w-10 h-10 rounded-full bg-[#C81FDA]/10 flex items-center justify-center text-[#C81FDA]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {totalPos}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {totalPos === 1 ? 'Tienda POS' : 'Tiendas POS'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Con cobro y facturación presencial
          </p>
        </div>

        {/* TARJETA 3: BODEGAS LOGÍSTICAS */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#6884C5] uppercase tracking-wider">
              CENTROS DE ACOPIO
            </span>
            <div className="w-10 h-10 rounded-full bg-[#6884C5]/10 flex items-center justify-center text-[#6884C5]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {totalBodegas}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {totalBodegas === 1 ? 'Bodega Logística' : 'Bodegas Logísticas'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Almacenamiento y despacho mayorista
          </p>
        </div>

      </div>

      {/* BARRA DE BÚSQUEDA REDUCIDA + FILTROS RÁPIDOS (PILLS) */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-3 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* BUSCADOR COMPACTO */}
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
            placeholder="Buscar por Nombre, ID o Ciudad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* PILLS DE FILTRADO RÁPIDO */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setTipoFiltro('TODOS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              tipoFiltro === 'TODOS'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Todos ({sucursales.length})
          </button>

          <button
            type="button"
            onClick={() => setTipoFiltro('POS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              tipoFiltro === 'POS'
                ? 'bg-[#C81FDA] text-white'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Tiendas POS ({totalPos})
          </button>

          <button
            type="button"
            onClick={() => setTipoFiltro('BODEGA')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              tipoFiltro === 'BODEGA'
                ? 'bg-[#6884C5] text-white'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Bodegas ({totalBodegas})
          </button>
        </div>

      </div>

      {/* GRID DE SEDES (3 COLUMNAS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sucursalesFiltradas.map((s, idx) => {
          const isPos = s.tipo_sucursal === 'POS';

          return (
            <div
              key={s.id_doc || idx}
              className="group relative bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl flex flex-col justify-between transition-all duration-300 hover:border-slate-600"
            >
              <div>
                {/* ENCABEZADO TARJETA CON MENÚ DE TRES PUNTOS */}
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[10px] font-satoshi-black uppercase px-2.5 py-1 rounded-lg tracking-wider ${
                    isPos 
                      ? 'bg-[#C81FDA]/15 text-[#C81FDA] border border-[#C81FDA]/30' 
                      : 'bg-[#6884C5]/15 text-[#6884C5] border border-[#6884C5]/30'
                  }`}>
                    {isPos ? 'Tienda POS' : 'Bodega Logística'}
                  </span>

                  {/* BARRITA DE OPCIONES SECUNDARIAS (⋮) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === s.id_doc ? null : s.id_doc)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1D2935] transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>

                    {openMenuId === s.id_doc && (
                      <div ref={menuRef} className="absolute right-0 mt-1 w-36 bg-[#1D2935] border border-slate-700 rounded-xl shadow-2xl py-1 z-20">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(s)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-[#253443] font-satoshi-regular flex items-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, s)}
                          className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 font-satoshi-regular flex items-center gap-2 border-t border-slate-800"
                        >
                          <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Eliminar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="font-black text-lg text-white font-satoshi-black uppercase tracking-wide">
                  {s.nombre}
                </h3>

                {/* ID TÉCNICO MONOSPACED CON COPIADO RÁPIDO */}
                <div className="flex items-center gap-2 mt-1 mb-4">
                  <span className="font-mono text-[11px] text-[#A0AEC0] bg-[#1D2935] px-2 py-0.5 rounded border border-slate-700/60">
                    ID: {s.id_sucursal}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleCopiarId(e, s.id_sucursal)}
                    className="text-[10px] text-slate-400 hover:text-[#0DE8C0] font-satoshi-regular transition"
                    title="Copiar ID"
                  >
                    {copiedId === s.id_sucursal ? '✓ Copiado' : '📋 Copiar'}
                  </button>
                </div>

                {/* DATOS DE DIRECCIÓN Y CONTACTO CON ALTO CONTRASTE (#A0AEC0) */}
                <div className="space-y-2 text-xs text-[#A0AEC0] font-satoshi-regular">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{s.direccion || 'Dirección no registrada'} - {s.ciudad || 'Colombia'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm0 6a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2zm0 6a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z" />
                    </svg>
                    <span className="font-mono text-slate-300">{formatTelefono(s.telefono)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="truncate">Encargado: {s.encargado || 'Administrador'}</span>
                  </div>
                </div>
              </div>

              {/* BOTÓN PRINCIPAL DE ACCIÓN (EDITAR / VER DETALLE) */}
              <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                <span className={`text-[10px] font-satoshi-black px-2 py-0.5 rounded-full ${
                  s.estado === 'INACTIVA' 
                    ? 'bg-red-950/60 text-red-400 border border-red-800/40' 
                    : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                }`}>
                  {s.estado || 'ACTIVA'}
                </span>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(s)}
                  className="bg-[#1D2935] hover:bg-[#15202b] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                >
                  <span>Ver Detalle</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

            </div>
          );
        })}

        {sucursalesFiltradas.length === 0 && (
          <div className="col-span-full text-center py-16 bg-[#253443] border border-slate-700/50 rounded-2xl text-[#A0AEC0] text-xs font-satoshi-regular">
            No se encontraron sedes que coincidan con la búsqueda o filtro seleccionado.
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR SEDE */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase tracking-wide">
                {editingId ? 'Editar Sede' : 'Nueva Sede / Bodega'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Nombre de la Sede *
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                  placeholder="Ej: Sede Principal Cali / Bodega Centro"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Tipo de Operación
                  </label>
                  <select
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-satoshi-black focus:outline-none"
                    value={tipoSucursal}
                    onChange={(e: any) => setTipoSucursal(e.target.value)}
                  >
                    <option value="POS">🛒 Tienda POS (Venta Directa)</option>
                    <option value="BODEGA">📦 Bodega Logística</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Estado
                  </label>
                  <select
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-satoshi-black focus:outline-none"
                    value={estado}
                    onChange={(e: any) => setEstado(e.target.value)}
                  >
                    <option value="ACTIVA">✓ Operativa / Activa</option>
                    <option value="INACTIVA">✕ Inactiva</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Ciudad
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                    placeholder="Cali"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Teléfono
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                    placeholder="300 123 4567"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Dirección Física
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                  placeholder="Calle 10 # 5-20"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                  Encargado / Administrador
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                  placeholder="Nombre del responsable"
                  value={encargado}
                  onChange={(e) => setEncargado(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-700/60 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 hover:text-white font-satoshi-black py-3 rounded-xl text-xs uppercase"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear Sede')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
