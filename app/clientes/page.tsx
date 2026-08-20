'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ClientesPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'NATURAL' | 'JURIDICO'>('TODOS');

  // CONTROL DE VISTA: TARJETAS O LISTA/TABLA
  const [viewModeClientes, setViewModeClientes] = useState<'TARJETAS' | 'LISTA'>('TARJETAS');

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
  const [estado, setEstado] = useState<'ACTIVA' | 'INACTIVO'>('ACTIVA');
  const [loading, setLoading] = useState(false);

  // Modal Carga Masiva
  const [showModalMasivo, setShowModalMasivo] = useState(false);
  const [fileMasivo, setFileMasivo] = useState<File | null>(null);
  const [loadingMasivo, setLoadingMasivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const unsub = onSnapshot(q, 
      (snap) => setClientes(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))),
      (err) => console.error("Error cargando clientes:", err)
    );

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
    setEstado('ACTIVA');
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
    setEstado(c.estado || 'ACTIVA');
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

  const handleDescargarPlantillaClientes = () => {
    const bom = '\uFEFF';
    const csvContent = 
      'SEP=;\n' +
      'nombre;nit;tipo_cliente;telefono;email;direccion;ciudad\n' +
      'Leonardo Garcia;11004125;NATURAL;32138712634;leo@gmail.com;Calle 14 34345;Cali\n' +
      'Distribuidora Global SAS;900123456;JURIDICO;6017654321;contacto@global.com;Av El Dorado 68;Bogotá\n';

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Plantilla_Clientes_LOBO_STOCK.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // 🛡️ CARGA MASIVA CON BATCH DE FIRESTORE
  // ==========================================
  const handleProcesarCargaMasivaClientes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileMasivo) return alert('Por favor selecciona un archivo CSV.');

    setLoadingMasivo(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '' && !l.toLowerCase().startsWith('sep='));

        if (lines.length <= 1) {
          alert('El archivo está vacío o solo contiene encabezados.');
          setLoadingMasivo(false);
          return;
        }

        const separador = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separador).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));

        const columnasRequeridas = ['nombre', 'nit'];
        const columnasFaltantes = columnasRequeridas.filter(col => !headers.includes(col));

        if (columnasFaltantes.length > 0) {
          alert(`⛔ Formato Inválido:\nFaltan los encabezados obligatorios: [ ${columnasFaltantes.join(', ')} ]`);
          setLoadingMasivo(false);
          return;
        }

        const idxNombre = headers.indexOf('nombre');
        const idxNit = headers.indexOf('nit');
        const idxTipo = headers.indexOf('tipo_cliente');
        const idxTel = headers.indexOf('telefono');
        const idxEmail = headers.indexOf('email');
        const idxDir = headers.indexOf('direccion');
        const idxCiu = headers.indexOf('ciudad');

        let creados = 0;
        let rechazadosPorNit = 0;
        let rechazadosPorTel = 0;

        const nitsEnArchivo = new Set<string>();
        const telsEnArchivo = new Set<string>();

        // Agrupamiento por Lotes (Firebase Batch)
        const batchArray: any[] = [writeBatch(db)];
        let batchIndex = 0;
        let opCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
          
          if (cols.length >= 1 && cols[idxNombre] && cols[idxNombre] !== '') {
            const nomInput = cols[idxNombre];
            const nitInput = idxNit !== -1 && cols[idxNit] ? cols[idxNit].trim() : 'CF_GENERAL';
            
            const tipoInputRaw = idxTipo !== -1 && cols[idxTipo] ? cols[idxTipo].toUpperCase().trim() : 'NATURAL';
            const tipoInput = (tipoInputRaw === 'JURIDICO' || tipoInputRaw === 'EMPRESA') ? 'JURIDICO' : 'NATURAL';
            
            const telInput = idxTel !== -1 ? cols[idxTel] : '';
            const emailInput = idxEmail !== -1 && cols[idxEmail] ? cols[idxEmail].toLowerCase().trim() : '';
            const dirInput = idxDir !== -1 && cols[idxDir] ? cols[idxDir] : 'General';
            const ciuInput = idxCiu !== -1 && cols[idxCiu] ? cols[idxCiu] : 'Colombia';

            if (nitInput !== 'CF_GENERAL') {
              const existeNitEnBD = clientes.some(c => String(c.nit || '').trim() === nitInput);
              if (existeNitEnBD || nitsEnArchivo.has(nitInput)) {
                rechazadosPorNit++;
                continue;
              }
              nitsEnArchivo.add(nitInput);
            }

            if (telInput && telInput !== '') {
              const existeTelEnBD = clientes.some(c => String(c.telefono || '').trim() === telInput);
              if (existeTelEnBD || telsEnArchivo.has(telInput)) {
                rechazadosPorTel++;
                continue;
              }
              telsEnArchivo.add(telInput);
            }

            const idDocFinal = `CLI_${Date.now().toString().slice(-6)}_${i}`;

            const cliObj = {
              id_cuenta: userAuth.id_cuenta,
              id_cliente: idDocFinal,
              nombre: nomInput,
              nit: nitInput,
              tipo_cliente: tipoInput,
              telefono: telInput,
              email: emailInput,
              direccion: dirInput,
              ciudad: ciuInput,
              estado: 'ACTIVO',
              fecha_actualizacion: new Date().toISOString()
            };

            const docRef = doc(db, 'clientes', idDocFinal);
            batchArray[batchIndex].set(docRef, cliObj, { merge: true });
            opCount++;
            creados++;

            if (opCount >= 450) {
              batchArray.push(writeBatch(db));
              batchIndex++;
              opCount = 0;
            }
          }
        }

        for (const b of batchArray) {
          await b.commit();
        }

        let mensajeAlerta = `¡Proceso Masivo Finalizado!\n\nClientes Creados Exitosamente: ${creados}`;
        
        if (rechazadosPorNit > 0 || rechazadosPorTel > 0) {
          mensajeAlerta += `\n\nREGISTROS OMITIDOS (DUPLICADOS):\n`;
          if (rechazadosPorNit > 0) mensajeAlerta += `- ${rechazadosPorNit} omitidos por NIT/Cédula repetida.\n`;
          if (rechazadosPorTel > 0) mensajeAlerta += `- ${rechazadosPorTel} omitidos por Teléfono repetido.`;
        }

        alert(mensajeAlerta);
        
        setFileMasivo(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowModalMasivo(false);
      } catch (err: any) {
        console.error(err);
        alert('Error al procesar la carga masiva: ' + err.message);
      } finally {
        setLoadingMasivo(false);
      }
    };

    reader.readAsText(fileMasivo);
  };

  // ==========================================
  // 🧠 RENDIMIENTO: LÓGICA MEMOIZADA
  // ==========================================
  const { clientesFiltrados, totalEmpresas, totalPersonas } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const filtrados = clientes.filter(c => {
      const matchSearch = String(c.nombre || '').toLowerCase().includes(q) ||
                          String(c.nit || '').toLowerCase().includes(q) ||
                          String(c.ciudad || '').toLowerCase().includes(q) ||
                          String(c.telefono || '').toLowerCase().includes(q);
      
      if (!matchSearch) return false;
      if (filtroTipo === 'NATURAL') return c.tipo_cliente !== 'JURIDICO';
      if (filtroTipo === 'JURIDICO') return c.tipo_cliente === 'JURIDICO';
      return true;
    });

    return {
      clientesFiltrados: filtrados,
      totalEmpresas: clientes.filter(c => c.tipo_cliente === 'JURIDICO').length,
      totalPersonas: clientes.filter(c => c.tipo_cliente !== 'JURIDICO').length
    };
  }, [clientes, searchQuery, filtroTipo]);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Base de Datos Comercial
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            DIRECTORIO DE CLIENTES
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-xl">
            Gestión de clientes, historial de contacto y datos de facturación para ventas POS e e-commerce.
          </p>
        </div>

        {/* BOTONES DE ACCIÓN PRINCIPALES */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowModalMasivo(true)}
            className="bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 font-satoshi-black px-4 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2 font-bold shadow-sm"
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>Carga Masiva</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center gap-2 font-bold"
          >
            <svg className="w-4 h-4 text-[#222222]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* METRICAS SUPERIORES CON ÍCONOS SVG 2D */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              DIRECTORIO OMNICANAL
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-gray-900 font-satoshi-black">
              {clientes.length}
            </span>
            <span className="text-sm font-satoshi-regular text-gray-600">
              {clientes.length === 1 ? 'Cliente Registrado' : 'Clientes Registrados'}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-satoshi-regular">
            Sincronizado en tiempo real con Firestore
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              PERSONAS NATURALES
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-gray-900 font-satoshi-black">
              {totalPersonas}
            </span>
            <span className="text-sm font-satoshi-regular text-gray-600">
              {totalPersonas === 1 ? 'Consumidor Final' : 'Consumidores Finales'}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-satoshi-regular">
            Ventas al detal en mostradores POS
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              CLIENTES JURÍDICOS
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-3">
            <span className="text-4xl font-black text-gray-900 font-satoshi-black">
              {totalEmpresas}
            </span>
            <span className="text-sm font-satoshi-regular text-gray-600">
              {totalEmpresas === 1 ? 'Empresa / Mayorista' : 'Empresas y Mayoristas'}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-satoshi-regular">
            Facturación comercial con NIT
          </p>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-3 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none font-satoshi-regular transition"
            placeholder="Buscar por Nombre, NIT, Ciudad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* CONMUTADOR DE VISTA DE CLIENTES */}
          <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200 shrink-0">
            <button
              type="button"
              onClick={() => setViewModeClientes('TARJETAS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition flex items-center gap-1.5 ${
                viewModeClientes === 'TARJETAS' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Vista Tarjetas</span>
            </button>

            <button
              type="button"
              onClick={() => setViewModeClientes('LISTA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition flex items-center gap-1.5 ${
                viewModeClientes === 'LISTA' ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span>Vista Lista</span>
            </button>
          </div>

          {/* PILLS DE FILTRADO TIPO */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setFiltroTipo('TODOS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
                filtroTipo === 'TODOS'
                  ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200'
              }`}
            >
              Todos ({clientes.length})
            </button>

            <button
              type="button"
              onClick={() => setFiltroTipo('NATURAL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
                filtroTipo === 'NATURAL'
                  ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200'
              }`}
            >
              Personas ({totalPersonas})
            </button>

            <button
              type="button"
              onClick={() => setFiltroTipo('JURIDICO')}
              className={`px-3.5 py-2 rounded-xl text-xs font-satoshi-black transition ${
                filtroTipo === 'JURIDICO'
                  ? 'bg-[#FFD800] text-[#222222] font-bold shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200'
              }`}
            >
              Empresas ({totalEmpresas})
            </button>
          </div>
        </div>
      </div>

      {/* VISTA 1: TARJETAS (GRID 3 COLUMNAS) */}
      {viewModeClientes === 'TARJETAS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clientesFiltrados.map((c, idx) => {
            const isJuridico = c.tipo_cliente === 'JURIDICO';
            const telClean = String(c.telefono || '').replace(/\D/g, '');

            return (
              <div
                key={c.id_doc || idx}
                className="group relative bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between transition-all duration-300 hover:border-gray-300"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`text-[10px] font-satoshi-black uppercase px-2.5 py-1 rounded-lg tracking-wider font-bold ${
                      isJuridico 
                        ? 'bg-[#222222] text-[#FFD800]' 
                        : 'bg-gray-100 text-gray-800 border border-gray-200'
                    }`}>
                      {isJuridico ? 'Empresa (NIT)' : 'Persona Natural'}
                    </span>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === c.id_doc ? null : c.id_doc)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>

                      {openMenuId === c.id_doc && (
                        <div ref={menuRef} className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-20">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 font-satoshi-regular flex items-center gap-2"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, c)}
                            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 font-satoshi-regular flex items-center gap-2 border-t border-gray-100"
                          >
                            <svg className="w-3.5 h-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Eliminar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="font-black text-lg text-gray-900 font-satoshi-black uppercase tracking-wide truncate">
                    {c.nombre || c.NOMBRE}
                  </h3>

                  <div className="flex items-center gap-2 mt-1 mb-4">
                    <span className="font-mono text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                      NIT/Doc: {c.nit || c.NIT || 'CF_GENERAL'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopiarNit(e, c.nit || 'CF_GENERAL')}
                      className="text-[10px] text-gray-400 hover:text-gray-700 font-satoshi-regular transition flex items-center gap-1"
                      title="Copiar Documento"
                    >
                      {copiedId === (c.nit || 'CF_GENERAL') ? (
                        <span className="text-emerald-600 font-bold">✓ Copiado</span>
                      ) : (
                        <>
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-gray-500 font-satoshi-regular">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm0 6a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2zm0 6a2 2 0 012-2h32a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z" />
                      </svg>
                      <span className="font-mono text-gray-700">{formatTelefono(c.telefono)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{c.email || c.EMAIL || 'Sin correo registrado'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{c.direccion || 'General'} - {c.ciudad || 'Colombia'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                  {telClean ? (
                    <a
                      href={`https://api.whatsapp.com/send?phone=${telClean}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-emerald-600 hover:underline font-satoshi-black text-xs flex items-center gap-1.5 font-bold"
                    >
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>WhatsApp</span>
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs font-satoshi-regular">Sin WhatsApp</span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(c)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300 font-satoshi-black px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5"
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
            <div className="col-span-full text-center py-16 bg-white border border-gray-200 rounded-2xl text-gray-500 text-xs font-satoshi-regular">
              No se encontraron clientes que coincidan con la búsqueda o filtro seleccionado.
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: LISTA / TABLA DE CLIENTES */}
      {viewModeClientes === 'LISTA' && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 text-[11px] font-satoshi-black text-gray-600 uppercase border-b border-gray-200">
                <th className="p-4 rounded-tl-2xl">Cliente / Razón Social</th>
                <th className="p-4">NIT / Cédula</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Teléfono</th>
                <th className="p-4">Correo Electrónico</th>
                <th className="p-4">Ubicación</th>
                <th className="p-4 text-center rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-satoshi-regular text-gray-800">
              {clientesFiltrados.map((c, idx) => {
                const isJuridico = c.tipo_cliente === 'JURIDICO';
                const telClean = String(c.telefono || '').replace(/\D/g, '');

                return (
                  <tr key={c.id_doc || idx} className="hover:bg-gray-50/50 transition">
                    <td className="p-4 font-satoshi-black text-gray-900 uppercase font-bold">{c.nombre || c.NOMBRE}</td>
                    <td className="p-4 font-mono text-gray-700">{c.nit || c.NIT || 'CF_GENERAL'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-satoshi-black font-bold ${
                        isJuridico ? 'bg-[#222222] text-[#FFD800]' : 'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}>
                        {isJuridico ? 'Empresa' : 'Persona'}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-gray-700">{formatTelefono(c.telefono)}</td>
                    <td className="p-4 text-gray-600">{c.email || c.EMAIL || 'N/A'}</td>
                    <td className="p-4 text-gray-600">{c.direccion || 'General'} ({c.ciudad || 'Colombia'})</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {telClean && (
                          <a
                            href={`https://api.whatsapp.com/send?phone=${telClean}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-satoshi-black hover:bg-emerald-100 transition font-bold"
                          >
                            WhatsApp
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(c)}
                          className="bg-gray-100 text-gray-900 border border-gray-300 font-satoshi-black px-2.5 py-1 rounded-lg text-xs hover:bg-gray-200 transition font-bold"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, c)}
                          className="bg-red-50 text-red-600 border border-red-200 font-satoshi-black px-2 py-1 rounded-lg text-xs hover:bg-red-100 transition font-bold"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No se encontraron clientes registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL CREAR / EDITAR CLIENTE */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg shadow-2xl font-sans text-gray-800">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
              <h3 className="text-lg font-satoshi-black text-gray-900 uppercase tracking-wide font-bold">
                {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-700 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Nombre Completo / Razón Social *
                </label>
                <input 
                  type="text"
                  className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                  placeholder="Ej: Juan Pérez / Empresa S.A.S."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                    NIT / Cédula
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 font-mono focus:outline-none transition"
                    placeholder="1098765432"
                    value={nit}
                    onChange={(e) => setNit(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                    Tipo de Cliente
                  </label>
                  <select
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 font-satoshi-black focus:outline-none cursor-pointer transition"
                    value={tipoCliente}
                    onChange={(e: any) => setTipoCliente(e.target.value)}
                  >
                    <option value="NATURAL">Persona Natural</option>
                    <option value="JURIDICO">Empresa / Jurídico</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                    Teléfono / Celular
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    placeholder="300 123 4567"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                    Correo Electrónico
                  </label>
                  <input 
                    type="email"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    placeholder="cliente@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                    Dirección
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    placeholder="Calle 10 # 5-20"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1.5">
                    Ciudad
                  </label>
                  <input 
                    type="text"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none font-satoshi-regular transition"
                    placeholder="Cali"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-satoshi-black py-3 rounded-xl text-xs uppercase transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 transition-colors font-bold"
                >
                  {loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear Cliente')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CARGA MASIVA DE CLIENTES VIA CSV */}
      {showModalMasivo && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans text-gray-800">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
              <h3 className="text-lg font-satoshi-black text-gray-900 uppercase tracking-wide font-bold">CARGA MASIVA DE CLIENTES</h3>
              <button onClick={() => setShowModalMasivo(false)} className="text-gray-400 hover:text-gray-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleProcesarCargaMasivaClientes} className="space-y-4">
              {/* PASO 1: DESCARGA DE PLANTILLA */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-700 space-y-3">
                <p className="font-satoshi-black text-gray-900 font-bold">PASO 1: Descarga la plantilla estructurada</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Soporta Nombre, Cédula/NIT, Tipo de Cliente, Teléfono, Correo y Ciudad.
                </p>
                <button 
                  type="button"
                  onClick={handleDescargarPlantillaClientes}
                  className="bg-[#222222] hover:bg-[#333333] text-[#FFD800] font-satoshi-black px-4 py-2.5 rounded-xl text-xs uppercase shadow-sm transition flex items-center gap-2 font-bold"
                >
                  <svg className="w-4 h-4 text-[#FFD800]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>DESCARGAR PLANTILLA CSV</span>
                </button>
              </div>

              {/* PASO 2: SELECCIÓN DE ARCHIVO CON BORDES DISCONTINUOS */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center space-y-2 bg-gray-50 hover:border-[#FFD800] transition cursor-pointer"
              >
                <p className="font-satoshi-black text-xs text-gray-900 font-bold">PASO 2: Adjunta tu archivo (.csv)</p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{fileMasivo ? fileMasivo.name : 'Haz clic para seleccionar archivo (.csv)'}</span>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={(e) => setFileMasivo(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                  required
                />
              </div>

              {/* ACCIONES Y BOTÓN PRINCIPAL */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setShowModalMasivo(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-satoshi-black py-3 rounded-xl text-xs uppercase transition-colors"
                >
                  CANCELAR
                </button>
                <button 
                  type="submit" 
                  disabled={loadingMasivo || !fileMasivo}
                  className="flex-1 bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors font-bold"
                >
                  {loadingMasivo ? 'PROCESANDO...' : 'PROCESAR E INDEXAR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
