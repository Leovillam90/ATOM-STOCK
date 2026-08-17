'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ClientesPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'NATURAL' | 'JURIDICO'>('TODOS');

  // Modal Crear / Editar Cliente
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [nit, setNit] = useState('');
  const [tipoCliente, setTipoCliente] = useState<'NATURAL' | 'JURIDICO'>('NATURAL');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [estado, setEstado] = useState<'ACTIVO' | 'INACTIVO'>('ACTIVO');
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

  // Escuchar 'clientes' en Firestore
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const q = query(collection(db, 'clientes'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsub = onSnapshot(q, (snap) => {
      setClientes(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    return () => unsub();
  }, [userAuth]);

  // Cerrar menú de opciones al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Formateador estandarizado de teléfono
  const formatTelefono = (tel: string) => {
    if (!tel) return 'Sin teléfono';
    const num = tel.replace(/\D/g, '');
    if (num.length === 10) {
      return `+57 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
    }
    return tel.startsWith('+') ? tel : `+57 ${tel}`;
  };

  const handleCopiarNit = (e: React.MouseEvent, docNit: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(docNit);
    setCopiedId(docNit);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setNombre('');
    setNit('');
    setTipoCliente('NATURAL');
    setTelefono('');
    setEmail('');
    setDireccion('');
    setCiudad('');
    setEstado('ACTIVO');
    setShowModal(true);
  };

  const handleOpenEdit = (c: any) => {
    setEditingId(c.id_doc);
    setNombre(c.nombre || c.NOMBRE || '');
    setNit(c.nit || c.NIT || '');
    setTipoCliente(c.tipo_cliente || 'NATURAL');
    setTelefono(c.telefono || c.TELEFONO || '');
    setEmail(c.email || c.EMAIL || '');
    setDireccion(c.direccion || c.DIRECCION || '');
    setCiudad(c.ciudad || c.CIUDAD || '');
    setEstado(c.estado || 'ACTIVO');
    setOpenMenuId(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return alert('Ingresa el nombre o razón social del cliente.');

    setLoading(true);
    try {
      const idCliFinal = editingId || `CLI_${Date.now().toString().slice(-6)}`;

      const cliObj = {
        id_cuenta: userAuth.id_cuenta,
        id_cliente: idCliFinal,
        nombre: nombre.trim(),
        nit: nit.trim() || 'CF_GENERAL',
        tipo_cliente: tipoCliente,
        telefono: telefono.trim(),
        email: email.trim().toLowerCase(),
        direccion: direccion.trim() || 'General',
        ciudad: ciudad.trim() || 'Colombia',
        estado,
        fecha_actualizacion: new Date().toISOString()
      };

      await setDoc(doc(db, 'clientes', idCliFinal), cliObj, { merge: true });
      setShowModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar el cliente: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, c: any) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (!confirm(`¿Estás seguro de eliminar el cliente ${c.nombre}?`)) return;

    try {
      await deleteDoc(doc(db, 'clientes', c.id_doc));
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar cliente: ' + err.message);
    }
  };

  // Filtrado
  const clientesFiltrados = clientes.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = String(c.nombre || '').toLowerCase().includes(q) ||
                        String(c.nit || '').toLowerCase().includes(q) ||
                        String(c.ciudad || '').toLowerCase().includes(q) ||
                        String(c.telefono || '').toLowerCase().includes(q);
    
    if (!matchSearch) return false;

    if (filtroTipo === 'NATURAL') return c.tipo_cliente !== 'JURIDICO';
    if (filtroTipo === 'JURIDICO') return c.tipo_cliente === 'JURIDICO';

    return true;
  });

  // Conteos
  const totalEmpresas = clientes.filter(c => c.tipo_cliente === 'JURIDICO').length;
  const totalPersonas = clientes.filter(c => c.tipo_cliente !== 'JURIDICO').length;

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Base de Datos Comercial
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Directorio de Clientes
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Gestión de clientes, historial de contacto y datos de facturación para ventas POS e e-commerce.
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
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {/* METRICAS SUPERIORES (GRID DE 3 COLUMNAS IDÉNTICAS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* TARJETA 1: TOTAL CLIENTES */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              DIRECTORIO OMNICANAL
            </span>
            <div className="w-10 h-10 rounded-full bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {clientes.length}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {clientes.length === 1 ? 'Cliente Registrado' : 'Clientes Registrados'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Sincronizado en tiempo real con Firestore
          </p>
        </div>

        {/* TARJETA 2: PERSONAS NATURALES */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#6884C5] uppercase tracking-wider">
              PERSONAS NATURALES
            </span>
            <div className="w-10 h-10 rounded-full bg-[#6884C5]/10 flex items-center justify-center text-[#6884C5]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {totalPersonas}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {totalPersonas === 1 ? 'Consumidor Final' : 'Consumidores Finales'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Ventas al detal en mostradores POS
          </p>
        </div>

        {/* TARJETA 3: CLIENTES JURÍDICOS */}
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#C81FDA] uppercase tracking-wider">
              CLIENTES JURÍDICOS
            </span>
            <div className="w-10 h-10 rounded-full bg-[#C81FDA]/10 flex items-center justify-center text-[#C81FDA]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white font-satoshi-black">
              {totalEmpresas}
            </span>
            <span className="text-sm font-satoshi-regular text-slate-200">
              {totalEmpresas === 1 ? 'Empresa / Mayorista' : 'Empresas y Mayoristas'}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
            Facturación comercial con NIT
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
            placeholder="Buscar por Nombre, NIT, Ciudad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* PILLS DE FILTRADO RÁPIDO */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setFiltroTipo('TODOS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroTipo === 'TODOS'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Todos ({clientes.length})
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipo('NATURAL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroTipo === 'NATURAL'
                ? 'bg-[#6884C5] text-white'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Personas ({totalPersonas})
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipo('JURIDICO')}
            className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
              filtroTipo === 'JURIDICO'
                ? 'bg-[#C81FDA] text-white'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Empresas ({totalEmpresas})
          </button>
        </div>

      </div>

      {/* GRID DE CLIENTES (3 COLUMNAS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientesFiltrados.map((c, idx) => {
          const isJuridico = c.tipo_cliente === 'JURIDICO';
          const telClean = String(c.telefono || '').replace(/\D/g, '');

          return (
            <div
              key={c.id_doc || idx}
              className="group relative bg-[#253443] border border-slate-700/50 rounded-2xl p-6 shadow-xl flex flex-col justify-between transition-all duration-300 hover:border-slate-600"
            >
              <div>
                {/* ENCABEZADO TARJETA CON MENÚ DE TRES PUNTOS */}
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-[10px] font-satoshi-black uppercase px-2.5 py-1 rounded-lg tracking-wider ${
                    isJuridico 
                      ? 'bg-[#C81FDA]/15 text-[#C81FDA] border border-[#C81FDA]/30' 
                      : 'bg-[#6884C5]/15 text-[#6884C5] border border-[#6884C5]/30'
                  }`}>
                    {isJuridico ? 'Empresa (NIT)' : 'Persona Natural'}
                  </span>

                  {/* BARRITA DE OPCIONES SECUNDARIAS (⋮) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === c.id_doc ? null : c.id_doc)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1D2935] transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>

                    {openMenuId === c.id_doc && (
                      <div ref={menuRef} className="absolute right-0 mt-1 w-36 bg-[#1D2935] border border-slate-700 rounded-xl shadow-2xl py-1 z-20">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(c)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-[#253443] font-satoshi-regular flex items-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, c)}
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

                <h3 className="font-black text-lg text-white font-satoshi-black uppercase tracking-wide truncate">
                  {c.nombre || c.NOMBRE}
                </h3>

                {/* NIT / DOCUMENTO MONOSPACED CON COPIADO RÁPIDO */}
                <div className="flex items-center gap-2 mt-1 mb-4">
                  <span className="font-mono text-[11px] text-[#A0AEC0] bg-[#1D2935] px-2 py-0.5 rounded border border-slate-700/60">
                    NIT/Doc: {c.nit || c.NIT || 'CF_GENERAL'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleCopiarNit(e, c.nit || 'CF_GENERAL')}
                    className="text-[10px] text-slate-400 hover:text-[#0DE8C0] font-satoshi-regular transition"
                    title="Copiar Documento"
                  >
                    {copiedId === (c.nit || 'CF_GENERAL') ? '✓ Copiado' : '📋 Copiar'}
                  </button>
                </div>

                {/* DATOS DE DIRECCIÓN Y CONTACTO CON ALTO CONTRASTE (#A0AEC0) */}
                <div className="space-y-2 text-xs text-[#A0AEC0] font-satoshi-regular">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm0 6a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2zm0 6a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z" />
                    </svg>
                    <span className="font-mono text-slate-300">{formatTelefono(c.telefono)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{c.email || c.EMAIL || 'Sin correo registrado'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{c.direccion || 'General'} - {c.ciudad || 'Colombia'}</span>
                  </div>
                </div>
              </div>

              {/* BOTÓN PRINCIPAL DE ACCIÓN */}
              <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                {telClean ? (
                  <a
                    href={`https://api.whatsapp.com/send?phone=${telClean}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#0DE8C0] hover:underline font-satoshi-black text-xs flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>WhatsApp</span>
                  </a>
                ) : (
                  <span className="text-slate-500 text-xs font-satoshi-regular">Sin WhatsApp</span>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenEdit(c)}
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

        {clientesFiltrados.length === 0 && (
          <div className="col-span-full text-center py-16 bg-[#253443] border border-slate-700/50 rounded-2xl text-[#A0AEC0] text-xs font-satoshi-regular">
            No se encontraron clientes que coincidan con la búsqueda o filtro seleccionado.
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR CLIENTE */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase tracking-wide">
                {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
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
                  Nombre Completo / Razón Social *
                </label>
                <input 
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                  placeholder="Ej: Juan Pérez / Empresa S.A.S."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    NIT / Cédula
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-mono focus:outline-none"
                    placeholder="1098765432"
                    value={nit}
                    onChange={(e) => setNit(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Tipo de Cliente
                  </label>
                  <select
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-satoshi-black focus:outline-none"
                    value={tipoCliente}
                    onChange={(e: any) => setTipoCliente(e.target.value)}
                  >
                    <option value="NATURAL">👤 Persona Natural</option>
                    <option value="JURIDICO">🏢 Empresa / Jurídico</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Teléfono / Celular
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                    placeholder="300 123 4567"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Correo Electrónico
                  </label>
                  <input 
                    type="email"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                    placeholder="cliente@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">
                    Dirección
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
                  {loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear Cliente')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}